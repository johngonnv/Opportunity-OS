import { Router } from "express";
import { db } from "@workspace/db";
import { activitiesTable, contactsTable, organizationsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { type, contactId, organizationId, opportunityId, page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(activitiesTable.workspaceId, workspace.id)];
    if (type) conditions.push(eq(activitiesTable.type, type as any));
    if (contactId) conditions.push(eq(activitiesTable.contactId, contactId));
    if (organizationId) conditions.push(eq(activitiesTable.organizationId, organizationId));
    if (opportunityId) conditions.push(eq(activitiesTable.opportunityId, opportunityId));

    const [activities, totalResult] = await Promise.all([
      db.select().from(activitiesTable)
        .leftJoin(contactsTable, eq(activitiesTable.contactId, contactsTable.id))
        .leftJoin(organizationsTable, eq(activitiesTable.organizationId, organizationsTable.id))
        .where(and(...conditions))
        .orderBy(desc(activitiesTable.occurredAt))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(activitiesTable).where(and(...conditions)),
    ]);

    const result = activities.map(a => ({
      ...a.activities,
      contact: a.contacts,
      organization: a.organizations ? { id: a.organizations.id, name: a.organizations.name, organizationType: a.organizations.organizationType, industry: a.organizations.industry } : null,
    }));

    res.json({ activities: result, total: Number(totalResult[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const [activity] = await db.insert(activitiesTable).values({
      ...req.body,
      workspaceId: workspace.id,
      createdByUserId: user.id,
      occurredAt: req.body.occurredAt ? new Date(req.body.occurredAt) : new Date(),
    }).returning();
    res.status(201).json(activity);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [activity] = await db.update(activitiesTable).set(req.body)
      .where(and(eq(activitiesTable.id, req.params.id), eq(activitiesTable.workspaceId, workspace.id))).returning();
    if (!activity) return res.status(404).json({ error: "Not found" });
    res.json(activity);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    await db.delete(activitiesTable).where(and(eq(activitiesTable.id, req.params.id), eq(activitiesTable.workspaceId, workspace.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

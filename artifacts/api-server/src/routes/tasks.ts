import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, contactsTable, organizationsTable } from "@workspace/db";
import { eq, and, lte, gte, desc, sql, lt } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { status, priority, contactId, organizationId, opportunityId, dueFilter, page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(tasksTable.workspaceId, workspace.id)];
    if (status) conditions.push(eq(tasksTable.status, status as any));
    if (priority) conditions.push(eq(tasksTable.priority, priority as any));
    if (contactId) conditions.push(eq(tasksTable.contactId, contactId));
    if (organizationId) conditions.push(eq(tasksTable.organizationId, organizationId));
    if (opportunityId) conditions.push(eq(tasksTable.opportunityId, opportunityId));

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    if (dueFilter === "today") {
      conditions.push(and(gte(tasksTable.dueDate, startOfToday), lte(tasksTable.dueDate, endOfToday)) as ReturnType<typeof eq>);
    } else if (dueFilter === "overdue") {
      conditions.push(lt(tasksTable.dueDate, startOfToday) as ReturnType<typeof eq>);
      conditions.push(eq(tasksTable.status, "OPEN"));
    }

    const [tasks, totalResult] = await Promise.all([
      db.select().from(tasksTable)
        .leftJoin(contactsTable, eq(tasksTable.contactId, contactsTable.id))
        .leftJoin(organizationsTable, eq(tasksTable.organizationId, organizationsTable.id))
        .where(and(...conditions))
        .orderBy(desc(tasksTable.dueDate))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(tasksTable).where(and(...conditions)),
    ]);

    const result = tasks.map(t => ({
      ...t.tasks,
      contact: t.contacts,
      organization: t.organizations ? { id: t.organizations.id, name: t.organizations.name, organizationType: t.organizations.organizationType, industry: t.organizations.industry } : null,
    }));

    res.json({ tasks: result, total: Number(totalResult[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const [task] = await db.insert(tasksTable).values({ ...req.body, workspaceId: workspace.id, createdByUserId: user.id }).returning();
    res.status(201).json(task);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const task = await db.query.tasksTable.findFirst({
      where: and(eq(tasksTable.id, req.params.id), eq(tasksTable.workspaceId, workspace.id)),
    });
    if (!task) return res.status(404).json({ error: "Not found" });
    res.json(task);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const updateData: Record<string, unknown> = { ...req.body, updatedAt: new Date() };
    if (req.body.status === "COMPLETED" && !req.body.completedAt) {
      updateData.completedAt = new Date();
    }
    const [task] = await db.update(tasksTable).set(updateData)
      .where(and(eq(tasksTable.id, req.params.id), eq(tasksTable.workspaceId, workspace.id))).returning();
    if (!task) return res.status(404).json({ error: "Not found" });
    res.json(task);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    await db.delete(tasksTable).where(and(eq(tasksTable.id, req.params.id), eq(tasksTable.workspaceId, workspace.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

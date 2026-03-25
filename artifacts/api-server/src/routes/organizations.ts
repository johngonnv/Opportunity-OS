import { Router } from "express";
import { db } from "@workspace/db";
import {
  organizationsTable, contactsTable, organizationTagsTable, tagsTable,
  activitiesTable, tasksTable, notesTable, opportunitiesTable
} from "@workspace/db";
import { eq, and, ilike, desc, sql, inArray } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { search, organizationType, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let query = db.select().from(organizationsTable).where(eq(organizationsTable.workspaceId, workspace.id));
    const orgs = await db.select().from(organizationsTable)
      .where(and(
        eq(organizationsTable.workspaceId, workspace.id),
        ...(search ? [ilike(organizationsTable.name, `%${search}%`)] : []),
        ...(organizationType ? [eq(organizationsTable.organizationType, organizationType as any)] : []),
      ))
      .orderBy(desc(organizationsTable.createdAt))
      .limit(limitNum).offset(offset);

    const totalResult = await db.select({ count: sql<number>`count(*)` }).from(organizationsTable)
      .where(and(
        eq(organizationsTable.workspaceId, workspace.id),
        ...(search ? [ilike(organizationsTable.name, `%${search}%`)] : []),
      ));

    const orgIds = orgs.map(o => o.id);
    const tagRows = orgIds.length > 0 ? await db.select({ orgId: organizationTagsTable.organizationId, tag: tagsTable })
      .from(organizationTagsTable).innerJoin(tagsTable, eq(organizationTagsTable.tagId, tagsTable.id))
      .where(inArray(organizationTagsTable.organizationId, orgIds)) : [];

    const tagsByOrg = tagRows.reduce((acc, r) => {
      if (!acc[r.orgId]) acc[r.orgId] = [];
      acc[r.orgId].push(r.tag);
      return acc;
    }, {} as Record<string, any[]>);

    const contactCounts = orgIds.length > 0 ? await db.select({ orgId: contactsTable.organizationId, count: sql<number>`count(*)` })
      .from(contactsTable).where(inArray(contactsTable.organizationId, orgIds)).groupBy(contactsTable.organizationId) : [];
    const countByOrg = contactCounts.reduce((acc, r) => { if (r.orgId) acc[r.orgId] = Number(r.count); return acc; }, {} as Record<string, number>);

    const result = orgs.map(o => ({ ...o, tags: tagsByOrg[o.id] || [], _count: { contacts: countByOrg[o.id] || 0 } }));
    res.json({ organizations: result, total: Number(totalResult[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const { tagIds, ...data } = req.body;
    const [org] = await db.insert(organizationsTable).values({ ...data, workspaceId: workspace.id, ownerUserId: user.id }).returning();
    if (tagIds?.length) {
      await db.insert(organizationTagsTable).values(tagIds.map((tid: string) => ({ organizationId: org.id, tagId: tid })));
    }
    res.status(201).json(org);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await db.query.organizationsTable.findFirst({
      where: and(eq(organizationsTable.id, req.params.id), eq(organizationsTable.workspaceId, workspace.id)),
    });
    if (!org) return res.status(404).json({ error: "Not found" });

    const [tags, contacts, activities, tasks, notes] = await Promise.all([
      db.select({ tag: tagsTable }).from(organizationTagsTable).innerJoin(tagsTable, eq(organizationTagsTable.tagId, tagsTable.id)).where(eq(organizationTagsTable.organizationId, org.id)),
      db.select().from(contactsTable).where(eq(contactsTable.organizationId, org.id)).limit(20),
      db.select().from(activitiesTable).where(eq(activitiesTable.organizationId, org.id)).orderBy(desc(activitiesTable.occurredAt)).limit(20),
      db.select().from(tasksTable).where(eq(tasksTable.organizationId, org.id)).orderBy(desc(tasksTable.createdAt)).limit(20),
      db.select().from(notesTable).where(eq(notesTable.organizationId, org.id)).orderBy(desc(notesTable.createdAt)).limit(20),
    ]);

    res.json({ ...org, tags: tags.map(t => t.tag), contacts, activities, tasks, notes });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { tagIds, ...data } = req.body;
    const [org] = await db.update(organizationsTable).set({ ...data, updatedAt: new Date() })
      .where(and(eq(organizationsTable.id, req.params.id), eq(organizationsTable.workspaceId, workspace.id))).returning();
    if (!org) return res.status(404).json({ error: "Not found" });
    if (tagIds !== undefined) {
      await db.delete(organizationTagsTable).where(eq(organizationTagsTable.organizationId, org.id));
      if (tagIds.length) await db.insert(organizationTagsTable).values(tagIds.map((tid: string) => ({ organizationId: org.id, tagId: tid })));
    }
    res.json(org);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    await db.delete(organizationsTable).where(and(eq(organizationsTable.id, req.params.id), eq(organizationsTable.workspaceId, workspace.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import {
  organizationsTable, contactsTable, organizationTagsTable, tagsTable,
  activitiesTable, tasksTable, notesTable, opportunitiesTable
} from "@workspace/db";
import { eq, and, ilike, desc, sql, inArray, isNull, isNotNull } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

async function wouldCreateCycle(orgId: string, proposedParentId: string): Promise<boolean> {
  if (orgId === proposedParentId) return true;
  let currentId: string | null = proposedParentId;
  for (let i = 0; i < 15; i++) {
    const rows = await db
      .select({ parentId: organizationsTable.parentOrganizationId })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, currentId!))
      .limit(1);
    if (!rows[0] || !rows[0].parentId) break;
    if (rows[0].parentId === orgId) return true;
    currentId = rows[0].parentId;
  }
  return false;
}

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const {
      search, organizationType, level, parentId,
      hasParent, isParent, standalone,
      page = "1", limit = "50"
    } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(organizationsTable.workspaceId, workspace.id)];
    if (search) conditions.push(ilike(organizationsTable.name, `%${search}%`));
    if (organizationType) conditions.push(eq(organizationsTable.organizationType, organizationType as any));
    if (level) conditions.push(eq(organizationsTable.organizationLevel, level as any));
    if (parentId) conditions.push(eq(organizationsTable.parentOrganizationId, parentId));
    if (hasParent === "true") conditions.push(isNotNull(organizationsTable.parentOrganizationId));
    if (standalone === "true") conditions.push(isNull(organizationsTable.parentOrganizationId));
    if (isParent === "true") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM organizations o2 WHERE o2.parent_organization_id = ${organizationsTable.id} AND o2.workspace_id = ${workspace.id})`
      );
    }

    const whereClause = and(...conditions);

    const [orgs, totalResult] = await Promise.all([
      db.select().from(organizationsTable)
        .where(whereClause)
        .orderBy(desc(organizationsTable.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(organizationsTable).where(whereClause),
    ]);

    const orgIds = orgs.map(o => o.id);

    const [tagRows, contactCounts, childCounts, parentRows] = await Promise.all([
      orgIds.length > 0
        ? db.select({ orgId: organizationTagsTable.organizationId, tag: tagsTable })
          .from(organizationTagsTable).innerJoin(tagsTable, eq(organizationTagsTable.tagId, tagsTable.id))
          .where(inArray(organizationTagsTable.organizationId, orgIds))
        : Promise.resolve([]),
      orgIds.length > 0
        ? db.select({ orgId: contactsTable.organizationId, count: sql<number>`count(*)` })
          .from(contactsTable).where(inArray(contactsTable.organizationId, orgIds)).groupBy(contactsTable.organizationId)
        : Promise.resolve([]),
      orgIds.length > 0
        ? db.select({ parentId: organizationsTable.parentOrganizationId, count: sql<number>`count(*)` })
          .from(organizationsTable)
          .where(and(isNotNull(organizationsTable.parentOrganizationId), inArray(organizationsTable.parentOrganizationId, orgIds)))
          .groupBy(organizationsTable.parentOrganizationId)
        : Promise.resolve([]),
      (() => {
        const parentIds = orgs.filter(o => o.parentOrganizationId).map(o => o.parentOrganizationId!);
        return parentIds.length > 0
          ? db.select({ id: organizationsTable.id, name: organizationsTable.name })
            .from(organizationsTable).where(inArray(organizationsTable.id, parentIds))
          : Promise.resolve([]);
      })(),
    ]);

    const tagsByOrg = tagRows.reduce((acc, r) => {
      if (!acc[r.orgId]) acc[r.orgId] = [];
      acc[r.orgId].push(r.tag);
      return acc;
    }, {} as Record<string, any[]>);

    const countByOrg = contactCounts.reduce((acc, r) => {
      if (r.orgId) acc[r.orgId] = Number(r.count);
      return acc;
    }, {} as Record<string, number>);

    const childCountByOrg = childCounts.reduce((acc, r) => {
      if (r.parentId) acc[r.parentId] = Number(r.count);
      return acc;
    }, {} as Record<string, number>);

    const parentNamesById = parentRows.reduce((acc, p) => {
      acc[p.id] = p.name;
      return acc;
    }, {} as Record<string, string>);

    const result = orgs.map(o => ({
      ...o,
      tags: tagsByOrg[o.id] || [],
      _count: {
        contacts: countByOrg[o.id] || 0,
        children: childCountByOrg[o.id] || 0,
      },
      parentName: o.parentOrganizationId ? (parentNamesById[o.parentOrganizationId] ?? null) : null,
    }));

    res.json({ organizations: result, total: Number(totalResult[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const { tagIds, force, ...data } = req.body;

    if (!force && data.name?.trim()) {
      const existing = await db.select({ id: organizationsTable.id, name: organizationsTable.name })
        .from(organizationsTable)
        .where(and(
          eq(organizationsTable.workspaceId, workspace.id),
          ilike(organizationsTable.name, data.name.trim()),
        ))
        .limit(1);
      if (existing.length > 0) {
        return res.status(409).json({
          error: "DUPLICATE",
          message: `An organization named "${existing[0].name}" already exists.`,
          existing: existing[0],
        });
      }
    }

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

    const childOrgs = await db
      .select({
        id: organizationsTable.id,
        name: organizationsTable.name,
        organizationType: organizationsTable.organizationType,
        organizationLevel: organizationsTable.organizationLevel,
        city: organizationsTable.city,
        state: organizationsTable.state,
      })
      .from(organizationsTable)
      .where(and(
        eq(organizationsTable.parentOrganizationId, org.id),
        eq(organizationsTable.workspaceId, workspace.id),
      ))
      .orderBy(organizationsTable.name);

    const childIds = childOrgs.map(c => c.id);
    const allOrgIds = [org.id, ...childIds];

    const [parentOrgRows, tags, contacts, activities, tasks, notes, contactRollup, oppRollup] = await Promise.all([
      org.parentOrganizationId
        ? db.select({
          id: organizationsTable.id,
          name: organizationsTable.name,
          organizationType: organizationsTable.organizationType,
          organizationLevel: organizationsTable.organizationLevel,
        }).from(organizationsTable).where(eq(organizationsTable.id, org.parentOrganizationId)).limit(1)
        : Promise.resolve([]),
      db.select({ tag: tagsTable }).from(organizationTagsTable).innerJoin(tagsTable, eq(organizationTagsTable.tagId, tagsTable.id)).where(eq(organizationTagsTable.organizationId, org.id)),
      db.select().from(contactsTable).where(eq(contactsTable.organizationId, org.id)).limit(20),
      db.select().from(activitiesTable).where(eq(activitiesTable.organizationId, org.id)).orderBy(desc(activitiesTable.occurredAt)).limit(20),
      db.select().from(tasksTable).where(eq(tasksTable.organizationId, org.id)).orderBy(desc(tasksTable.createdAt)).limit(20),
      db.select().from(notesTable).where(eq(notesTable.organizationId, org.id)).orderBy(desc(notesTable.createdAt)).limit(20),
      db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(inArray(contactsTable.organizationId, allOrgIds)),
      db.select({ count: sql<number>`count(*)` }).from(opportunitiesTable).where(inArray(opportunitiesTable.organizationId, allOrgIds)),
    ]);

    res.json({
      ...org,
      parentOrg: parentOrgRows[0] ?? null,
      children: childOrgs,
      rollup: {
        childCount: childIds.length,
        totalContacts: Number(contactRollup[0]?.count ?? 0),
        totalOpportunities: Number(oppRollup[0]?.count ?? 0),
      },
      tags: tags.map(t => t.tag),
      contacts,
      activities,
      tasks,
      notes,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { tagIds, ...data } = req.body;

    if (data.parentOrganizationId !== undefined && data.parentOrganizationId !== null) {
      if (data.parentOrganizationId === req.params.id) {
        return res.status(400).json({ error: "An organization cannot be its own parent" });
      }
      const cycle = await wouldCreateCycle(req.params.id, data.parentOrganizationId);
      if (cycle) {
        return res.status(400).json({ error: "This would create a circular reference in the hierarchy" });
      }
    }

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

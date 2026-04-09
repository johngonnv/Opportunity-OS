import { Router } from "express";
import { db } from "@workspace/db";
import {
  organizationsTable, contactsTable, organizationTagsTable, tagsTable,
  activitiesTable, tasksTable, notesTable, opportunitiesTable, pipelineStagesTable,
  opportunityContactsTable
} from "@workspace/db";
import { eq, and, ilike, desc, asc, sql, inArray, isNull, isNotNull, gte } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { runOrgIntelligence, type ContactData, type OpenOpportunity, type ActivityData, type TaskData } from "../lib/orgIntelligence";
import { enqueuePromotion } from "../lib/promotionQueue";

const router = Router();

async function wouldCreateCycle(orgId: string, proposedParentId: string, workspaceId: string): Promise<boolean> {
  if (orgId === proposedParentId) return true;
  const visited = new Set<string>();
  let currentId: string | null = proposedParentId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const rows = await db
      .select({ parentId: organizationsTable.parentOrganizationId })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, currentId), eq(organizationsTable.workspaceId, workspaceId)))
      .limit(1);
    if (!rows[0] || !rows[0].parentId) break;
    if (rows[0].parentId === orgId) return true;
    currentId = rows[0].parentId;
  }
  return false;
}

async function computeUltimateParent(parentId: string | null, workspaceId: string): Promise<string | null> {
  if (!parentId) return null;
  const visited = new Set<string>();
  let currentId = parentId;
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const rows = await db
      .select({ id: organizationsTable.id, parentId: organizationsTable.parentOrganizationId })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, currentId), eq(organizationsTable.workspaceId, workspaceId)))
      .limit(1);
    if (!rows[0]) break;
    if (!rows[0].parentId) return rows[0].id;
    currentId = rows[0].parentId;
  }
  return currentId;
}

async function validateParentInWorkspace(parentId: string, workspaceId: string): Promise<boolean> {
  const rows = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(and(eq(organizationsTable.id, parentId), eq(organizationsTable.workspaceId, workspaceId)))
    .limit(1);
  return rows.length > 0;
}

async function propagateUltimateParent(orgId: string, ultimateParentId: string | null, workspaceId: string): Promise<void> {
  const descendantIds = await getDescendantIds(orgId, workspaceId);
  if (descendantIds.length === 0) return;
  await db.update(organizationsTable)
    .set({ ultimateParentOrganizationId: ultimateParentId, updatedAt: new Date() })
    .where(and(inArray(organizationsTable.id, descendantIds), eq(organizationsTable.workspaceId, workspaceId)));
}

async function getDescendantIds(orgId: string, workspaceId: string): Promise<string[]> {
  const result: string[] = [];
  const queue = [orgId];
  for (let depth = 0; depth < 10 && queue.length > 0; depth++) {
    const batch = queue.splice(0, queue.length);
    const children = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(and(
        inArray(organizationsTable.parentOrganizationId, batch),
        eq(organizationsTable.workspaceId, workspaceId),
      ));
    for (const c of children) {
      result.push(c.id);
      queue.push(c.id);
    }
  }
  return result;
}

function buildOrgOrderBy(sortBy: string, sortOrder: string) {
  const dir = sortOrder === "asc" ? asc : desc;
  switch (sortBy) {
    case "name":       return dir(organizationsTable.name);
    case "updatedAt":  return dir(organizationsTable.updatedAt);
    case "city":       return dir(organizationsTable.city);
    case "state":      return dir(organizationsTable.state);
    case "organizationType": return dir(organizationsTable.organizationType);
    case "createdAt":
    default:           return dir(organizationsTable.createdAt);
  }
}

function buildOrgFilterConditions(filters: string[], workspaceId: string) {
  const conds: ReturnType<typeof sql>[] = [];
  for (const f of filters) {
    switch (f) {
      case "hasContacts":
        conds.push(sql`EXISTS (SELECT 1 FROM contacts c WHERE c.organization_id = organizations.id)`);
        break;
      case "noContacts":
        conds.push(sql`NOT EXISTS (SELECT 1 FROM contacts c WHERE c.organization_id = organizations.id)`);
        break;
      case "hasOpenOpps":
        conds.push(sql`EXISTS (SELECT 1 FROM opportunities o WHERE o.organization_id = organizations.id AND o.status = 'OPEN')`);
        break;
      case "hasWonOpps":
        conds.push(sql`EXISTS (SELECT 1 FROM opportunities o WHERE o.organization_id = organizations.id AND o.status = 'WON')`);
        break;
      case "noOpps":
        conds.push(sql`NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.organization_id = organizations.id)`);
        break;
      case "stale30":
        conds.push(sql`NOT EXISTS (
          SELECT 1 FROM activities a
          WHERE a.organization_id = organizations.id
            AND a.occurred_at > NOW() - INTERVAL '30 days'
        )`);
        break;
      case "stale90":
        conds.push(sql`NOT EXISTS (
          SELECT 1 FROM activities a
          WHERE a.organization_id = organizations.id
            AND a.occurred_at > NOW() - INTERVAL '90 days'
        )`);
        break;
      case "missingWebsite":
        conds.push(sql`(${organizationsTable.website} IS NULL OR ${organizationsTable.website} = '')`);
        break;
      case "missingPhone":
        conds.push(sql`(${organizationsTable.phone} IS NULL OR ${organizationsTable.phone} = '')`);
        break;
      case "missingVertical":
        conds.push(sql`${organizationsTable.vertical} IS NULL`);
        break;
      case "missingStructure":
        conds.push(sql`${organizationsTable.accountStructureType} IS NULL`);
        break;
    }
  }
  return conds;
}

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const {
      search, organizationType, level, accountStructureType,
      vertical, parentId, ultimateParentId,
      hasParent, isParent, standalone,
      msaStatus, systemPriorityTier, expansionMaturity, expansionStrategy,
      outreachOwnerUserId, subVertical,
      sortBy = "createdAt", sortOrder = "desc",
      filter = "", tag = "",
      page = "1", limit = "50"
    } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(organizationsTable.workspaceId, workspace.id)];
    if (search) conditions.push(ilike(organizationsTable.name, `%${search}%`));
    if (organizationType) conditions.push(eq(organizationsTable.organizationType, organizationType as any));
    if (level) conditions.push(eq(organizationsTable.organizationLevel, level as any));
    if (accountStructureType) conditions.push(eq(organizationsTable.accountStructureType, accountStructureType as any));
    if (vertical) conditions.push(eq(organizationsTable.vertical, vertical as any));
    if (subVertical) conditions.push(ilike(organizationsTable.subVertical!, `%${subVertical}%`));
    if (parentId) conditions.push(eq(organizationsTable.parentOrganizationId, parentId));
    if (ultimateParentId) conditions.push(eq(organizationsTable.ultimateParentOrganizationId, ultimateParentId));
    if (hasParent === "true") conditions.push(isNotNull(organizationsTable.parentOrganizationId));
    if (standalone === "true") conditions.push(isNull(organizationsTable.parentOrganizationId));
    if (msaStatus) conditions.push(eq(organizationsTable.msaStatus, msaStatus));
    if (systemPriorityTier) conditions.push(eq(organizationsTable.systemPriorityTier, systemPriorityTier));
    if (expansionMaturity) conditions.push(eq(organizationsTable.expansionMaturity, expansionMaturity));
    if (expansionStrategy) conditions.push(eq(organizationsTable.expansionStrategy, expansionStrategy));
    if (outreachOwnerUserId) conditions.push(eq(organizationsTable.outreachOwnerUserId, outreachOwnerUserId));
    if (isParent === "true") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM organizations o2 WHERE o2.parent_organization_id = ${organizationsTable.id} AND o2.workspace_id = ${workspace.id})`
      );
    }

    const activeFilters = filter ? filter.split(",").map(f => f.trim()).filter(Boolean) : [];
    const filterConds = buildOrgFilterConditions(activeFilters, workspace.id);

    const tagFilterConds: ReturnType<typeof sql>[] = [];
    if (tag) {
      tagFilterConds.push(sql`EXISTS (
        SELECT 1 FROM organization_tags ot
        INNER JOIN tags tg ON ot.tag_id = tg.id
        WHERE ot.organization_id = organizations.id
          AND LOWER(tg.name) = LOWER(${tag})
      )`);
    }

    const whereClause = and(...conditions, ...filterConds as any[], ...tagFilterConds as any[]);

    const [orgs, totalResult] = await Promise.all([
      db.select().from(organizationsTable)
        .where(whereClause)
        .orderBy(buildOrgOrderBy(sortBy, sortOrder))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(organizationsTable).where(whereClause),
    ]);

    const orgIds = orgs.map(o => o.id);

    const [tagRows, contactCounts, childCounts, parentRows, oppStats] = await Promise.all([
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
        const pIds = orgs.filter(o => o.parentOrganizationId).map(o => o.parentOrganizationId!);
        return pIds.length > 0
          ? db.select({ id: organizationsTable.id, name: organizationsTable.name })
            .from(organizationsTable).where(inArray(organizationsTable.id, pIds))
          : Promise.resolve([]);
      })(),
      orgIds.length > 0
        ? db.select({
          orgId: opportunitiesTable.organizationId,
          openCount: sql<number>`count(*) filter (where ${opportunitiesTable.status} = 'OPEN')`,
          wonCount: sql<number>`count(*) filter (where ${opportunitiesTable.status} = 'WON')`,
          pipelineValue: sql<number>`coalesce(sum(${opportunitiesTable.valueEstimate}) filter (where ${opportunitiesTable.status} = 'OPEN'), 0)`,
        }).from(opportunitiesTable)
          .where(inArray(opportunitiesTable.organizationId, orgIds))
          .groupBy(opportunitiesTable.organizationId)
        : Promise.resolve([]),
    ]);

    const tagsByOrg = tagRows.reduce((acc, r) => {
      if (!acc[r.orgId]) acc[r.orgId] = [];
      acc[r.orgId].push(r.tag);
      return acc;
    }, {} as Record<string, any[]>);
    const countByOrg = contactCounts.reduce((acc, r) => { if (r.orgId) acc[r.orgId] = Number(r.count); return acc; }, {} as Record<string, number>);
    const childCountByOrg = childCounts.reduce((acc, r) => { if (r.parentId) acc[r.parentId] = Number(r.count); return acc; }, {} as Record<string, number>);
    const parentNamesById = parentRows.reduce((acc, p) => { acc[p.id] = p.name; return acc; }, {} as Record<string, string>);
    const oppByOrg = oppStats.reduce((acc, r) => {
      if (r.orgId) acc[r.orgId] = { openOpportunities: Number(r.openCount), wonOpportunities: Number(r.wonCount), pipelineValue: Number(r.pipelineValue) };
      return acc;
    }, {} as Record<string, any>);

    const result = orgs.map(o => ({
      ...o,
      tags: tagsByOrg[o.id] || [],
      _count: {
        contacts: countByOrg[o.id] || 0,
        children: childCountByOrg[o.id] || 0,
      },
      _opp: oppByOrg[o.id] || { openOpportunities: 0, wonOpportunities: 0, pipelineValue: 0 },
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
        .where(and(eq(organizationsTable.workspaceId, workspace.id), ilike(organizationsTable.name, data.name.trim())))
        .limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: "DUPLICATE", message: `An organization named "${existing[0].name}" already exists.`, existing: existing[0] });
      }
    }

    if (data.parentOrganizationId) {
      const parentValid = await validateParentInWorkspace(data.parentOrganizationId, workspace.id);
      if (!parentValid) return res.status(400).json({ error: "Parent organization not found in this workspace" });
      data.ultimateParentOrganizationId = await computeUltimateParent(data.parentOrganizationId, workspace.id);
    }

    const [org] = await db.insert(organizationsTable).values({ ...data, workspaceId: workspace.id, ownerUserId: user.id }).returning();
    if (tagIds?.length) {
      await db.insert(organizationTagsTable).values(tagIds.map((tid: string) => ({ organizationId: org.id, tagId: tid })));
    }
    await enqueuePromotion("ORG", org.id, workspace.id, "CREATED", {
      name: org.name, legalName: org.legalName, website: org.website,
      websiteDomain: org.websiteDomain, phone: org.phone, email: org.email,
      organizationType: org.organizationType, industry: org.industry, vertical: org.vertical,
      city: org.city, state: org.state, country: org.country, workspaceId: workspace.id,
    });
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
        id: organizationsTable.id, name: organizationsTable.name,
        organizationType: organizationsTable.organizationType,
        accountStructureType: organizationsTable.accountStructureType,
        vertical: organizationsTable.vertical,
        city: organizationsTable.city, state: organizationsTable.state,
      })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.parentOrganizationId, org.id), eq(organizationsTable.workspaceId, workspace.id)))
      .orderBy(organizationsTable.name);

    const childIds = childOrgs.map(c => c.id);
    const allDescendantIds = await getDescendantIds(org.id, workspace.id);
    const allOrgIds = [org.id, ...allDescendantIds];

    const [
      parentOrgRows, ultimateParentRows,
      tags, contacts, activities, tasks, notes,
      contactRollup, oppRollup, lastActRow,
      activePipelineChildren, closedWonChildren,
    ] = await Promise.all([
      org.parentOrganizationId
        ? db.select({ id: organizationsTable.id, name: organizationsTable.name, organizationType: organizationsTable.organizationType, accountStructureType: organizationsTable.accountStructureType, vertical: organizationsTable.vertical })
          .from(organizationsTable).where(eq(organizationsTable.id, org.parentOrganizationId)).limit(1)
        : Promise.resolve([]),
      org.ultimateParentOrganizationId && org.ultimateParentOrganizationId !== org.parentOrganizationId
        ? db.select({ id: organizationsTable.id, name: organizationsTable.name })
          .from(organizationsTable).where(eq(organizationsTable.id, org.ultimateParentOrganizationId)).limit(1)
        : Promise.resolve([]),
      db.select({ tag: tagsTable }).from(organizationTagsTable).innerJoin(tagsTable, eq(organizationTagsTable.tagId, tagsTable.id)).where(eq(organizationTagsTable.organizationId, org.id)),
      db.select().from(contactsTable).where(eq(contactsTable.organizationId, org.id)).limit(20),
      db.select().from(activitiesTable).where(eq(activitiesTable.organizationId, org.id)).orderBy(desc(activitiesTable.occurredAt)).limit(20),
      db.select().from(tasksTable).where(eq(tasksTable.organizationId, org.id)).orderBy(desc(tasksTable.createdAt)).limit(20),
      db.select().from(notesTable).where(eq(notesTable.organizationId, org.id)).orderBy(desc(notesTable.createdAt)).limit(20),
      db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(inArray(contactsTable.organizationId, allOrgIds)),
      db.select({
        total: sql<number>`count(*)`,
        open: sql<number>`count(*) filter (where ${opportunitiesTable.status} = 'OPEN')`,
        won: sql<number>`count(*) filter (where ${opportunitiesTable.status} = 'WON')`,
        pipelineValue: sql<number>`coalesce(sum(${opportunitiesTable.valueEstimate}) filter (where ${opportunitiesTable.status} = 'OPEN'), 0)`,
        wonValue: sql<number>`coalesce(sum(${opportunitiesTable.valueEstimate}) filter (where ${opportunitiesTable.status} = 'WON'), 0)`,
      }).from(opportunitiesTable).where(inArray(opportunitiesTable.organizationId, allOrgIds)),
      db.select({ lastDate: sql<string>`max(${activitiesTable.occurredAt})` })
        .from(activitiesTable).where(inArray(activitiesTable.organizationId, allOrgIds)),
      childIds.length > 0
        ? db.select({ orgId: opportunitiesTable.organizationId })
          .from(opportunitiesTable)
          .where(and(inArray(opportunitiesTable.organizationId, childIds), eq(opportunitiesTable.status, "OPEN" as any)))
          .groupBy(opportunitiesTable.organizationId)
        : Promise.resolve([]),
      childIds.length > 0
        ? db.select({ orgId: opportunitiesTable.organizationId })
          .from(opportunitiesTable)
          .where(and(inArray(opportunitiesTable.organizationId, childIds), eq(opportunitiesTable.status, "WON" as any)))
          .groupBy(opportunitiesTable.organizationId)
        : Promise.resolve([]),
    ]);

    const oppData = oppRollup[0] || { total: 0, open: 0, won: 0, pipelineValue: 0, wonValue: 0 };

    res.json({
      ...org,
      parentOrg: parentOrgRows[0] ?? null,
      ultimateParentOrg: ultimateParentRows[0] ?? null,
      children: childOrgs,
      rollup: {
        childCount: childIds.length,
        totalDescendants: allDescendantIds.length,
        totalContacts: Number(contactRollup[0]?.count ?? 0),
        totalOpportunities: Number(oppData.total),
        openOpportunities: Number(oppData.open),
        wonOpportunities: Number(oppData.won),
        pipelineValue: Number(oppData.pipelineValue),
        wonValue: Number(oppData.wonValue),
        activePipelineChildCount: activePipelineChildren.length,
        closedWonChildCount: closedWonChildren.length,
        lastActivityDate: lastActRow[0]?.lastDate ?? null,
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
      const parentValid = await validateParentInWorkspace(data.parentOrganizationId, workspace.id);
      if (!parentValid) return res.status(400).json({ error: "Parent organization not found in this workspace" });
      const cycle = await wouldCreateCycle(req.params.id, data.parentOrganizationId, workspace.id);
      if (cycle) {
        return res.status(400).json({ error: "This would create a circular reference in the hierarchy" });
      }
      data.ultimateParentOrganizationId = await computeUltimateParent(data.parentOrganizationId, workspace.id);
    } else if (data.parentOrganizationId === null) {
      data.ultimateParentOrganizationId = null;
    }

    const [org] = await db.update(organizationsTable).set({ ...data, updatedAt: new Date() })
      .where(and(eq(organizationsTable.id, req.params.id), eq(organizationsTable.workspaceId, workspace.id))).returning();
    if (!org) return res.status(404).json({ error: "Not found" });

    if (data.parentOrganizationId !== undefined) {
      const newUltimate = data.ultimateParentOrganizationId || req.params.id;
      await propagateUltimateParent(req.params.id, data.parentOrganizationId === null ? null : newUltimate, workspace.id);
    }
    if (tagIds !== undefined) {
      await db.delete(organizationTagsTable).where(eq(organizationTagsTable.organizationId, org.id));
      if (tagIds.length) await db.insert(organizationTagsTable).values(tagIds.map((tid: string) => ({ organizationId: org.id, tagId: tid })));
    }
    await enqueuePromotion("ORG", org.id, workspace.id, "UPDATED", {
      name: org.name, legalName: org.legalName, website: org.website,
      websiteDomain: org.websiteDomain, phone: org.phone, email: org.email,
      organizationType: org.organizationType, industry: org.industry, vertical: org.vertical,
      city: org.city, state: org.state, country: org.country, workspaceId: workspace.id,
    });
    res.json(org);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/link-child", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const parentId = req.params.id;
    const { childId } = req.body;
    if (!childId) return res.status(400).json({ error: "childId is required" });
    if (childId === parentId) return res.status(400).json({ error: "An organization cannot be its own child" });
    const childValid = await validateParentInWorkspace(childId, workspace.id);
    if (!childValid) return res.status(404).json({ error: "Child organization not found in this workspace" });
    const cycle = await wouldCreateCycle(childId, parentId, workspace.id);
    if (cycle) return res.status(400).json({ error: "This would create a circular reference" });

    const ultimateParentId = await computeUltimateParent(parentId, workspace.id);
    const [updated] = await db.update(organizationsTable)
      .set({ parentOrganizationId: parentId, ultimateParentOrganizationId: ultimateParentId || parentId, updatedAt: new Date() })
      .where(and(eq(organizationsTable.id, childId), eq(organizationsTable.workspaceId, workspace.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Child org not found" });
    await propagateUltimateParent(childId, ultimateParentId || parentId, workspace.id);
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/unlink-child", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { childId } = req.body;
    if (!childId) return res.status(400).json({ error: "childId is required" });
    const [updated] = await db.update(organizationsTable)
      .set({ parentOrganizationId: null, ultimateParentOrganizationId: null, updatedAt: new Date() })
      .where(and(eq(organizationsTable.id, childId), eq(organizationsTable.parentOrganizationId, req.params.id), eq(organizationsTable.workspaceId, workspace.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Child not found or not linked to this parent" });
    await propagateUltimateParent(childId, null, workspace.id);
    res.json(updated);
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

// ── GET /:id/intelligence ────────────────────────────────────────────────────

router.get("/:id/intelligence", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const orgId = req.params.id;

    const org = await db.query.organizationsTable.findFirst({
      where: and(eq(organizationsTable.id, orgId), eq(organizationsTable.workspaceId, workspace.id)),
    });
    if (!org) return res.status(404).json({ error: "Not found" });

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);

    const [rawContacts, rawOpps, rawActivities, rawTasks, contactOppLinks] = await Promise.all([
      db.select().from(contactsTable)
        .where(and(
          eq(contactsTable.workspaceId, workspace.id),
          eq(contactsTable.organizationId, orgId),
        )),

      db.select({
        id: opportunitiesTable.id,
        title: opportunitiesTable.title,
        pipelineStageId: opportunitiesTable.pipelineStageId,
        probability: pipelineStagesTable.probabilityPercent,
        stageName: pipelineStagesTable.name,
        valueEstimate: opportunitiesTable.valueEstimate,
        stageEnteredAt: opportunitiesTable.stageEnteredAt,
        updatedAt: opportunitiesTable.updatedAt,
      })
        .from(opportunitiesTable)
        .innerJoin(pipelineStagesTable, eq(opportunitiesTable.pipelineStageId, pipelineStagesTable.id))
        .where(and(
          eq(opportunitiesTable.workspaceId, workspace.id),
          eq(opportunitiesTable.organizationId, orgId),
          sql`${opportunitiesTable.status} = 'OPEN'`,
        )),

      db.select({
        id: activitiesTable.id,
        occurredAt: activitiesTable.occurredAt,
        contactId: activitiesTable.contactId,
      })
        .from(activitiesTable)
        .where(and(
          eq(activitiesTable.workspaceId, workspace.id),
          eq(activitiesTable.organizationId, orgId),
          gte(activitiesTable.occurredAt, ninetyDaysAgo),
        ))
        .orderBy(desc(activitiesTable.occurredAt)),

      db.select({
        id: tasksTable.id,
        title: tasksTable.title,
        dueDate: tasksTable.dueDate,
        status: tasksTable.status,
        contactId: tasksTable.contactId,
      })
        .from(tasksTable)
        .where(and(
          eq(tasksTable.workspaceId, workspace.id),
          eq(tasksTable.organizationId, orgId),
          sql`${tasksTable.status} IN ('OPEN','IN_PROGRESS')`,
        )),

      db.select({
        contactId: opportunityContactsTable.contactId,
        opportunityId: opportunityContactsTable.opportunityId,
      })
        .from(opportunityContactsTable)
        .innerJoin(opportunitiesTable, and(
          eq(opportunityContactsTable.opportunityId, opportunitiesTable.id),
          eq(opportunitiesTable.workspaceId, workspace.id),
          eq(opportunitiesTable.organizationId, orgId),
          sql`${opportunitiesTable.status} = 'OPEN'`,
        )),
    ]);

    const contactIdsOnOpenOpp = new Set(contactOppLinks.map(r => r.contactId).filter(Boolean));

    const activityCountByContact: Record<string, number> = {};
    const lastActivityByContact: Record<string, Date> = {};
    for (const a of rawActivities) {
      if (a.contactId) {
        activityCountByContact[a.contactId] = (activityCountByContact[a.contactId] ?? 0) + 1;
        if (!lastActivityByContact[a.contactId] || a.occurredAt > lastActivityByContact[a.contactId]) {
          lastActivityByContact[a.contactId] = a.occurredAt;
        }
      }
    }

    const overdueContactIds = new Set(
      rawTasks
        .filter(t => t.contactId && t.dueDate && (Date.now() - t.dueDate.getTime()) >= 14 * 86_400_000)
        .map(t => t.contactId!)
    );

    const contacts: ContactData[] = rawContacts.map(c => ({
      id: c.id,
      fullName: c.fullName,
      title: c.title ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      mobile: c.mobile ?? null,
      stakeholderRole: c.stakeholderRole ?? null,
      influenceLevel: c.influenceLevel ?? null,
      relationshipStrength: c.relationshipStrength ?? null,
      relationshipStrengthLabel: c.relationshipStrengthLabel ?? null,
      isPrimaryRelationship: c.isPrimaryRelationship,
      roleNotes: c.roleNotes ?? null,
      activityCount: activityCountByContact[c.id] ?? 0,
      lastEngagementAt: lastActivityByContact[c.id] ?? null,
      isOnOpenOpp: contactIdsOnOpenOpp.has(c.id),
      hasOverdueTask: overdueContactIds.has(c.id),
    }));

    const openOpps: OpenOpportunity[] = rawOpps.map(o => {
      const referenceDate = o.stageEnteredAt ?? o.updatedAt;
      const daysInStage = Math.floor((Date.now() - referenceDate.getTime()) / 86_400_000);
      return {
        id: o.id,
        title: o.title,
        stage: o.pipelineStageId,
        stageName: o.stageName,
        probability: o.probability,
        valueEstimate: o.valueEstimate ?? null,
        daysInStage,
      };
    });

    const recentActivities: ActivityData[] = rawActivities.map(a => ({
      occurredAt: a.occurredAt,
      contactId: a.contactId ?? null,
    }));

    const openTasks: TaskData[] = rawTasks.map(t => ({
      dueDate: t.dueDate ?? null,
      status: t.status,
      title: t.title,
      contactId: t.contactId ?? null,
    }));

    const intelligence = runOrgIntelligence(contacts, openOpps, recentActivities, openTasks);

    res.json(intelligence);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

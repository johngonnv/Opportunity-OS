import { Router } from "express";
import { db } from "@workspace/db";
import {
  contactsTable, organizationsTable, contactTagsTable, tagsTable,
  activitiesTable, tasksTable, notesTable, opportunityContactsTable, opportunitiesTable, businessCardsTable
} from "@workspace/db";
import { eq, and, ilike, or, desc, asc, sql, inArray, isNull, isNotNull } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { enqueuePromotion } from "../lib/promotionQueue";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function buildOrderBy(sortBy: string, sortOrder: string) {
  const dir = sortOrder === "asc" ? asc : desc;
  switch (sortBy) {
    case "fullName":   return dir(contactsTable.fullName);
    case "updatedAt":  return dir(contactsTable.updatedAt);
    case "source":     return dir(contactsTable.source);
    case "status":     return dir(contactsTable.status);
    case "createdAt":
    default:           return dir(contactsTable.createdAt);
  }
}

function buildFilterConditions(filters: string[], workspaceId: string) {
  const conds: ReturnType<typeof sql>[] = [];
  for (const f of filters) {
    switch (f) {
      case "noTask":
        conds.push(sql`NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.contact_id = contacts.id
            AND t.status IN ('OPEN','IN_PROGRESS')
        )`);
        break;
      case "stale7":
        conds.push(sql`NOT EXISTS (
          SELECT 1 FROM activities a
          WHERE a.contact_id = contacts.id
            AND a.occurred_at > NOW() - INTERVAL '7 days'
        )`);
        break;
      case "stale30":
        conds.push(sql`NOT EXISTS (
          SELECT 1 FROM activities a
          WHERE a.contact_id = contacts.id
            AND a.occurred_at > NOW() - INTERVAL '30 days'
        )`);
        break;
      case "noOrg":
        conds.push(sql`${contactsTable.organizationId} IS NULL`);
        break;
      case "missingEmail":
        conds.push(sql`(${contactsTable.email} IS NULL OR ${contactsTable.email} = '')`);
        break;
      case "missingPhone":
        conds.push(sql`(${contactsTable.phone} IS NULL OR ${contactsTable.phone} = '') AND (${contactsTable.mobile} IS NULL OR ${contactsTable.mobile} = '')`);
        break;
      case "sourceCard":
        conds.push(sql`EXISTS (
          SELECT 1 FROM business_cards bc
          WHERE bc.linked_contact_id = contacts.id
        )`);
        break;
      case "hasOpportunity":
        conds.push(sql`EXISTS (
          SELECT 1 FROM opportunity_contacts oc
          INNER JOIN opportunities o ON oc.opportunity_id = o.id
          WHERE oc.contact_id = contacts.id
            AND o.status = 'OPEN'
        )`);
        break;
      case "missingData":
        conds.push(sql`(
          ${contactsTable.email} IS NULL
          OR (${contactsTable.phone} IS NULL AND ${contactsTable.mobile} IS NULL)
          OR ${contactsTable.organizationId} IS NULL
        )`);
        break;
      case "duplicates":
        conds.push(sql`${contactsTable.fullName} IN (
          SELECT full_name FROM contacts
          WHERE workspace_id = ${workspaceId}
          GROUP BY full_name
          HAVING COUNT(*) > 1
        )`);
        break;
      case "statusNew":
        conds.push(sql`${contactsTable.status} = 'NEW'`);
        break;
    }
  }
  return conds;
}

// ── GET / ─────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const {
      search, status, organizationId,
      sortBy = "createdAt", sortOrder = "desc",
      filter = "", tag = "",
      page = "1", limit = "50",
    } = req.query as Record<string, string>;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [eq(contactsTable.workspaceId, workspace.id)];

    if (search) {
      conditions.push(or(
        ilike(contactsTable.fullName, `%${search}%`),
        ilike(contactsTable.email, `%${search}%`),
        ilike(contactsTable.title, `%${search}%`),
      ) as ReturnType<typeof eq>);
    }
    if (status) {
      conditions.push(eq(contactsTable.status, status as any));
    }
    if (organizationId) {
      conditions.push(eq(contactsTable.organizationId, organizationId));
    }

    // Quick filters
    const activeFilters = filter ? filter.split(",").map(f => f.trim()).filter(Boolean) : [];
    const filterConds = buildFilterConditions(activeFilters, workspace.id);

    // Tag filter (by name)
    const tagFilterConds: ReturnType<typeof sql>[] = [];
    if (tag) {
      tagFilterConds.push(sql`EXISTS (
        SELECT 1 FROM contact_tags ct
        INNER JOIN tags tg ON ct.tag_id = tg.id
        WHERE ct.contact_id = contacts.id
          AND LOWER(tg.name) = LOWER(${tag})
      )`);
    }

    const allConds = and(...conditions, ...filterConds as any[], ...tagFilterConds as any[]);

    const [contacts, totalResult] = await Promise.all([
      db.select().from(contactsTable)
        .leftJoin(organizationsTable, eq(contactsTable.organizationId, organizationsTable.id))
        .where(allConds)
        .orderBy(buildOrderBy(sortBy, sortOrder))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(allConds),
    ]);

    const contactIds = contacts.map(c => c.contacts.id).filter(Boolean);

    const [tagRows, activityRows, taskRows, opportunityRows] = await Promise.all([
      contactIds.length > 0
        ? db.select({ contactId: contactTagsTable.contactId, tag: tagsTable })
          .from(contactTagsTable).innerJoin(tagsTable, eq(contactTagsTable.tagId, tagsTable.id))
          .where(inArray(contactTagsTable.contactId, contactIds))
        : Promise.resolve([]),
      contactIds.length > 0
        ? db.select({
          contactId: activitiesTable.contactId,
          lastActivityAt: sql<string>`MAX(${activitiesTable.occurredAt})`.as("last_activity_at"),
        }).from(activitiesTable)
          .where(and(inArray(activitiesTable.contactId, contactIds), isNotNull(activitiesTable.contactId)))
          .groupBy(activitiesTable.contactId)
        : Promise.resolve([]),
      contactIds.length > 0
        ? db.select({
          contactId: tasksTable.contactId,
          nextTaskDue: sql<string>`MIN(${tasksTable.dueDate})`.as("next_task_due"),
        }).from(tasksTable)
          .where(and(
            inArray(tasksTable.contactId, contactIds),
            isNotNull(tasksTable.contactId),
            isNotNull(tasksTable.dueDate),
            sql`${tasksTable.status} IN ('OPEN','IN_PROGRESS')`,
          ))
          .groupBy(tasksTable.contactId)
        : Promise.resolve([]),
      contactIds.length > 0
        ? db.select({
          contactId: opportunityContactsTable.contactId,
          openCount: sql<number>`COUNT(*)`.as("open_count"),
        }).from(opportunityContactsTable)
          .innerJoin(opportunitiesTable, and(
            eq(opportunityContactsTable.opportunityId, opportunitiesTable.id),
            eq(opportunitiesTable.status, "OPEN"),
          ))
          .where(inArray(opportunityContactsTable.contactId, contactIds))
          .groupBy(opportunityContactsTable.contactId)
        : Promise.resolve([]),
    ]);

    const tagsByContact = tagRows.reduce((acc, r) => {
      if (!acc[r.contactId]) acc[r.contactId] = [];
      acc[r.contactId].push(r.tag);
      return acc;
    }, {} as Record<string, typeof tagsTable.$inferSelect[]>);

    const lastActivityByContact = activityRows.reduce((acc, r) => {
      if (r.contactId) acc[r.contactId] = r.lastActivityAt;
      return acc;
    }, {} as Record<string, string>);

    const nextTaskByContact = taskRows.reduce((acc, r) => {
      if (r.contactId) acc[r.contactId] = r.nextTaskDue;
      return acc;
    }, {} as Record<string, string>);

    const openOpsByContact = opportunityRows.reduce((acc, r) => {
      if (r.contactId) acc[r.contactId] = Number(r.openCount);
      return acc;
    }, {} as Record<string, number>);

    const result = contacts.map(c => ({
      ...c.contacts,
      organization: c.organizations
        ? { id: c.organizations.id, name: c.organizations.name, organizationType: c.organizations.organizationType, industry: c.organizations.industry }
        : null,
      tags: tagsByContact[c.contacts.id] || [],
      lastActivityAt: lastActivityByContact[c.contacts.id] || null,
      nextTaskDue: nextTaskByContact[c.contacts.id] || null,
      openOpportunityCount: openOpsByContact[c.contacts.id] || 0,
    }));

    res.json({ contacts: result, total: Number(totalResult[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /bulk/tasks ───────────────────────────────────────────────────────

router.post("/bulk/tasks", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const { contactIds, title, description, dueDate, priority = "MEDIUM" } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: "contactIds required" });
    }
    if (!title) return res.status(400).json({ error: "title required" });

    const validIds = await db.select({ id: contactsTable.id })
      .from(contactsTable)
      .where(and(inArray(contactsTable.id, contactIds), eq(contactsTable.workspaceId, workspace.id)));

    const tasks = await db.insert(tasksTable).values(
      validIds.map(c => ({
        workspaceId: workspace.id,
        contactId: c.id,
        title,
        description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority,
        status: "OPEN" as const,
        createdByUserId: user.id,
        assignedToUserId: user.id,
      }))
    ).returning();

    res.status(201).json({ created: tasks.length, tasks });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /bulk/tags ────────────────────────────────────────────────────────

router.post("/bulk/tags", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { contactIds, tagId, action } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: "contactIds required" });
    }
    if (!tagId) return res.status(400).json({ error: "tagId required" });
    if (!["add", "remove"].includes(action)) return res.status(400).json({ error: "action must be add or remove" });

    // Verify tag belongs to workspace
    const tag = await db.query.tagsTable.findFirst({ where: and(eq(tagsTable.id, tagId), eq(tagsTable.workspaceId, workspace.id)) });
    if (!tag) return res.status(404).json({ error: "Tag not found" });

    if (action === "add") {
      const existingLinks = await db.select({ contactId: contactTagsTable.contactId })
        .from(contactTagsTable)
        .where(and(inArray(contactTagsTable.contactId, contactIds), eq(contactTagsTable.tagId, tagId)));
      const existingSet = new Set(existingLinks.map(r => r.contactId));
      const toInsert = contactIds.filter((id: string) => !existingSet.has(id));
      if (toInsert.length > 0) {
        await db.insert(contactTagsTable).values(toInsert.map((id: string) => ({ contactId: id, tagId })));
      }
    } else {
      await db.delete(contactTagsTable).where(
        and(inArray(contactTagsTable.contactId, contactIds), eq(contactTagsTable.tagId, tagId))
      );
    }

    res.json({ success: true, affected: contactIds.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST / ─────────────────────────────────────────────────────────────────

router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const { tagIds, force, ...data } = req.body;

    if (!force) {
      const checks = [eq(contactsTable.workspaceId, workspace.id)];
      const orConditions: ReturnType<typeof eq>[] = [];
      if (data.email?.trim()) {
        orConditions.push(ilike(contactsTable.email, data.email.trim()));
      }
      if (data.fullName?.trim()) {
        orConditions.push(ilike(contactsTable.fullName, data.fullName.trim()));
      }
      if (orConditions.length > 0) {
        const existing = await db.select({ id: contactsTable.id, fullName: contactsTable.fullName, email: contactsTable.email })
          .from(contactsTable)
          .where(and(...checks, or(...orConditions)))
          .limit(1);
        if (existing.length > 0) {
          return res.status(409).json({
            error: "DUPLICATE",
            message: `A contact named "${existing[0].fullName}" already exists${existing[0].email ? ` (${existing[0].email})` : ""}.`,
            existing: existing[0],
          });
        }
      }
    }

    const [contact] = await db.insert(contactsTable).values({ ...data, workspaceId: workspace.id, ownerUserId: user.id }).returning();
    if (tagIds?.length) {
      await db.insert(contactTagsTable).values(tagIds.map((tid: string) => ({ contactId: contact.id, tagId: tid })));
    }
    let orgMasterOrgId: string | null = null;
    if (contact.organizationId) {
      const orgRow = await db.query.organizationsTable.findFirst({
        where: eq(organizationsTable.id, contact.organizationId),
        columns: { masterOrganizationId: true },
      });
      orgMasterOrgId = orgRow?.masterOrganizationId ?? null;
    }
    enqueuePromotion("CONTACT", contact.id, workspace.id, "CREATED", {
      fullName: contact.fullName, firstName: contact.firstName, lastName: contact.lastName,
      title: contact.title, department: contact.department, email: contact.email,
      phone: contact.phone, mobile: contact.mobile, linkedinUrl: contact.linkedinUrl,
      stakeholderRole: contact.stakeholderRole, influenceLevel: contact.influenceLevel,
      organizationId: contact.organizationId, workspaceId: workspace.id,
      parentOrgLinked: orgMasterOrgId !== null,
    });
    res.status(201).json(contact);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /:id ───────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const contact = await db.query.contactsTable.findFirst({
      where: and(eq(contactsTable.id, req.params.id), eq(contactsTable.workspaceId, workspace.id)),
    });
    if (!contact) return res.status(404).json({ error: "Not found" });

    const [org, tags, activities, tasks, notes, businessCards] = await Promise.all([
      contact.organizationId ? db.query.organizationsTable.findFirst({ where: eq(organizationsTable.id, contact.organizationId!) }) : Promise.resolve(null),
      db.select({ tag: tagsTable }).from(contactTagsTable).innerJoin(tagsTable, eq(contactTagsTable.tagId, tagsTable.id)).where(eq(contactTagsTable.contactId, contact.id)),
      db.select().from(activitiesTable).where(eq(activitiesTable.contactId, contact.id)).orderBy(desc(activitiesTable.occurredAt)).limit(20),
      db.select().from(tasksTable).where(eq(tasksTable.contactId, contact.id)).orderBy(desc(tasksTable.createdAt)).limit(20),
      db.select().from(notesTable).where(eq(notesTable.contactId, contact.id)).orderBy(desc(notesTable.createdAt)).limit(20),
      db.select({ id: businessCardsTable.id, imageUrlFront: businessCardsTable.imageUrlFront, imageUrlBack: businessCardsTable.imageUrlBack, scannedAt: businessCardsTable.createdAt })
        .from(businessCardsTable).where(eq(businessCardsTable.linkedContactId, contact.id)).orderBy(desc(businessCardsTable.createdAt)).limit(5),
    ]);

    res.json({ ...contact, organization: org ? { id: org.id, name: org.name, organizationType: org.organizationType, industry: org.industry } : null, tags: tags.map(t => t.tag), activities, tasks, notes, businessCards });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /:id ─────────────────────────────────────────────────────────────

const VALID_STAKEHOLDER_ROLES = ["DECISION_MAKER", "INFLUENCER", "CHAMPION", "BLOCKER", "OTHER"] as const;
const VALID_INFLUENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
const VALID_STRENGTH_LABELS = ["COLD", "DEVELOPING", "STRONG", "STRATEGIC"] as const;

router.patch("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { tagIds, ...data } = req.body;

    if (data.stakeholderRole !== undefined && data.stakeholderRole !== null) {
      if (!VALID_STAKEHOLDER_ROLES.includes(data.stakeholderRole)) {
        return res.status(400).json({ error: `Invalid stakeholderRole. Must be one of: ${VALID_STAKEHOLDER_ROLES.join(", ")}` });
      }
    }
    if (data.influenceLevel !== undefined && data.influenceLevel !== null) {
      if (!VALID_INFLUENCE_LEVELS.includes(data.influenceLevel)) {
        return res.status(400).json({ error: `Invalid influenceLevel. Must be one of: ${VALID_INFLUENCE_LEVELS.join(", ")}` });
      }
    }
    if (data.relationshipStrengthLabel !== undefined && data.relationshipStrengthLabel !== null) {
      if (!VALID_STRENGTH_LABELS.includes(data.relationshipStrengthLabel)) {
        return res.status(400).json({ error: `Invalid relationshipStrengthLabel. Must be one of: ${VALID_STRENGTH_LABELS.join(", ")}` });
      }
    }
    if (data.relationshipStrength !== undefined && data.relationshipStrength !== null) {
      const s = Number(data.relationshipStrength);
      if (isNaN(s) || s < 0 || s > 100) {
        return res.status(400).json({ error: "relationshipStrength must be an integer between 0 and 100" });
      }
      data.relationshipStrength = Math.round(s);
    }

    const [contact] = await db.update(contactsTable).set({ ...data, updatedAt: new Date() })
      .where(and(eq(contactsTable.id, req.params.id), eq(contactsTable.workspaceId, workspace.id))).returning();
    if (!contact) return res.status(404).json({ error: "Not found" });
    if (tagIds !== undefined) {
      await db.delete(contactTagsTable).where(eq(contactTagsTable.contactId, contact.id));
      if (tagIds.length) await db.insert(contactTagsTable).values(tagIds.map((tid: string) => ({ contactId: contact.id, tagId: tid })));
    }
    let updOrgMasterOrgId: string | null = null;
    if (contact.organizationId) {
      const orgRow = await db.query.organizationsTable.findFirst({
        where: eq(organizationsTable.id, contact.organizationId),
        columns: { masterOrganizationId: true },
      });
      updOrgMasterOrgId = orgRow?.masterOrganizationId ?? null;
    }
    enqueuePromotion("CONTACT", contact.id, workspace.id, "UPDATED", {
      fullName: contact.fullName, firstName: contact.firstName, lastName: contact.lastName,
      title: contact.title, department: contact.department, email: contact.email,
      phone: contact.phone, mobile: contact.mobile, linkedinUrl: contact.linkedinUrl,
      stakeholderRole: contact.stakeholderRole, influenceLevel: contact.influenceLevel,
      organizationId: contact.organizationId, workspaceId: workspace.id,
      parentOrgLinked: updOrgMasterOrgId !== null,
    });
    res.json(contact);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /:id ───────────────────────────────────────────────────────────────

router.put("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { tagIds, ...data } = req.body;
    const [contact] = await db.update(contactsTable).set({ ...data, updatedAt: new Date() })
      .where(and(eq(contactsTable.id, req.params.id), eq(contactsTable.workspaceId, workspace.id))).returning();
    if (!contact) return res.status(404).json({ error: "Not found" });
    if (tagIds !== undefined) {
      await db.delete(contactTagsTable).where(eq(contactTagsTable.contactId, contact.id));
      if (tagIds.length) await db.insert(contactTagsTable).values(tagIds.map((tid: string) => ({ contactId: contact.id, tagId: tid })));
    }
    res.json(contact);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /:id ────────────────────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    await db.delete(contactsTable).where(and(eq(contactsTable.id, req.params.id), eq(contactsTable.workspaceId, workspace.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

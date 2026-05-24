import { Router } from "express";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  contactsTable, organizationsTable, contactTagsTable, tagsTable,
  activitiesTable, tasksTable, notesTable, opportunityContactsTable, opportunitiesTable, businessCardsTable
} from "@workspace/db";
import { eq, and, ilike, or, desc, asc, sql, inArray, isNull, isNotNull, type SQL } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { processContactPromotion, REJECTION_MESSAGES } from "../lib/contactPromotion";
import { syncContactChannels, translateUniqueViolation, writeAuditLog, normalizedPhoneFor } from "../lib/contactIdentity";
import { masterContactsTable } from "@workspace/db";
import {
  diffConflictReviewFields,
  diffHash,
  pickConflictReviewFields,
  CONTACT_CONFLICT_REVIEW_FIELDS,
  stripPlatformFieldsForWorkspaceWrite,
} from "../lib/fieldAuthority";

const PhoneTypeEnum = z.enum(["work", "personal"]);

const CreateContactBodySchema = z.object({
  fullName: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  title: z.string().optional(),
  department: z.string().optional(),
  linkedinUrl: z.string().optional(),
  source: z.string().optional(),
  sourceDetail: z.string().optional(),
  organizationId: z.string().optional(),
  notesText: z.string().optional(),
  ownerUserId: z.string().optional(),
  phoneType: PhoneTypeEnum.optional(),
  isIndependent: z.boolean().optional().default(false),
  tagIds: z.array(z.string()).optional(),
  force: z.boolean().optional(),
});

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

async function validateOrganizationInWorkspace(organizationId: string, workspaceId: string): Promise<boolean> {
  const row = await db.query.organizationsTable.findFirst({
    columns: { id: true },
    where: and(
      eq(organizationsTable.id, organizationId),
      eq(organizationsTable.workspaceId, workspaceId),
      isNull(organizationsTable.deletedAt),
    ),
  });
  return row !== undefined;
}

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

    const conditions: SQL[] = [
      eq(contactsTable.workspaceId, workspace.id),
      isNull(contactsTable.deletedAt),
    ];

    if (search) {
      const searchCond = or(
        ilike(contactsTable.fullName, `%${search}%`),
        ilike(contactsTable.email, `%${search}%`),
        ilike(contactsTable.title, `%${search}%`),
      );
      if (searchCond) conditions.push(searchCond);
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
        .leftJoin(organizationsTable, and(eq(contactsTable.organizationId, organizationsTable.id), eq(organizationsTable.workspaceId, workspace.id)))
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
      .where(and(
        inArray(contactsTable.id, contactIds),
        eq(contactsTable.workspaceId, workspace.id),
        isNull(contactsTable.deletedAt),
      ));

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
    const parsed = CreateContactBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "Validation failed", issues: parsed.error.issues });
    }
    const { tagIds, force, ...data } = parsed.data;

    if (data.organizationId) {
      const orgValid = await validateOrganizationInWorkspace(data.organizationId, workspace.id);
      if (!orgValid) return res.status(400).json({ error: "Organization not found in this workspace" });
    }

    if (!force) {
      const checks = [eq(contactsTable.workspaceId, workspace.id), isNull(contactsTable.deletedAt)];
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

    let contact: typeof contactsTable.$inferSelect;
    try {
      const inserted = await db.insert(contactsTable)
        .values({
          ...data,
          workspaceId: workspace.id,
          ownerUserId: user.id,
          normalizedPhone: normalizedPhoneFor(data.phone),
        })
        .returning();
      contact = inserted[0];
    } catch (err) {
      const dup = await translateUniqueViolation(err, { workspaceId: workspace.id, email: data.email });
      if (dup?.isDuplicate) {
        return res.status(409).json({
          error: "DUPLICATE",
          constraint: dup.constraint,
          existingId: dup.existingId,
          message: dup.message,
        });
      }
      throw err;
    }
    if (tagIds?.length) {
      await db.insert(contactTagsTable).values(tagIds.map((tid: string) => ({ contactId: contact.id, tagId: tid })));
    }
    await syncContactChannels({
      contactId: contact.id,
      email: contact.email,
      phone: contact.phone,
      mobile: contact.mobile,
      emailLabel: "WORK",
      phoneLabel: contact.phoneType === "personal" ? "PERSONAL" : "WORK",
    });
    const promotion = await processContactPromotion({
      contact, workspaceId: workspace.id, changeType: "CREATED", userId: user.id,
    });
    res.status(201).json({
      ...contact,
      promotionStatus: promotion.status,
      promotionReason: promotion.status === "REJECTED" ? promotion.reason : null,
      promotionMessage: promotion.status === "REJECTED" ? REJECTION_MESSAGES[promotion.reason] : null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /:id ───────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const contact = await db.query.contactsTable.findFirst({
      where: and(
        eq(contactsTable.id, req.params.id),
        eq(contactsTable.workspaceId, workspace.id),
        isNull(contactsTable.deletedAt),
      ),
    });
    if (!contact) return res.status(404).json({ error: "Not found" });

    const [org, tags, activities, tasks, notes, businessCards] = await Promise.all([
      contact.organizationId ? db.query.organizationsTable.findFirst({ where: and(eq(organizationsTable.id, contact.organizationId!), eq(organizationsTable.workspaceId, workspace.id), isNull(organizationsTable.deletedAt)) }) : Promise.resolve(null),
      db.select({ tag: tagsTable }).from(contactTagsTable).innerJoin(tagsTable, eq(contactTagsTable.tagId, tagsTable.id)).where(eq(contactTagsTable.contactId, contact.id)),
      db.select().from(activitiesTable).where(and(eq(activitiesTable.contactId, contact.id), eq(activitiesTable.workspaceId, workspace.id))).orderBy(desc(activitiesTable.occurredAt)).limit(20),
      db.select().from(tasksTable).where(and(eq(tasksTable.contactId, contact.id), eq(tasksTable.workspaceId, workspace.id))).orderBy(desc(tasksTable.createdAt)).limit(20),
      db.select().from(notesTable).where(and(eq(notesTable.contactId, contact.id), eq(notesTable.workspaceId, workspace.id))).orderBy(desc(notesTable.createdAt)).limit(20),
      db.select({ id: businessCardsTable.id, imageUrlFront: businessCardsTable.imageUrlFront, imageUrlBack: businessCardsTable.imageUrlBack, scannedAt: businessCardsTable.createdAt })
        .from(businessCardsTable).where(and(eq(businessCardsTable.linkedContactId, contact.id), eq(businessCardsTable.workspaceId, workspace.id))).orderBy(desc(businessCardsTable.createdAt)).limit(5),
    ]);

    // Pull-on-render: fetch linked master row + diff conflict-review fields
    // (Decisions §9). No write occurs server-side from this read; the client
    // can choose Adopt or Ignore. We also check whether the current user has
    // already dismissed this exact diff hash (audit_logs row).
    let master: typeof masterContactsTable.$inferSelect | null = null;
    let masterConflictDiff: Awaited<ReturnType<typeof diffConflictReviewFields>> = [];
    let masterDiffHash: string | null = null;
    let masterDiffDismissed = false;
    if (contact.masterContactId) {
      master = (await db.query.masterContactsTable.findFirst({
        where: and(
          eq(masterContactsTable.id, contact.masterContactId),
          isNull(masterContactsTable.deletedAt),
        ),
      })) ?? null;
      if (master) {
        masterConflictDiff = diffConflictReviewFields(
          contact as unknown as Record<string, unknown>,
          master as unknown as Record<string, unknown>,
        );
        if (masterConflictDiff.length > 0) {
          masterDiffHash = await diffHash(masterConflictDiff);
          // Check audit_logs for an ADOPT_DISMISSED row matching this user +
          // contact + diff hash. We store the hash in `after_json.diffHash`.
          const dismissed = await db.execute<{ id: string }>(sql`
            SELECT id FROM audit_logs
            WHERE entity_type = 'contact'
              AND entity_id = ${contact.id}
              AND action = 'ADOPT_DISMISSED'
              AND user_id = ${user.id}
              AND after_json->>'diffHash' = ${masterDiffHash}
            LIMIT 1
          `);
          masterDiffDismissed = dismissed.rows.length > 0;
        }
      }
    }

    res.json({
      ...contact,
      organization: org ? { id: org.id, name: org.name, organizationType: org.organizationType, industry: org.industry } : null,
      tags: tags.map(t => t.tag),
      activities, tasks, notes, businessCards,
      master: master ? {
        id: master.id,
        title: master.title,
        department: master.department,
        email: master.email,
        phone: master.phone,
        linkedinUrl: master.linkedinUrl,
        masterOrganizationId: master.masterOrganizationId,
      } : null,
      masterConflictDiff,
      masterDiffHash,
      masterDiffDismissed,
    });
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
    const { workspace, user } = await getCurrentWorkspace(req);
    const { tagIds, ...rawData } = req.body;
    const data = stripPlatformFieldsForWorkspaceWrite(rawData as Record<string, unknown>);
    const patchedFields = Object.keys(data);

    if (data.organizationId) {
      const orgValid = await validateOrganizationInWorkspace(data.organizationId as string, workspace.id);
      if (!orgValid) return res.status(400).json({ error: "Organization not found in this workspace" });
    }

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

    let contact: typeof contactsTable.$inferSelect;
    try {
      const phoneUpdate = data.phone !== undefined ? { normalizedPhone: normalizedPhoneFor(data.phone) } : {};
      const updated = await db.update(contactsTable).set({ ...data, ...phoneUpdate, updatedAt: new Date() })
        .where(and(
          eq(contactsTable.id, req.params.id),
          eq(contactsTable.workspaceId, workspace.id),
          isNull(contactsTable.deletedAt),
        ))
        .returning();
      contact = updated[0];
    } catch (err) {
      const dup = await translateUniqueViolation(err, { workspaceId: workspace.id, email: data.email });
      if (dup?.isDuplicate) {
        return res.status(409).json({
          error: "DUPLICATE", constraint: dup.constraint, existingId: dup.existingId, message: dup.message,
        });
      }
      throw err;
    }
    if (!contact) return res.status(404).json({ error: "Not found" });
    if (tagIds !== undefined) {
      await db.delete(contactTagsTable).where(eq(contactTagsTable.contactId, contact.id));
      if (tagIds.length) await db.insert(contactTagsTable).values(tagIds.map((tid: string) => ({ contactId: contact.id, tagId: tid })));
    }
    await syncContactChannels({
      contactId: contact.id,
      email: contact.email,
      phone: contact.phone,
      mobile: contact.mobile,
      emailLabel: "WORK",
      phoneLabel: contact.phoneType === "personal" ? "PERSONAL" : "WORK",
    });
    const promotion = await processContactPromotion({
      contact, workspaceId: workspace.id, changeType: "UPDATED",
      patchedFields, userId: user.id,
    });
    res.json({
      ...contact,
      promotionStatus: promotion.status,
      promotionReason: promotion.status === "REJECTED" ? promotion.reason : null,
      promotionMessage: promotion.status === "REJECTED" ? REJECTION_MESSAGES[promotion.reason] : null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /:id ───────────────────────────────────────────────────────────────

router.put("/:id", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const { tagIds, ...rawData } = req.body;
    const data = stripPlatformFieldsForWorkspaceWrite(rawData as Record<string, unknown>);
    const patchedFields = Object.keys(data);

    if (data.organizationId) {
      const orgValid = await validateOrganizationInWorkspace(data.organizationId as string, workspace.id);
      if (!orgValid) return res.status(400).json({ error: "Organization not found in this workspace" });
    }

    const phoneUpdate = data.phone !== undefined ? { normalizedPhone: normalizedPhoneFor(data.phone) } : {};
    const [contact] = await db.update(contactsTable).set({ ...data, ...phoneUpdate, updatedAt: new Date() })
      .where(and(
        eq(contactsTable.id, req.params.id),
        eq(contactsTable.workspaceId, workspace.id),
        isNull(contactsTable.deletedAt),
      )).returning();
    if (!contact) return res.status(404).json({ error: "Not found" });
    if (tagIds !== undefined) {
      await db.delete(contactTagsTable).where(eq(contactTagsTable.contactId, contact.id));
      if (tagIds.length) await db.insert(contactTagsTable).values(tagIds.map((tid: string) => ({ contactId: contact.id, tagId: tid })));
    }
    await syncContactChannels({
      contactId: contact.id,
      email: contact.email,
      phone: contact.phone,
      mobile: contact.mobile,
      emailLabel: "WORK",
      phoneLabel: contact.phoneType === "personal" ? "PERSONAL" : "WORK",
    });
    const promotion = await processContactPromotion({
      contact, workspaceId: workspace.id, changeType: "UPDATED",
      patchedFields, userId: user.id,
    });
    res.json({
      ...contact,
      promotionStatus: promotion.status,
      promotionReason: promotion.status === "REJECTED" ? promotion.reason : null,
      promotionMessage: promotion.status === "REJECTED" ? REJECTION_MESSAGES[promotion.reason] : null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /:id ────────────────────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const before = await db.query.contactsTable.findFirst({
      where: and(
        eq(contactsTable.id, req.params.id),
        eq(contactsTable.workspaceId, workspace.id),
        isNull(contactsTable.deletedAt),
      ),
    });
    if (!before) return res.status(404).json({ error: "Not found" });
    await db.update(contactsTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(contactsTable.id, req.params.id), eq(contactsTable.workspaceId, workspace.id)));
    await writeAuditLog({
      workspaceId: workspace.id,
      userId: user.id,
      entityType: "contact",
      entityId: req.params.id,
      action: "SOFT_DELETE",
      before: { ...before, deletedAt: null },
      after: { ...before, deletedAt: new Date().toISOString() },
    });
    res.json({ success: true, softDeleted: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /:id/adopt-master ─────────────────────────────────────────────────
// Pull-on-render Adopt: copies only the conflict-review fields the user
// approves from the linked master row down to the workspace contact. Workspace-
// authoritative fields (relationship strength, status, owner, etc.) are never
// overwritten — Decisions §3, §9.

router.post("/:id/adopt-master", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const { fields } = req.body as { fields?: string[] };

    const contact = await db.query.contactsTable.findFirst({
      where: and(
        eq(contactsTable.id, req.params.id),
        eq(contactsTable.workspaceId, workspace.id),
        isNull(contactsTable.deletedAt),
      ),
    });
    if (!contact) return res.status(404).json({ error: "Not found" });
    if (!contact.masterContactId) {
      return res.status(409).json({ error: "NO_MASTER_LINK", message: "Contact has no linked master record" });
    }

    const master = await db.query.masterContactsTable.findFirst({
      where: and(
        eq(masterContactsTable.id, contact.masterContactId),
        isNull(masterContactsTable.deletedAt),
      ),
    });
    if (!master) return res.status(404).json({ error: "Master not found" });

    const diff = diffConflictReviewFields(
      contact as unknown as Record<string, unknown>,
      master as unknown as Record<string, unknown>,
    );
    if (diff.length === 0) {
      return res.status(409).json({ error: "NO_DIFF", message: "No master changes to adopt" });
    }

    // Filter master values to the requested fields, falling back to the full
    // diff when caller didn't specify a subset. Pass through field-authority
    // pickConflictReviewFields so unknown keys are dropped.
    const requested = new Set(fields ?? diff.map(d => d.field));
    const masterPayload: Record<string, unknown> = {};
    for (const d of diff) {
      if (requested.has(d.field)) masterPayload[d.field] = d.masterValue;
    }
    const adoptFields = pickConflictReviewFields(masterPayload);
    if (Object.keys(adoptFields).length === 0) {
      return res.status(400).json({ error: "NO_FIELDS", message: "No valid conflict-review fields requested" });
    }

    const phoneUpdate = adoptFields.phone !== undefined
      ? { normalizedPhone: normalizedPhoneFor(adoptFields.phone) }
      : {};
    const [updated] = await db
      .update(contactsTable)
      .set({ ...adoptFields, ...phoneUpdate, updatedAt: new Date() })
      .where(and(
        eq(contactsTable.id, contact.id),
        eq(contactsTable.workspaceId, workspace.id),
      ))
      .returning();

    // Channel sync: when email/phone are adopted from master, the row columns
    // change but the contact_channels rows must follow so future gating reads
    // the new values. Adopted values come from the master's WORK channels by
    // construction, so we always write WORK labels here.
    if (adoptFields.email !== undefined || adoptFields.phone !== undefined) {
      await syncContactChannels({
        workspaceId: workspace.id,
        contactId: contact.id,
        email: (adoptFields.email as string | null | undefined) ?? updated.email,
        emailLabel: "WORK",
        phone: (adoptFields.phone as string | null | undefined) ?? updated.phone,
        phoneLabel: "WORK",
      });
    }

    await writeAuditLog({
      workspaceId: workspace.id,
      userId: user.id,
      entityType: "contact",
      entityId: contact.id,
      action: "ADOPT_MASTER",
      before: contact,
      after: updated,
    });

    res.json({ success: true, contact: updated, adoptedFields: Object.keys(adoptFields) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /:id/dismiss-master-diff ─────────────────────────────────────────
// Per-user dismissal: writes an audit_logs row keyed by (user, contact, hash)
// so the badge stays hidden until the master row changes again on a
// conflict-review field (which produces a new diffHash). Decisions §9.

router.post("/:id/dismiss-master-diff", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const { diffHash: bodyHash } = req.body as { diffHash?: string };
    if (!bodyHash || typeof bodyHash !== "string") {
      return res.status(400).json({ error: "diffHash is required" });
    }

    const contact = await db.query.contactsTable.findFirst({
      where: and(
        eq(contactsTable.id, req.params.id),
        eq(contactsTable.workspaceId, workspace.id),
        isNull(contactsTable.deletedAt),
      ),
      columns: { id: true, masterContactId: true },
    });
    if (!contact) return res.status(404).json({ error: "Not found" });

    await writeAuditLog({
      workspaceId: workspace.id,
      userId: user.id,
      entityType: "contact",
      entityId: contact.id,
      action: "ADOPT_DISMISSED",
      before: null,
      after: { diffHash: bodyHash, masterContactId: contact.masterContactId },
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

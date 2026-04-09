import { Router } from "express";
import { db } from "@workspace/db";
import {
  masterPromotionQueueTable,
  masterOrganizationsTable,
  masterContactsTable,
  organizationsTable,
  contactsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { normalizeOrgName, normalizeDomain } from "../lib/orgNameNormalization";

const router = Router();

type PromotionEntityType = "ORG" | "CONTACT" | "NOTE";
type PromotionStatus = "PENDING" | "APPROVED_NEW" | "APPROVED_MERGE" | "APPROVED_LINK" | "REJECTED";

// ─── GET /admin/master-promotion/queue/counts ─────────────────────────────────
router.get("/queue/counts", async (req, res) => {
  try {
    const rows = await db.execute<{ entity_type: string; count: string }>(sql`
      SELECT entity_type, count(*) AS count
      FROM master_promotion_queue
      WHERE status = 'PENDING'
      GROUP BY entity_type
    `);

    const counts = { ORG: 0, CONTACT: 0, NOTE: 0, total: 0 };
    for (const r of rows.rows) {
      const n = parseInt(r.count);
      if (r.entity_type === "ORG") counts.ORG = n;
      else if (r.entity_type === "CONTACT") counts.CONTACT = n;
      else if (r.entity_type === "NOTE") counts.NOTE = n;
      counts.total += n;
    }
    res.json(counts);
  } catch (err) {
    req.log.error({ err }, "[PROMOTION] counts failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/master-promotion/queue ───────────────────────────────────────
router.get("/queue", async (req, res) => {
  try {
    const {
      entityType,
      status = "PENDING",
      workspaceId,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const statusCondition = status && status !== "ALL"
      ? sql`AND mpq.status = ${status}::promotion_status`
      : sql``;
    const entityTypeCondition = entityType && entityType !== "ALL"
      ? sql`AND mpq.entity_type = ${entityType}::promotion_entity_type`
      : sql``;
    const workspaceCondition = workspaceId
      ? sql`AND mpq.workspace_id = ${workspaceId}`
      : sql``;

    const rows = await db.execute<{
      id: string;
      entity_type: string;
      entity_id: string;
      workspace_id: string;
      workspace_name: string;
      change_type: string;
      status: string;
      resolved_master_id: string | null;
      rejection_reason: string | null;
      source_snapshot: Record<string, unknown>;
      resolved_at: string | null;
      created_at: string;
      updated_at: string;
    }>(sql`
      SELECT
        mpq.id, mpq.entity_type, mpq.entity_id, mpq.workspace_id,
        w.name AS workspace_name,
        mpq.change_type, mpq.status, mpq.resolved_master_id,
        mpq.rejection_reason, mpq.source_snapshot,
        mpq.resolved_at, mpq.created_at, mpq.updated_at
      FROM master_promotion_queue mpq
      LEFT JOIN workspaces w ON w.id = mpq.workspace_id
      WHERE 1=1
        ${statusCondition}
        ${entityTypeCondition}
        ${workspaceCondition}
      ORDER BY mpq.created_at DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `);

    const countRow = await db.execute<{ count: string }>(sql`
      SELECT count(*) AS count
      FROM master_promotion_queue mpq
      WHERE 1=1
        ${statusCondition}
        ${entityTypeCondition}
        ${workspaceCondition}
    `);

    const items = rows.rows.map(r => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      workspaceId: r.workspace_id,
      workspaceName: r.workspace_name,
      changeType: r.change_type,
      status: r.status,
      resolvedMasterId: r.resolved_master_id,
      rejectionReason: r.rejection_reason,
      sourceSnapshot: r.source_snapshot ?? {},
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      entityName: extractEntityName(r.entity_type, r.source_snapshot ?? {}),
      ageHours: Math.floor((Date.now() - new Date(r.created_at).getTime()) / 3600000),
    }));

    res.json({ items, total: parseInt(countRow.rows[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error({ err }, "[PROMOTION] queue list failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

function extractEntityName(entityType: string, snapshot: Record<string, unknown>): string {
  if (entityType === "ORG") return String(snapshot.name ?? "Unknown Organization");
  if (entityType === "CONTACT") return String(snapshot.fullName ?? "Unknown Contact");
  if (entityType === "NOTE") {
    const content = String(snapshot.noteContent ?? "");
    return content.length > 60 ? content.substring(0, 60) + "…" : content || "Note";
  }
  return "Unknown";
}

// ─── GET /admin/master-promotion/suggest-match ────────────────────────────────
router.get("/suggest-match", async (req, res) => {
  try {
    const { entityType, name, domain, organizationId } = req.query as Record<string, string>;

    if (!entityType || !name) {
      return res.status(400).json({ error: "entityType and name are required" });
    }

    if (entityType === "ORG" || (entityType === "NOTE" && req.query.parentType !== "CONTACT")) {
      const normalized = normalizeOrgName(name);
      const normDomain = domain ? normalizeDomain(domain) : null;

      const candidates = await db.execute<{
        id: string;
        canonical_name: string;
        website_domain: string | null;
        industry: string | null;
        validation_status: string;
        confidence_score: number;
      }>(sql`
        SELECT id, canonical_name, website_domain, industry, validation_status, confidence_score
        FROM master_organizations
        WHERE
          normalized_name ILIKE ${`%${normalized}%`}
          OR canonical_name ILIKE ${`%${name}%`}
          ${normDomain ? sql`OR website_domain = ${normDomain}` : sql``}
        ORDER BY
          CASE WHEN normalized_name = ${normalized} THEN 0
               WHEN website_domain = ${normDomain ?? ""} THEN 1
               WHEN normalized_name ILIKE ${`%${normalized}%`} THEN 2
               ELSE 3
          END,
          confidence_score DESC
        LIMIT 5
      `);

      const suggestions = candidates.rows.map(c => {
        let score = 0.75;
        if (normalizeOrgName(c.canonical_name) === normalized) score = 0.95;
        else if (normDomain && c.website_domain === normDomain) score = 0.85;
        if (normDomain && c.website_domain === normDomain) score = Math.min(1.0, score + 0.15);
        return {
          id: c.id,
          label: c.canonical_name,
          subtitle: c.website_domain ?? c.industry ?? null,
          confidenceScore: parseFloat(score.toFixed(2)),
          confidenceBand: score >= 0.80 ? "HIGH" : score >= 0.50 ? "MEDIUM" : "LOW",
        };
      });

      return res.json({ suggestions });
    }

    if (entityType === "CONTACT") {
      let masterOrgIdForFilter: string | null = null;
      if (organizationId) {
        const wsOrg = await db.query.organizationsTable.findFirst({
          where: eq(organizationsTable.id, organizationId),
          columns: { masterOrganizationId: true },
        });
        masterOrgIdForFilter = wsOrg?.masterOrganizationId ?? null;
      }

      const rows = await db.execute<{
        id: string;
        full_name: string;
        title: string | null;
        email: string | null;
        master_org_name: string;
      }>(sql`
        SELECT mc.id, mc.full_name, mc.title, mc.email, mo.canonical_name AS master_org_name
        FROM master_contacts mc
        JOIN master_organizations mo ON mo.id = mc.master_organization_id
        WHERE
          mc.full_name ILIKE ${`%${name}%`}
          ${masterOrgIdForFilter ? sql`AND mc.master_organization_id = ${masterOrgIdForFilter}` : sql``}
        LIMIT 5
      `);

      const suggestions = rows.rows.map(r => ({
        id: r.id,
        label: r.full_name,
        subtitle: [r.title, r.master_org_name].filter(Boolean).join(" · "),
        confidenceScore: 0.75,
        confidenceBand: "MEDIUM" as const,
      }));

      return res.json({ suggestions });
    }

    res.status(400).json({ error: "Invalid entityType" });
  } catch (err) {
    req.log.error({ err }, "[PROMOTION] suggest-match failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/master-promotion/:queueId/approve-new ───────────────────────
router.post("/:queueId/approve-new", async (req, res) => {
  try {
    const adminUserId = req.platformAdmin?.id;

    const item = await db.query.masterPromotionQueueTable.findFirst({
      where: eq(masterPromotionQueueTable.id, req.params.queueId),
    });
    if (!item) return res.status(404).json({ error: "Queue item not found" });
    if (item.status !== "PENDING") return res.status(409).json({ error: "Item is not pending" });

    const snapshot = (item.sourceSnapshot ?? {}) as Record<string, unknown>;
    let masterId: string | null = null;

    if (item.entityType === "ORG") {
      const name = String(snapshot.name ?? "Unknown Organization");
      const normalized = normalizeOrgName(name);
      const domain = snapshot.websiteDomain ? normalizeDomain(String(snapshot.websiteDomain)) : null;

      const [master] = await db.insert(masterOrganizationsTable).values({
        id: crypto.randomUUID(),
        canonicalName: name,
        displayName: name,
        normalizedName: normalized,
        websiteDomain: domain,
        industry: null,
        confidenceScore: 0.6,
        validationStatus: "PARTIALLY_VALIDATED",
        sourceType: "WORKSPACE_PROMOTED",
        sourceConfidence: 0.7,
        city: snapshot.city ? String(snapshot.city) : null,
        state: snapshot.state ? String(snapshot.state) : null,
        country: snapshot.country ? String(snapshot.country) : null,
        sourceWorkspaceId: item.workspaceId,
        sourceOrganizationId: item.entityId,
        promotedByAdminUserId: adminUserId ?? null,
        promotedAt: new Date(),
      }).returning();
      masterId = master.id;

      await db.update(organizationsTable)
        .set({ masterOrganizationId: master.id, updatedAt: new Date() })
        .where(eq(organizationsTable.id, item.entityId));

    } else if (item.entityType === "CONTACT") {
      const wsOrg = await db.query.contactsTable.findFirst({
        where: eq(contactsTable.id, item.entityId),
        columns: { organizationId: true, masterContactId: true },
      });

      const orgId = snapshot.organizationId ? String(snapshot.organizationId) : wsOrg?.organizationId ?? null;
      let masterOrgId: string | null = null;
      if (orgId) {
        const wsOrgRow = await db.query.organizationsTable.findFirst({
          where: eq(organizationsTable.id, orgId),
          columns: { masterOrganizationId: true },
        });
        masterOrgId = wsOrgRow?.masterOrganizationId ?? null;
      }

      if (!masterOrgId) {
        return res.status(409).json({
          error: "MISSING_ORG_LINK",
          message: "Contact's organization is not linked to a master organization. Promote the organization first.",
        });
      }

      const [master] = await db.insert(masterContactsTable).values({
        id: crypto.randomUUID(),
        masterOrganizationId: masterOrgId,
        fullName: String(snapshot.fullName ?? "Unknown"),
        firstName: snapshot.firstName ? String(snapshot.firstName) : null,
        lastName: snapshot.lastName ? String(snapshot.lastName) : null,
        title: snapshot.title ? String(snapshot.title) : null,
        department: snapshot.department ? String(snapshot.department) : null,
        email: snapshot.email ? String(snapshot.email) : null,
        phone: snapshot.phone ? String(snapshot.phone) : null,
        mobile: snapshot.mobile ? String(snapshot.mobile) : null,
        linkedinUrl: snapshot.linkedinUrl ? String(snapshot.linkedinUrl) : null,
        confidenceScore: 0.6,
        validationStatus: "UNVALIDATED",
        sourceWorkspaceId: item.workspaceId,
        sourceContactId: item.entityId,
        promotedByAdminUserId: adminUserId ?? null,
        promotedAt: new Date(),
      }).returning();
      masterId = master.id;

      await db.execute(sql`
        UPDATE contacts SET master_contact_id = ${master.id}, updated_at = NOW()
        WHERE id = ${item.entityId}
      `);

    } else {
      return res.status(400).json({ error: "NOTE entities cannot be promoted as new master records. Promote the parent org or contact." });
    }

    await db.update(masterPromotionQueueTable)
      .set({ status: "APPROVED_NEW", resolvedMasterId: masterId, resolvedByUserId: adminUserId ?? null, resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(masterPromotionQueueTable.id, req.params.queueId));

    res.json({ success: true, masterId, action: "APPROVED_NEW" });
  } catch (err) {
    req.log.error({ err }, "[PROMOTION] approve-new failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/master-promotion/:queueId/approve-merge ─────────────────────
router.post("/:queueId/approve-merge", async (req, res) => {
  try {
    const adminUserId = req.platformAdmin?.id;
    const { masterId } = req.body as { masterId: string };
    if (!masterId) return res.status(400).json({ error: "masterId is required" });

    const item = await db.query.masterPromotionQueueTable.findFirst({
      where: eq(masterPromotionQueueTable.id, req.params.queueId),
    });
    if (!item) return res.status(404).json({ error: "Queue item not found" });
    if (item.status !== "PENDING") return res.status(409).json({ error: "Item is not pending" });

    const snapshot = (item.sourceSnapshot ?? {}) as Record<string, unknown>;

    if (item.entityType === "ORG") {
      const master = await db.query.masterOrganizationsTable.findFirst({
        where: eq(masterOrganizationsTable.id, masterId),
      });
      if (!master) return res.status(404).json({ error: "Master organization not found" });

      const mergeUpdate: Partial<typeof masterOrganizationsTable.$inferInsert> = {
        updatedAt: new Date(),
        sourceType: "WORKSPACE_PROMOTED",
      };
      if (!master.websiteDomain && snapshot.websiteDomain) {
        mergeUpdate.websiteDomain = normalizeDomain(String(snapshot.websiteDomain));
      }
      if (!master.city && snapshot.city) mergeUpdate.city = String(snapshot.city);
      if (!master.state && snapshot.state) mergeUpdate.state = String(snapshot.state);
      if (!master.country && snapshot.country) mergeUpdate.country = String(snapshot.country);

      const orgName = String(snapshot.name ?? "");
      if (orgName) {
        const currentAliases: string[] = (master.aliases ?? []) as string[];
        const normalized = normalizeOrgName(orgName);
        if (normalized !== master.normalizedName && !currentAliases.includes(orgName)) {
          mergeUpdate.aliases = [...currentAliases, orgName];
        }
      }

      if (!master.sourceWorkspaceId) mergeUpdate.sourceWorkspaceId = item.workspaceId;
      if (!master.sourceOrganizationId) mergeUpdate.sourceOrganizationId = item.entityId;
      if (!master.promotedByAdminUserId) mergeUpdate.promotedByAdminUserId = adminUserId ?? null;
      if (!master.promotedAt) mergeUpdate.promotedAt = new Date();

      await db.update(masterOrganizationsTable).set(mergeUpdate).where(eq(masterOrganizationsTable.id, masterId));

      await db.update(organizationsTable)
        .set({ masterOrganizationId: masterId, updatedAt: new Date() })
        .where(eq(organizationsTable.id, item.entityId));

    } else if (item.entityType === "NOTE") {
      const parentOrgId = snapshot.organizationId ? String(snapshot.organizationId) : null;
      const parentContactId = snapshot.contactId ? String(snapshot.contactId) : null;

      if (parentOrgId) {
        const masterOrg = await db.query.masterOrganizationsTable.findFirst({
          where: eq(masterOrganizationsTable.id, masterId),
        });
        if (!masterOrg) return res.status(404).json({ error: "Master organization not found" });

        const mergeUpdate: Partial<typeof masterOrganizationsTable.$inferInsert> = { updatedAt: new Date() };
        if (!masterOrg.websiteDomain && snapshot.websiteDomain) {
          mergeUpdate.websiteDomain = normalizeDomain(String(snapshot.websiteDomain));
        }
        if (Object.keys(mergeUpdate).length > 1) {
          await db.update(masterOrganizationsTable).set(mergeUpdate).where(eq(masterOrganizationsTable.id, masterId));
        }
        await db.update(organizationsTable)
          .set({ masterOrganizationId: masterId, updatedAt: new Date() })
          .where(eq(organizationsTable.id, parentOrgId));

      } else if (parentContactId) {
        const parentContact = await db.query.contactsTable.findFirst({
          where: eq(contactsTable.id, parentContactId),
          columns: { organizationId: true },
        });
        if (parentContact?.organizationId) {
          const parentContactOrg = await db.query.organizationsTable.findFirst({
            where: eq(organizationsTable.id, parentContact.organizationId),
            columns: { masterOrganizationId: true },
          });
          if (!parentContactOrg?.masterOrganizationId) {
            return res.status(409).json({ error: "MISSING_ORG_LINK", message: "Parent contact's organization must be linked to a master org before this note can be promoted" });
          }
        }

        const masterContact = await db.query.masterContactsTable.findFirst({
          where: eq(masterContactsTable.id, masterId),
        });
        if (!masterContact) return res.status(404).json({ error: "Master contact not found" });

        const contactMergeUpdate: Partial<typeof masterContactsTable.$inferInsert> = { updatedAt: new Date() };
        if (!masterContact.email && snapshot.email) contactMergeUpdate.email = String(snapshot.email);
        if (Object.keys(contactMergeUpdate).length > 1) {
          await db.update(masterContactsTable).set(contactMergeUpdate).where(eq(masterContactsTable.id, masterId));
        }
        await db.execute(sql`
          UPDATE contacts SET master_contact_id = ${masterId}, updated_at = NOW()
          WHERE id = ${parentContactId}
        `);
      }

    } else if (item.entityType === "CONTACT") {
      const liveContact = await db.query.contactsTable.findFirst({
        where: eq(contactsTable.id, item.entityId),
        columns: { organizationId: true },
      });
      const orgId = String(snapshot.organizationId ?? liveContact?.organizationId ?? "");
      if (orgId) {
        const parentOrg = await db.query.organizationsTable.findFirst({
          where: eq(organizationsTable.id, orgId),
          columns: { masterOrganizationId: true },
        });
        if (!parentOrg?.masterOrganizationId) {
          return res.status(409).json({ error: "MISSING_ORG_LINK", message: "Parent organization must be linked to a master org before approving this contact" });
        }
      } else {
        return res.status(409).json({ error: "MISSING_ORG_LINK", message: "Contact has no parent organization — cannot approve without an org link" });
      }

      const master = await db.query.masterContactsTable.findFirst({
        where: eq(masterContactsTable.id, masterId),
      });
      if (!master) return res.status(404).json({ error: "Master contact not found" });

      const mergeUpdate: Partial<typeof masterContactsTable.$inferInsert> = { updatedAt: new Date() };
      if (!master.email && snapshot.email) mergeUpdate.email = String(snapshot.email);
      if (!master.phone && snapshot.phone) mergeUpdate.phone = String(snapshot.phone);
      if (!master.mobile && snapshot.mobile) mergeUpdate.mobile = String(snapshot.mobile);
      if (!master.title && snapshot.title) mergeUpdate.title = String(snapshot.title);
      if (!master.department && snapshot.department) mergeUpdate.department = String(snapshot.department);
      if (!master.linkedinUrl && snapshot.linkedinUrl) mergeUpdate.linkedinUrl = String(snapshot.linkedinUrl);
      if (!master.sourceWorkspaceId) mergeUpdate.sourceWorkspaceId = item.workspaceId;
      if (!master.sourceContactId) mergeUpdate.sourceContactId = item.entityId;
      if (!master.promotedByAdminUserId) mergeUpdate.promotedByAdminUserId = adminUserId ?? null;
      if (!master.promotedAt) mergeUpdate.promotedAt = new Date();

      if (Object.keys(mergeUpdate).length > 1) {
        await db.update(masterContactsTable).set(mergeUpdate).where(eq(masterContactsTable.id, masterId));
      }

      await db.execute(sql`
        UPDATE contacts SET master_contact_id = ${masterId}, updated_at = NOW()
        WHERE id = ${item.entityId}
      `);
    }

    await db.update(masterPromotionQueueTable)
      .set({ status: "APPROVED_MERGE", resolvedMasterId: masterId, resolvedByUserId: adminUserId ?? null, resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(masterPromotionQueueTable.id, req.params.queueId));

    res.json({ success: true, masterId, action: "APPROVED_MERGE" });
  } catch (err) {
    req.log.error({ err }, "[PROMOTION] approve-merge failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/master-promotion/:queueId/approve-link ──────────────────────
router.post("/:queueId/approve-link", async (req, res) => {
  try {
    const adminUserId = req.platformAdmin?.id;
    const { masterId } = req.body as { masterId: string };
    if (!masterId) return res.status(400).json({ error: "masterId is required" });

    const item = await db.query.masterPromotionQueueTable.findFirst({
      where: eq(masterPromotionQueueTable.id, req.params.queueId),
    });
    if (!item) return res.status(404).json({ error: "Queue item not found" });
    if (item.status !== "PENDING") return res.status(409).json({ error: "Item is not pending" });

    const linkSnapshot = (item.sourceSnapshot ?? {}) as Record<string, unknown>;

    if (item.entityType === "ORG") {
      await db.update(organizationsTable)
        .set({ masterOrganizationId: masterId, updatedAt: new Date() })
        .where(eq(organizationsTable.id, item.entityId));
    } else if (item.entityType === "NOTE") {
      const parentOrgId = linkSnapshot.organizationId ? String(linkSnapshot.organizationId) : null;
      const parentContactId = linkSnapshot.contactId ? String(linkSnapshot.contactId) : null;
      if (parentOrgId) {
        await db.update(organizationsTable)
          .set({ masterOrganizationId: masterId, updatedAt: new Date() })
          .where(eq(organizationsTable.id, parentOrgId));
      } else if (parentContactId) {
        const linkParentContact = await db.query.contactsTable.findFirst({
          where: eq(contactsTable.id, parentContactId),
          columns: { organizationId: true },
        });
        if (linkParentContact?.organizationId) {
          const linkParentContactOrg = await db.query.organizationsTable.findFirst({
            where: eq(organizationsTable.id, linkParentContact.organizationId),
            columns: { masterOrganizationId: true },
          });
          if (!linkParentContactOrg?.masterOrganizationId) {
            return res.status(409).json({ error: "MISSING_ORG_LINK", message: "Parent contact's organization must be linked to a master org before this note can be promoted" });
          }
        }
        await db.execute(sql`
          UPDATE contacts SET master_contact_id = ${masterId}, updated_at = NOW()
          WHERE id = ${parentContactId}
        `);
      }
    } else if (item.entityType === "CONTACT") {
      const linkSnapshotContact = (item.sourceSnapshot ?? {}) as Record<string, unknown>;
      const liveContactForLink = await db.query.contactsTable.findFirst({
        where: eq(contactsTable.id, item.entityId),
        columns: { organizationId: true },
      });
      const contactOrgId = String(linkSnapshotContact.organizationId ?? liveContactForLink?.organizationId ?? "");
      if (contactOrgId) {
        const parentOrg = await db.query.organizationsTable.findFirst({
          where: eq(organizationsTable.id, contactOrgId),
          columns: { masterOrganizationId: true },
        });
        if (!parentOrg?.masterOrganizationId) {
          return res.status(409).json({ error: "MISSING_ORG_LINK", message: "Parent organization must be linked to a master org before approving this contact" });
        }
      } else {
        return res.status(409).json({ error: "MISSING_ORG_LINK", message: "Contact has no parent organization — cannot approve without an org link" });
      }

      await db.execute(sql`
        UPDATE contacts SET master_contact_id = ${masterId}, updated_at = NOW()
        WHERE id = ${item.entityId}
      `);
    }

    await db.update(masterPromotionQueueTable)
      .set({ status: "APPROVED_LINK", resolvedMasterId: masterId, resolvedByUserId: adminUserId ?? null, resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(masterPromotionQueueTable.id, req.params.queueId));

    res.json({ success: true, masterId, action: "APPROVED_LINK" });
  } catch (err) {
    req.log.error({ err }, "[PROMOTION] approve-link failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/master-promotion/:queueId/reject ────────────────────────────
router.post("/:queueId/reject", async (req, res) => {
  try {
    const adminUserId = req.platformAdmin?.id;
    const { reason } = req.body as { reason?: string };

    const item = await db.query.masterPromotionQueueTable.findFirst({
      where: eq(masterPromotionQueueTable.id, req.params.queueId),
    });
    if (!item) return res.status(404).json({ error: "Queue item not found" });
    if (item.status !== "PENDING") return res.status(409).json({ error: "Item is not pending" });

    await db.update(masterPromotionQueueTable)
      .set({
        status: "REJECTED",
        rejectionReason: reason ?? null,
        resolvedByUserId: adminUserId ?? null,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(masterPromotionQueueTable.id, req.params.queueId));

    res.json({ success: true, action: "REJECTED" });
  } catch (err) {
    req.log.error({ err }, "[PROMOTION] reject failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

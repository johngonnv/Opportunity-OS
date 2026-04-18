/**
 * Admin contact-identity routes:
 *  - POST   /admin/contact-identity/contacts/:id/restore
 *  - POST   /admin/contact-identity/organizations/:id/restore
 *  - POST   /admin/contact-identity/master-contacts/:id/restore
 *  - POST   /admin/contact-identity/master-organizations/:id/restore
 *  - GET    /admin/contact-identity/master-contacts/:id/employment-log
 *  - GET    /admin/contact-identity/merge-queue
 *  - POST   /admin/contact-identity/merge-queue/:id/resolve
 *
 * All routes are mounted behind platformAdminMiddleware in routes/index.ts.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  contactsTable,
  organizationsTable,
  masterContactsTable,
  masterOrganizationsTable,
  masterContactEmploymentLogTable,
  masterMergeQueueTable,
} from "@workspace/db";
import { eq, and, isNull, isNotNull, desc, sql } from "drizzle-orm";
import { writeAuditLog } from "../lib/contactIdentity";

const router = Router();

async function restoreRow<T extends { deletedAt: Date | null; id: string }>(
  table: any,
  id: string,
  entityType: string,
  workspaceId: string | null,
  userId: string | null,
  res: any,
) {
  const before = await db.select().from(table).where(eq(table.id, id)).limit(1);
  if (!before[0]) return res.status(404).json({ error: "Not found" });
  if (before[0].deletedAt === null) {
    return res.status(409).json({ error: "ALREADY_ACTIVE", message: "Row is not soft-deleted." });
  }
  const [updated] = await db.update(table)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(table.id, id))
    .returning();
  await writeAuditLog({
    workspaceId: workspaceId ?? before[0].workspaceId ?? "platform",
    userId,
    entityType,
    entityId: id,
    action: "RESTORE",
    before: before[0],
    after: updated,
  });
  return res.json({ success: true, restored: true, id });
}

router.post("/contacts/:id/restore", async (req, res) => {
  const adminUserId = req.platformAdmin?.id ?? null;
  return restoreRow(contactsTable, req.params.id, "contact", null, adminUserId, res);
});

router.post("/organizations/:id/restore", async (req, res) => {
  const adminUserId = req.platformAdmin?.id ?? null;
  return restoreRow(organizationsTable, req.params.id, "organization", null, adminUserId, res);
});

router.post("/master-contacts/:id/restore", async (req, res) => {
  const adminUserId = req.platformAdmin?.id ?? null;
  return restoreRow(masterContactsTable, req.params.id, "master_contact", "platform", adminUserId, res);
});

router.post("/master-organizations/:id/restore", async (req, res) => {
  const adminUserId = req.platformAdmin?.id ?? null;
  return restoreRow(masterOrganizationsTable, req.params.id, "master_organization", "platform", adminUserId, res);
});

// ── Employment log ──────────────────────────────────────────────────────────

router.get("/master-contacts/:id/employment-log", async (req, res) => {
  try {
    const rows = await db.select().from(masterContactEmploymentLogTable)
      .where(eq(masterContactEmploymentLogTable.masterContactId, req.params.id))
      .orderBy(desc(masterContactEmploymentLogTable.createdAt))
      .limit(200);
    res.json({ entries: rows });
  } catch (err) {
    req.log.error({ err }, "[CONTACT-IDENTITY] employment-log failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Merge queue ─────────────────────────────────────────────────────────────

router.get("/merge-queue", async (req, res) => {
  try {
    const { entityType, status = "PENDING", page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conds: any[] = [];
    if (status && status !== "ALL") conds.push(eq(masterMergeQueueTable.status, status as any));
    if (entityType && entityType !== "ALL") conds.push(eq(masterMergeQueueTable.entityType, entityType as any));

    const where = conds.length > 0 ? and(...conds) : undefined;

    const [rows, totalRow] = await Promise.all([
      db.select().from(masterMergeQueueTable).where(where)
        .orderBy(desc(masterMergeQueueTable.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(masterMergeQueueTable).where(where),
    ]);
    res.json({ items: rows, total: Number(totalRow[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error({ err }, "[CONTACT-IDENTITY] merge-queue list failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/merge-queue/:id/resolve", async (req, res) => {
  try {
    const adminUserId = req.platformAdmin?.id ?? null;
    const { decision, rejectionReason, notes } = req.body as {
      decision: "APPROVED" | "REJECTED";
      rejectionReason?: string;
      notes?: string;
    };
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return res.status(400).json({ error: "decision must be APPROVED or REJECTED" });
    }

    const item = await db.query.masterMergeQueueTable.findFirst({
      where: eq(masterMergeQueueTable.id, req.params.id),
    });
    if (!item) return res.status(404).json({ error: "Not found" });
    if (item.status !== "PENDING") return res.status(409).json({ error: "Not pending" });

    const [updated] = await db.update(masterMergeQueueTable)
      .set({
        status: decision,
        rejectionReason: rejectionReason ?? null,
        notes: notes ?? item.notes,
        resolvedByUserId: adminUserId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(masterMergeQueueTable.id, req.params.id))
      .returning();

    await writeAuditLog({
      workspaceId: "platform",
      userId: adminUserId,
      entityType: `master_${item.entityType.toLowerCase()}_merge`,
      entityId: item.id,
      action: decision === "APPROVED" ? "MERGE_APPROVED" : "MERGE_REJECTED",
      before: item,
      after: updated,
    });

    res.json({ success: true, item: updated });
  } catch (err) {
    req.log.error({ err }, "[CONTACT-IDENTITY] merge-queue resolve failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Soft-deleted listing (cross-entity) ─────────────────────────────────────

router.get("/deleted", async (req, res) => {
  try {
    const { entityType = "ALL", workspaceId } = req.query as Record<string, string>;
    const out: Record<string, unknown[]> = {};
    if (entityType === "ALL" || entityType === "contact") {
      const conds: any[] = [isNotNull(contactsTable.deletedAt)];
      if (workspaceId) conds.push(eq(contactsTable.workspaceId, workspaceId));
      out.contacts = await db.select().from(contactsTable).where(and(...conds))
        .orderBy(desc(contactsTable.deletedAt as any)).limit(100);
    }
    if (entityType === "ALL" || entityType === "organization") {
      const conds: any[] = [isNotNull(organizationsTable.deletedAt)];
      if (workspaceId) conds.push(eq(organizationsTable.workspaceId, workspaceId));
      out.organizations = await db.select().from(organizationsTable).where(and(...conds))
        .orderBy(desc(organizationsTable.deletedAt as any)).limit(100);
    }
    if (entityType === "ALL" || entityType === "master_contact") {
      out.masterContacts = await db.select().from(masterContactsTable)
        .where(isNotNull(masterContactsTable.deletedAt))
        .orderBy(desc(masterContactsTable.deletedAt as any)).limit(100);
    }
    if (entityType === "ALL" || entityType === "master_organization") {
      out.masterOrganizations = await db.select().from(masterOrganizationsTable)
        .where(isNotNull(masterOrganizationsTable.deletedAt))
        .orderBy(desc(masterOrganizationsTable.deletedAt as any)).limit(100);
    }
    res.json(out);
  } catch (err) {
    req.log.error({ err }, "[CONTACT-IDENTITY] deleted list failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

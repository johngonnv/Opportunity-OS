/**
 * Admin contact-identity routes.
 * Mounted at /admin/contact-identity behind platformAdminMiddleware.
 *
 * Restore endpoints enforce a 90-day window per Decisions §5.
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

const RESTORE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

interface SoftDeletableRow {
  id: string;
  deletedAt: Date | null;
  workspaceId?: string;
}

function withinRestoreWindow(deletedAt: Date | null): boolean {
  if (!deletedAt) return false;
  return Date.now() - new Date(deletedAt).getTime() <= RESTORE_WINDOW_MS;
}

async function performRestore(opts: {
  res: Parameters<Parameters<typeof router.post>[1]>[1];
  table: typeof contactsTable | typeof organizationsTable | typeof masterContactsTable | typeof masterOrganizationsTable;
  id: string;
  entityType: string;
  workspaceIdOverride?: string;
  userId: string | null;
}) {
  const { res, table, id, entityType, workspaceIdOverride, userId } = opts;
  const before = (await db.select().from(table).where(eq(table.id, id)).limit(1)) as SoftDeletableRow[];
  if (!before[0]) return res.status(404).json({ error: "Not found" });
  if (before[0].deletedAt === null) {
    return res.status(409).json({ error: "ALREADY_ACTIVE", message: "Row is not soft-deleted." });
  }
  if (!withinRestoreWindow(before[0].deletedAt)) {
    return res.status(410).json({
      error: "RESTORE_WINDOW_EXPIRED",
      message: "This row was deleted more than 90 days ago and can no longer be restored.",
      deletedAt: before[0].deletedAt,
    });
  }
  const [updated] = await db.update(table)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(table.id, id))
    .returning();
  const auditWorkspaceId = workspaceIdOverride ?? before[0].workspaceId ?? "platform";
  await writeAuditLog({
    workspaceId: auditWorkspaceId,
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
  return performRestore({
    res, table: contactsTable, id: req.params.id, entityType: "contact",
    userId: req.platformAdmin?.id ?? null,
  });
});

router.post("/organizations/:id/restore", async (req, res) => {
  return performRestore({
    res, table: organizationsTable, id: req.params.id, entityType: "organization",
    userId: req.platformAdmin?.id ?? null,
  });
});

router.post("/master-contacts/:id/restore", async (req, res) => {
  return performRestore({
    res, table: masterContactsTable, id: req.params.id, entityType: "master_contact",
    workspaceIdOverride: "platform",
    userId: req.platformAdmin?.id ?? null,
  });
});

router.post("/master-organizations/:id/restore", async (req, res) => {
  return performRestore({
    res, table: masterOrganizationsTable, id: req.params.id, entityType: "master_organization",
    workspaceIdOverride: "platform",
    userId: req.platformAdmin?.id ?? null,
  });
});

// ── DELETE /master-contacts/:id ─────────────────────────────────────────────
// Soft-delete master contact (sets deleted_at). Use POST /:id/restore to undo
// within the 90-day window.
router.delete("/master-contacts/:id", async (req, res) => {
  try {
    const before = await db.query.masterContactsTable.findFirst({
      where: and(eq(masterContactsTable.id, req.params.id), isNull(masterContactsTable.deletedAt)),
    });
    if (!before) return res.status(404).json({ error: "Not found" });
    const [updated] = await db.update(masterContactsTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(masterContactsTable.id, req.params.id))
      .returning();
    await writeAuditLog({
      workspaceId: "platform",
      userId: req.platformAdmin?.id ?? null,
      entityType: "master_contact",
      entityId: req.params.id,
      action: "SOFT_DELETE",
      before,
      after: updated,
    });
    res.json({ success: true, softDeleted: true, id: req.params.id });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-CONTACT-IDENTITY] master-contact soft-delete failed");
    res.status(500).json({ error: "Internal server error" });
  }
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

    const conds = [];
    if (status && status !== "ALL") {
      conds.push(eq(masterMergeQueueTable.status, status as typeof masterMergeQueueTable.$inferSelect["status"]));
    }
    if (entityType && entityType !== "ALL") {
      conds.push(eq(masterMergeQueueTable.entityType, entityType as typeof masterMergeQueueTable.$inferSelect["entityType"]));
    }
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
      const conds = [isNotNull(contactsTable.deletedAt)];
      if (workspaceId) conds.push(eq(contactsTable.workspaceId, workspaceId));
      out.contacts = await db.select().from(contactsTable).where(and(...conds))
        .orderBy(desc(contactsTable.deletedAt)).limit(100);
    }
    if (entityType === "ALL" || entityType === "organization") {
      const conds = [isNotNull(organizationsTable.deletedAt)];
      if (workspaceId) conds.push(eq(organizationsTable.workspaceId, workspaceId));
      out.organizations = await db.select().from(organizationsTable).where(and(...conds))
        .orderBy(desc(organizationsTable.deletedAt)).limit(100);
    }
    if (entityType === "ALL" || entityType === "master_contact") {
      out.masterContacts = await db.select().from(masterContactsTable)
        .where(isNotNull(masterContactsTable.deletedAt))
        .orderBy(desc(masterContactsTable.deletedAt)).limit(100);
    }
    if (entityType === "ALL" || entityType === "master_organization") {
      out.masterOrganizations = await db.select().from(masterOrganizationsTable)
        .where(isNotNull(masterOrganizationsTable.deletedAt))
        .orderBy(desc(masterOrganizationsTable.deletedAt)).limit(100);
    }
    res.json(out);
  } catch (err) {
    req.log.error({ err }, "[CONTACT-IDENTITY] deleted list failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

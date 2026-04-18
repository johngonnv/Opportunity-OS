/**
 * Contact-identity v1 helpers: duplicate detection translation, channel
 * writes, employment-log writes, audit-log writes, identity fingerprinting.
 *
 * See .local/tasks/contact-identity-v1-decisions.md for the architecture.
 */
import { db } from "@workspace/db";
import {
  contactChannelsTable,
  masterContactEmploymentLogTable,
  masterMergeQueueTable,
  auditLogsTable,
  normalizePhoneE164,
} from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";

/**
 * Type alias for the drizzle DB executor — the global `db` or a transaction
 * `tx` passed in from `db.transaction(tx => ...)`. Helpers that mutate the
 * database accept this so that callers running inside a transaction perform
 * their writes inside the same transaction (avoids FK races and ensures
 * rollback safety).
 */
type DbExecutor = typeof db;

const PG_UNIQUE_VIOLATION = "23505";

export interface DuplicateInfo {
  isDuplicate: boolean;
  constraint?: string;
  existingId?: string;
  message?: string;
}

/**
 * Inspect a thrown error and, if it's a Postgres unique violation on one of
 * our identity-uniqueness indexes, fetch the existing row and return a
 * structured 409 payload. Returns null for any other error.
 */
export async function translateUniqueViolation(
  err: unknown,
  options: {
    workspaceId?: string;
    masterOrgId?: string;
    email?: string | null;
    normalizedName?: string | null;
    websiteDomain?: string | null;
  },
): Promise<DuplicateInfo | null> {
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e?.code !== PG_UNIQUE_VIOLATION) return null;
  const constraint = String(e.constraint ?? "");

  if (constraint === "contacts_workspace_email_uniq" && options.workspaceId && options.email) {
    const rows = await db.execute<{ id: string; full_name: string }>(sql`
      SELECT id, full_name FROM contacts
      WHERE workspace_id = ${options.workspaceId}
        AND lower(email) = ${options.email.trim().toLowerCase()}
        AND deleted_at IS NULL
      LIMIT 1
    `);
    const existing = rows.rows[0];
    return {
      isDuplicate: true,
      constraint,
      existingId: existing?.id,
      message: existing
        ? `A contact with this email already exists: ${existing.full_name}`
        : "A contact with this email already exists.",
    };
  }

  if (constraint === "master_contacts_org_email_uniq" && options.masterOrgId && options.email) {
    const rows = await db.execute<{ id: string; full_name: string }>(sql`
      SELECT id, full_name FROM master_contacts
      WHERE master_organization_id = ${options.masterOrgId}
        AND lower(email) = ${options.email.trim().toLowerCase()}
        AND deleted_at IS NULL
      LIMIT 1
    `);
    const existing = rows.rows[0];
    return {
      isDuplicate: true,
      constraint,
      existingId: existing?.id,
      message: existing
        ? `A master contact with this email already exists at this organization: ${existing.full_name}`
        : "A master contact with this email already exists at this organization.",
    };
  }

  if (constraint === "master_organizations_name_domain_uniq" && options.normalizedName !== undefined) {
    const rows = await db.execute<{ id: string; canonical_name: string }>(sql`
      SELECT id, canonical_name FROM master_organizations
      WHERE normalized_name = ${options.normalizedName}
        AND coalesce(website_domain, '') = ${options.websiteDomain ?? ""}
        AND deleted_at IS NULL
      LIMIT 1
    `);
    const existing = rows.rows[0];
    return {
      isDuplicate: true,
      constraint,
      existingId: existing?.id,
      message: existing
        ? `A master organization with this name and domain already exists: ${existing.canonical_name}`
        : "A master organization with this name and domain already exists.",
    };
  }

  return { isDuplicate: true, constraint, message: "Unique constraint violated." };
}

// ── Channel writes ──────────────────────────────────────────────────────────

interface SyncChannelsInput {
  contactId?: string;
  masterContactId?: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  emailLabel?: "WORK" | "PERSONAL" | "MOBILE" | "HOME";
  phoneLabel?: "WORK" | "PERSONAL" | "MOBILE" | "HOME";
}

/**
 * Idempotent helper: ensures channel rows exist for the provided email/phone/
 * mobile values. Defaults all labels to WORK (workspace contacts default to
 * work-channel; the UI can later promote/demote labels).
 *
 * Does NOT delete existing channels — for v1 the legacy flat columns remain
 * the source of truth on the contact row, channels are an additive write.
 */
export async function syncContactChannels(input: SyncChannelsInput, executor: DbExecutor = db): Promise<void> {
  if (!input.contactId && !input.masterContactId) return;
  const exec = executor;

  const ownerCol = input.contactId
    ? eq(contactChannelsTable.contactId, input.contactId)
    : eq(contactChannelsTable.masterContactId, input.masterContactId!);

  const emailLabel = input.emailLabel ?? "WORK";
  const phoneLabel = input.phoneLabel ?? "WORK";

  if (input.email && input.email.trim()) {
    const normalized = input.email.trim().toLowerCase();
    const existing = await exec
      .select({ id: contactChannelsTable.id })
      .from(contactChannelsTable)
      .where(and(
        ownerCol,
        eq(contactChannelsTable.kind, "EMAIL"),
        eq(contactChannelsTable.normalizedValue, normalized),
        isNull(contactChannelsTable.deletedAt),
      ))
      .limit(1);
    if (existing.length === 0) {
      await exec.insert(contactChannelsTable).values({
        contactId: input.contactId ?? null,
        masterContactId: input.masterContactId ?? null,
        kind: "EMAIL",
        label: emailLabel,
        value: input.email.trim(),
        normalizedValue: normalized,
        isPrimary: true,
      });
    }
  }

  if (input.phone && input.phone.trim()) {
    const normalized = normalizePhoneE164(input.phone);
    if (normalized) {
      const existing = await exec
        .select({ id: contactChannelsTable.id })
        .from(contactChannelsTable)
        .where(and(
          ownerCol,
          eq(contactChannelsTable.kind, "PHONE"),
          eq(contactChannelsTable.normalizedValue, normalized),
          isNull(contactChannelsTable.deletedAt),
        ))
        .limit(1);
      if (existing.length === 0) {
        await exec.insert(contactChannelsTable).values({
          contactId: input.contactId ?? null,
          masterContactId: input.masterContactId ?? null,
          kind: "PHONE",
          label: phoneLabel,
          value: input.phone.trim(),
          normalizedValue: normalized,
          isPrimary: true,
        });
      }
    }
  }

  if (input.mobile && input.mobile.trim()) {
    const normalized = normalizePhoneE164(input.mobile);
    if (normalized) {
      const existing = await exec
        .select({ id: contactChannelsTable.id })
        .from(contactChannelsTable)
        .where(and(
          ownerCol,
          eq(contactChannelsTable.kind, "PHONE"),
          eq(contactChannelsTable.label, "MOBILE"),
          isNull(contactChannelsTable.deletedAt),
        ))
        .limit(1);
      if (existing.length === 0) {
        await exec.insert(contactChannelsTable).values({
          contactId: input.contactId ?? null,
          masterContactId: input.masterContactId ?? null,
          kind: "PHONE",
          label: "MOBILE",
          value: input.mobile.trim(),
          normalizedValue: normalized,
          isPrimary: false,
        });
      }
    }
  }
}

/**
 * Helper to compute the normalized E.164 phone value to write into the
 * `normalized_phone` column on `contacts` / `master_contacts`. Centralized so
 * every write path stays consistent with backfill.
 */
export function normalizedPhoneFor(phone: string | null | undefined): string | null {
  return normalizePhoneE164(phone);
}

// ── Identity fingerprint (SHA-256 hex) ──────────────────────────────────────

export async function computeMasterContactFingerprint(
  email: string | null,
  phone: string | null,
  masterOrgId: string | null,
): Promise<string> {
  const e = (email ?? "").trim().toLowerCase();
  const p = normalizePhoneE164(phone) ?? "";
  const o = masterOrgId ?? "";
  const input = `${e}:${p}:${o}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Master contact employment log ───────────────────────────────────────────

interface EmploymentChangeInput {
  masterContactId: string;
  previousMasterOrganizationId: string | null;
  newMasterOrganizationId: string | null;
  previousTitle: string | null;
  newTitle: string | null;
  previousDepartment: string | null;
  newDepartment: string | null;
  changedByUserId: string | null;
  changeSource?: string;
  notes?: string;
}

export async function logEmploymentChange(input: EmploymentChangeInput, executor: DbExecutor = db): Promise<void> {
  const orgChanged = input.previousMasterOrganizationId !== input.newMasterOrganizationId;
  const titleChanged = (input.previousTitle ?? null) !== (input.newTitle ?? null);
  const deptChanged = (input.previousDepartment ?? null) !== (input.newDepartment ?? null);
  if (!orgChanged && !titleChanged && !deptChanged) return;

  await executor.insert(masterContactEmploymentLogTable).values({
    masterContactId: input.masterContactId,
    previousMasterOrganizationId: input.previousMasterOrganizationId,
    newMasterOrganizationId: input.newMasterOrganizationId,
    previousTitle: input.previousTitle,
    newTitle: input.newTitle,
    previousDepartment: input.previousDepartment,
    newDepartment: input.newDepartment,
    changedByUserId: input.changedByUserId,
    changeSource: input.changeSource ?? "ADMIN_UPDATE",
    notes: input.notes ?? null,
  });
}

// ── Audit log helper with before/after JSON ─────────────────────────────────

interface AuditInput {
  workspaceId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export async function writeAuditLog(input: AuditInput, executor: DbExecutor = db): Promise<void> {
  // Defensive: audit-log failures (e.g., bad workspace FK on platform-level
  // actions, transient DB errors) must never break the underlying mutation
  // they're recording. Log and swallow.
  try {
    await executor.insert(auditLogsTable).values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      beforeJson: input.before ?? null,
      afterJson: input.after ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[CONTACT-IDENTITY] writeAuditLog failed (non-fatal):", {
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Phone-only duplicate detection (compensating control) ──────────────────
// Phone uniqueness was intentionally NOT enforced as a DB constraint because
// legitimate shared-office phones exist (multiple practitioners sharing one
// front-desk line). Per Decisions §2 we route phone-only matches to the
// admin merge queue. Call this after creating/promoting a master contact
// when no email collision occurred but a phone match exists.
export async function detectAndEnqueuePhoneDuplicates(input: {
  newMasterContactId: string;
  phone: string | null;
  detectedBy?: string;
}, executor: DbExecutor = db): Promise<number> {
  const normalized = normalizePhoneE164(input.phone);
  if (!normalized) return 0;
  const candidates = await executor.execute<{ id: string }>(sql`
    SELECT id FROM master_contacts
    WHERE normalized_phone = ${normalized}
      AND id <> ${input.newMasterContactId}
      AND deleted_at IS NULL
    LIMIT 25
  `);
  let enqueued = 0;
  for (const row of candidates.rows) {
    await enqueueMergeCandidate({
      entityType: "CONTACT",
      primaryId: row.id,
      duplicateId: input.newMasterContactId,
      matchSignal: `phone:${normalized}`,
      confidenceScore: 0.4,
      detectedBy: input.detectedBy ?? "PHONE_AUTO_DETECT",
      notes: "Phone-only match. Verify same person before merging — shared office phones are common.",
    }, executor);
    enqueued += 1;
  }
  return enqueued;
}

// ── Master merge queue helper ───────────────────────────────────────────────

export async function enqueueMergeCandidate(input: {
  entityType: "CONTACT" | "ORG";
  primaryId: string;
  duplicateId: string;
  matchSignal: string;
  confidenceScore?: number;
  detectedBy?: string;
  notes?: string;
}, executor: DbExecutor = db): Promise<void> {
  // Idempotent: don't enqueue duplicates of the same pair already PENDING.
  const existing = await executor
    .select({ id: masterMergeQueueTable.id })
    .from(masterMergeQueueTable)
    .where(and(
      eq(masterMergeQueueTable.entityType, input.entityType),
      eq(masterMergeQueueTable.primaryId, input.primaryId),
      eq(masterMergeQueueTable.duplicateId, input.duplicateId),
      eq(masterMergeQueueTable.status, "PENDING"),
    ))
    .limit(1);
  if (existing.length > 0) return;

  await executor.insert(masterMergeQueueTable).values({
    entityType: input.entityType,
    primaryId: input.primaryId,
    duplicateId: input.duplicateId,
    matchSignal: input.matchSignal,
    confidenceScore: input.confidenceScore ?? 0.5,
    detectedBy: input.detectedBy ?? "SYSTEM",
    status: "PENDING",
    notes: input.notes ?? null,
  });
}

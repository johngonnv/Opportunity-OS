/**
 * Contact-promotion gating + auto-promotion + WORK-only snapshot (Decisions §5).
 *
 * Replaces direct calls to `enqueuePromotion("CONTACT", ...)` from the contacts
 * write path. Centralizes:
 *
 *   1. Promotion gating: a contact only enters the queue when it has a linked
 *      master organization, first_name, last_name, AND at least one WORK email
 *      OR WORK phone channel (Decisions §5).
 *   2. Auto-promotable classifier: title/department-only PATCHes on a contact
 *      that already has master_contact_id are applied directly to the master
 *      record (with employment log + audit), no admin queue (Decisions §5).
 *   3. Personal-channel guardrail: the snapshot written to the queue is
 *      filtered down to WORK-labeled channels — PERSONAL/HOME/MOBILE labels
 *      are stripped.
 *
 * All gating decisions return a structured result so the caller can surface
 * "Needs more info" to the UI.
 */
import { db } from "@workspace/db";
import {
  contactsTable,
  organizationsTable,
  contactChannelsTable,
  masterContactsTable,
  masterPromotionQueueTable,
} from "@workspace/db";
import { and, eq, isNull, inArray, sql } from "drizzle-orm";
import { enqueuePromotion } from "./promotionQueue";
import {
  AUTO_PROMOTABLE_FIELDS,
  type AutoPromotableField,
  stripWorkspaceFieldsForPromote,
} from "./fieldAuthority";
import { logEmploymentChange, writeAuditLog } from "./contactIdentity";

export type GatingResult =
  | { status: "ENQUEUED"; reason: null }
  | { status: "AUTO_PROMOTED"; reason: null; masterId: string }
  | { status: "REJECTED"; reason: PromotionRejectionReason };

export type PromotionRejectionReason =
  | "MISSING_ORG_LINK"
  | "MISSING_NAME"
  | "MISSING_WORK_CHANNEL";

export const REJECTION_MESSAGES: Record<PromotionRejectionReason, string> = {
  MISSING_ORG_LINK: "Contact must be linked to an organization that is itself linked to a master organization before it can be promoted.",
  MISSING_NAME: "Contact must have both first and last name before it can be promoted.",
  MISSING_WORK_CHANNEL: "Contact must have at least one WORK email or WORK phone before it can be promoted.",
};

/**
 * Look up the WORK-labeled channels for a workspace contact. Returns empty
 * arrays when none exist. Used for both gating (need ≥1) and snapshot
 * filtering (only WORK reaches master).
 */
async function loadWorkChannels(contactId: string): Promise<{
  workEmails: string[];
  workPhones: string[];
}> {
  // Gating contract: only verified WORK channels count. An unverified row
  // means the user typed the value but we have not yet confirmed it. Until
  // verifiedAt is set, the channel cannot satisfy the master-directory gate.
  const rows = await db
    .select({
      kind: contactChannelsTable.kind,
      value: contactChannelsTable.value,
    })
    .from(contactChannelsTable)
    .where(and(
      eq(contactChannelsTable.contactId, contactId),
      eq(contactChannelsTable.label, "WORK"),
      isNull(contactChannelsTable.deletedAt),
      sql`${contactChannelsTable.verifiedAt} IS NOT NULL`,
      inArray(contactChannelsTable.kind, ["EMAIL", "PHONE"]),
    ));
  const workEmails = rows.filter(r => r.kind === "EMAIL").map(r => r.value);
  const workPhones = rows.filter(r => r.kind === "PHONE").map(r => r.value);
  return { workEmails, workPhones };
}

/**
 * Evaluate the gating rules. Returns the rejection reason or null when the
 * contact is eligible.
 */
export interface GatingInput {
  contact: typeof contactsTable.$inferSelect;
  parentOrgMasterOrgId: string | null;
  workEmails: string[];
  workPhones: string[];
}

export function evaluateGating(input: GatingInput): PromotionRejectionReason | null {
  if (!input.contact.organizationId || !input.parentOrgMasterOrgId) {
    return "MISSING_ORG_LINK";
  }
  const first = (input.contact.firstName ?? "").trim();
  const last = (input.contact.lastName ?? "").trim();
  if (!first || !last) {
    return "MISSING_NAME";
  }
  if (input.workEmails.length === 0 && input.workPhones.length === 0) {
    return "MISSING_WORK_CHANNEL";
  }
  return null;
}

/**
 * Returns true when the only fields in `patchKeys` are auto-promotable
 * (title / department). `tagIds` and other non-master fields are expected to
 * be stripped by the caller before this check.
 */
export function isAutoPromotablePatch(patchKeys: string[]): boolean {
  if (patchKeys.length === 0) return false;
  return patchKeys.every(k => (AUTO_PROMOTABLE_FIELDS as readonly string[]).includes(k));
}

/**
 * Apply a title/department auto-promotion directly to master_contacts.
 * Writes employment log + audit log. Used only when the contact has a linked
 * masterContactId and the patch is auto-promotable.
 */
async function applyAutoPromotion(opts: {
  contact: typeof contactsTable.$inferSelect;
  workspaceId: string;
  userId: string | null;
}): Promise<string | null> {
  const masterId = opts.contact.masterContactId;
  if (!masterId) return null;

  const before = await db.query.masterContactsTable.findFirst({
    where: and(eq(masterContactsTable.id, masterId), isNull(masterContactsTable.deletedAt)),
  });
  if (!before) return null;

  const update: Partial<typeof masterContactsTable.$inferInsert> = { updatedAt: new Date() };
  let changed = false;
  if ((before.title ?? null) !== (opts.contact.title ?? null)) {
    update.title = opts.contact.title;
    changed = true;
  }
  if ((before.department ?? null) !== (opts.contact.department ?? null)) {
    update.department = opts.contact.department;
    changed = true;
  }
  if (!changed) return masterId;

  const [after] = await db
    .update(masterContactsTable)
    .set(stripWorkspaceFieldsForPromote(update))
    .where(eq(masterContactsTable.id, masterId))
    .returning();

  await logEmploymentChange({
    masterContactId: masterId,
    previousMasterOrganizationId: before.masterOrganizationId,
    newMasterOrganizationId: after.masterOrganizationId,
    previousTitle: before.title,
    newTitle: after.title,
    previousDepartment: before.department,
    newDepartment: after.department,
    changedByUserId: opts.userId,
    changeSource: "AUTO_PROMOTE",
  });

  await writeAuditLog({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    entityType: "master_contact",
    entityId: masterId,
    action: "AUTO_PROMOTE_TITLE_DEPT",
    before,
    after,
  });

  return masterId;
}

export interface ProcessContactPromotionInput {
  contact: typeof contactsTable.$inferSelect;
  workspaceId: string;
  changeType: "CREATED" | "UPDATED";
  patchedFields?: string[];
  userId?: string | null;
}

/**
 * Single entry point used by contacts.ts (POST/PATCH/PUT). Runs:
 *   1. Auto-promotion shortcut for title/department PATCHes on linked rows.
 *   2. Gating evaluation (org link + names + WORK channel).
 *   3. WORK-only snapshot enqueue.
 *
 * Returns a structured result instead of throwing — write paths surface the
 * rejection reason in the response so admins can see "Needs more info".
 *
 * NOTE: Existing PENDING queue items are removed when a rejection later occurs
 * (e.g. user removed the work channel) so stale entries don't sit in the
 * admin queue claiming the contact is ready for promotion.
 */
export async function processContactPromotion(
  input: ProcessContactPromotionInput,
): Promise<GatingResult> {
  const { contact, workspaceId, changeType } = input;

  // Auto-promotion shortcut: linked contact + patch limited to title/department.
  if (
    changeType === "UPDATED"
    && contact.masterContactId
    && input.patchedFields
    && isAutoPromotablePatch(input.patchedFields)
  ) {
    const masterId = await applyAutoPromotion({
      contact,
      workspaceId,
      userId: input.userId ?? null,
    });
    if (masterId) {
      return { status: "AUTO_PROMOTED", reason: null, masterId };
    }
    // fall through to normal enqueue if master row was missing.
  }

  // Look up parent org link + WORK channels in parallel.
  const [orgRow, work] = await Promise.all([
    contact.organizationId
      ? db.query.organizationsTable.findFirst({
          where: and(
            eq(organizationsTable.id, contact.organizationId),
            isNull(organizationsTable.deletedAt),
          ),
          columns: { masterOrganizationId: true },
        })
      : Promise.resolve(null),
    loadWorkChannels(contact.id),
  ]);

  const parentOrgMasterOrgId = orgRow?.masterOrganizationId ?? null;

  const rejection = evaluateGating({
    contact,
    parentOrgMasterOrgId,
    workEmails: work.workEmails,
    workPhones: work.workPhones,
  });
  if (rejection) {
    // Clear any stale PENDING queue item — the contact no longer meets gating.
    await db
      .delete(masterPromotionQueueTable)
      .where(and(
        eq(masterPromotionQueueTable.entityType, "CONTACT"),
        eq(masterPromotionQueueTable.entityId, contact.id),
        eq(masterPromotionQueueTable.status, "PENDING"),
      ));
    return { status: "REJECTED", reason: rejection };
  }

  // WORK-only snapshot. PERSONAL / HOME / MOBILE channels stay on the
  // workspace row only and never appear here.
  await enqueuePromotion("CONTACT", contact.id, workspaceId, changeType, {
    fullName: contact.fullName,
    firstName: contact.firstName,
    lastName: contact.lastName,
    title: contact.title,
    department: contact.department,
    email: work.workEmails[0] ?? null,
    phone: work.workPhones[0] ?? null,
    linkedinUrl: contact.linkedinUrl,
    workEmails: work.workEmails,
    workPhones: work.workPhones,
    stakeholderRole: contact.stakeholderRole,
    influenceLevel: contact.influenceLevel,
    organizationId: contact.organizationId,
    workspaceId,
    parentOrgLinked: true,
  });

  return { status: "ENQUEUED", reason: null };
}

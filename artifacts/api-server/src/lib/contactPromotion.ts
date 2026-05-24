/**
 * Contact-promotion gating + WORK-only snapshot (Decisions §5).
 *
 * Replaces direct calls to `enqueuePromotion("CONTACT", ...)` from the contacts
 * write path. Centralizes:
 *
 *   1. Promotion gating: a contact only enters the queue when it has a linked
 *      master organization, first_name, last_name, AND at least one verified
 *      WORK email OR WORK phone channel (Decisions §5).
 *   2. Personal-channel guardrail: the snapshot written to the queue is
 *      filtered down to WORK-labeled channels — PERSONAL/HOME/MOBILE labels
 *      are stripped.
 *
 * All gating decisions return a structured result so the caller can surface
 * "Needs more info" to the UI.
 *
 * SECURITY NOTE: The auto-promotion shortcut (title/department-only PATCHes
 * writing directly to master_contacts) was removed. All changes now go through
 * the admin promotion queue regardless of which fields changed. This prevents
 * workspace users from directly tampering with shared master-directory data.
 */
import { db } from "@workspace/db";
import {
  contactsTable,
  organizationsTable,
  contactChannelsTable,
  masterPromotionQueueTable,
} from "@workspace/db";
import { and, eq, isNull, inArray, sql } from "drizzle-orm";
import { enqueuePromotion } from "./promotionQueue";

export type GatingResult =
  | { status: "ENQUEUED"; reason: null }
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


export interface ProcessContactPromotionInput {
  contact: typeof contactsTable.$inferSelect;
  workspaceId: string;
  changeType: "CREATED" | "UPDATED";
  patchedFields?: string[];
  userId?: string | null;
}

/**
 * Single entry point used by contacts.ts (POST/PATCH/PUT). Runs:
 *   1. Gating evaluation (org link + names + WORK channel).
 *   2. WORK-only snapshot enqueue.
 *
 * Returns a structured result instead of throwing — write paths surface the
 * rejection reason in the response so admins can see "Needs more info".
 *
 * NOTE: Existing PENDING queue items are removed when a rejection later occurs
 * (e.g. user removed the work channel) so stale entries don't sit in the
 * admin queue claiming the contact is ready for promotion.
 *
 * SECURITY: The auto-promotion shortcut for title/department was removed.
 * Workspace users — even those whose contacts are legitimately linked to a
 * master record — must not be able to directly overwrite shared master-
 * directory fields without platform-admin review. All changes, including
 * title/department-only updates, now go through the normal promotion queue
 * and require explicit admin approval before touching master_contacts.
 */
export async function processContactPromotion(
  input: ProcessContactPromotionInput,
): Promise<GatingResult> {
  const { contact, workspaceId, changeType } = input;

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

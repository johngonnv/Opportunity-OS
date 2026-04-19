/**
 * Field-authority classifier (Decisions §3).
 *
 * Every column on contacts / master_contacts falls into one of three buckets:
 *
 *   - PLATFORM:        canonical, enriched, or platform-derived (canonical_name,
 *                      normalized_name, website_domain, industry, fingerprints,
 *                      aliases) AND system bookkeeping (id, workspace_id,
 *                      master_contact_id, normalized_phone, deleted_at,
 *                      created_at, updated_at, plus identity columns
 *                      first_name/last_name/full_name that flow up via the
 *                      explicit promotion snapshot). Workspace promote MUST
 *                      NOT overwrite these via the field-authority routing.
 *   - WORKSPACE:       owned by the workspace (relationship_strength,
 *                      is_primary_relationship, status, owner_user_id, notes,
 *                      pain_points, opportunity_score, commission_records,
 *                      mobile, source, source_detail, role_notes, phone_type,
 *                      is_independent, organization_id). Master adopt MUST
 *                      NOT overwrite these.
 *   - CONFLICT_REVIEW: title, department, work_email, work_phone, linkedin_url.
 *                      Last-writer-wins is unsafe; routed to admin queue, and
 *                      this is the bucket the pull-on-render Adopt UX uses.
 *
 * Single source of truth used by:
 *   - master->workspace adopt (`adopt-master` endpoint): copy CONFLICT_REVIEW only.
 *   - workspace->master promote (admin promotion approve): strip WORKSPACE keys
 *     from any payload before writing master_contacts.
 *   - auto-promotable classifier: only CONFLICT_REVIEW changes that are
 *     restricted to {title, department} can bypass admin review.
 *
 * Coverage check: `assertContactFieldsClassified()` runs at module load and
 * throws if any column on `contactsTable` is not named in one of the three
 * lists below — Task #58: every contact column has a documented authority.
 */

import { contactsTable } from "@workspace/db";
import { getTableColumns } from "drizzle-orm";

export type FieldAuthority = "PLATFORM" | "WORKSPACE" | "CONFLICT_REVIEW";

/** Conflict-review fields on a workspace `contacts` row. */
export const CONTACT_CONFLICT_REVIEW_FIELDS = [
  "title",
  "department",
  "email",
  "phone",
  "linkedinUrl",
] as const;
export type ContactConflictReviewField = (typeof CONTACT_CONFLICT_REVIEW_FIELDS)[number];

/** Workspace-authoritative fields (never flow up to master, never overwritten by adopt). */
export const CONTACT_WORKSPACE_FIELDS = [
  "relationshipStrength",
  "relationshipStrengthLabel",
  "isPrimaryRelationship",
  "status",
  "ownerUserId",
  "stakeholderRole",
  "influenceLevel",
  "painPoints",
  "opportunityScore",
  // Task #58: workspace-only data that should be explicitly classified rather
  // than fall through to the PLATFORM default.
  "organizationId",
  "mobile",
  "source",
  "sourceDetail",
  "notesText",
  "roleNotes",
  "phoneType",
  "isIndependent",
] as const;

/**
 * Platform-authoritative columns on the workspace `contacts` row. These are
 * system bookkeeping (PKs, FKs to platform-managed tables, normalized
 * derivations, soft-delete marker, timestamps) and the identity columns
 * (first/last/full name) that flow up to master only via the explicit
 * promotion snapshot — never via field-authority routing.
 */
export const CONTACT_PLATFORM_FIELDS = [
  "id",
  "workspaceId",
  "masterContactId",
  "firstName",
  "lastName",
  "fullName",
  "normalizedPhone",
  "deletedAt",
  "createdAt",
  "updatedAt",
] as const;

/** Platform-authoritative fields on master rows (never written from a workspace promote). */
export const MASTER_PLATFORM_FIELDS = [
  "canonicalName",
  "normalizedName",
  "websiteDomain",
  "industry",
  "identityFingerprint",
  "normalizedPhone",
] as const;

/** Title/department-only changes auto-promote on a linked contact. */
export const AUTO_PROMOTABLE_FIELDS = ["title", "department"] as const;
export type AutoPromotableField = (typeof AUTO_PROMOTABLE_FIELDS)[number];

export function classifyContactField(field: string): FieldAuthority {
  if ((CONTACT_CONFLICT_REVIEW_FIELDS as readonly string[]).includes(field)) return "CONFLICT_REVIEW";
  if ((CONTACT_WORKSPACE_FIELDS as readonly string[]).includes(field)) return "WORKSPACE";
  if ((CONTACT_PLATFORM_FIELDS as readonly string[]).includes(field)) return "PLATFORM";
  if ((MASTER_PLATFORM_FIELDS as readonly string[]).includes(field)) return "PLATFORM";
  // Unknown / metadata fields default to PLATFORM so a workspace promote cannot
  // accidentally overwrite an unrecognized master column. Add explicitly above
  // when intentionally classifying a new field — `assertContactFieldsClassified`
  // below will fail at boot if any contacts column is missing.
  return "PLATFORM";
}

/**
 * Boot-time exhaustiveness check: every column on the `contacts` table must
 * be named in exactly one of the three classifier lists above. Throws when
 * (a) a column is missing from all lists, or (b) a column appears in more
 * than one list. Runs at module load so a misclassified migration is caught
 * before any request is served.
 *
 * Stale entries that exist in the lists but no longer exist on the table
 * (e.g. legacy `painPoints`/`opportunityScore` historically tracked on
 * contacts but later moved) are tolerated — the goal is to ensure every
 * live column is covered, not to forbid extra entries.
 */
export function assertContactFieldsClassified(): void {
  const columns = Object.keys(getTableColumns(contactsTable));
  const conflict = new Set<string>(CONTACT_CONFLICT_REVIEW_FIELDS as readonly string[]);
  const workspace = new Set<string>(CONTACT_WORKSPACE_FIELDS as readonly string[]);
  const platform = new Set<string>(CONTACT_PLATFORM_FIELDS as readonly string[]);

  const missing: string[] = [];
  const overlapping: string[] = [];
  for (const col of columns) {
    const hits = [conflict.has(col), workspace.has(col), platform.has(col)].filter(Boolean).length;
    if (hits === 0) missing.push(col);
    if (hits > 1) overlapping.push(col);
  }

  if (missing.length > 0 || overlapping.length > 0) {
    const details = [
      missing.length > 0 ? `missing classification for: [${missing.join(", ")}]` : null,
      overlapping.length > 0 ? `multiple classifications for: [${overlapping.join(", ")}]` : null,
    ].filter(Boolean).join("; ");
    throw new Error(
      `fieldAuthority: contacts table coverage failed — ${details}. ` +
      `Add the column(s) to exactly one of CONTACT_CONFLICT_REVIEW_FIELDS, ` +
      `CONTACT_WORKSPACE_FIELDS, or CONTACT_PLATFORM_FIELDS in fieldAuthority.ts.`,
    );
  }
}

// Run the check at module-load so a bad migration is caught at server boot
// rather than at the first request that happens to traverse classify*.
assertContactFieldsClassified();

/**
 * Compare workspace and master rows on the conflict-review fields and return
 * the subset where the master value is non-null and differs from workspace.
 * Used for the "Master has updated info" badge and adopt payload.
 */
export interface ConflictReviewDiff {
  field: ContactConflictReviewField;
  workspaceValue: string | null;
  masterValue: string | null;
}

export function diffConflictReviewFields(
  workspace: Record<string, unknown>,
  master: Record<string, unknown>,
): ConflictReviewDiff[] {
  const diffs: ConflictReviewDiff[] = [];
  for (const field of CONTACT_CONFLICT_REVIEW_FIELDS) {
    const w = normalizeForCompare(workspace[field]);
    const m = normalizeForCompare(master[field]);
    if (m !== null && m !== w) {
      diffs.push({
        field,
        workspaceValue: w,
        masterValue: m,
      });
    }
  }
  return diffs;
}

function normalizeForCompare(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Strip workspace-authoritative fields from a payload that is about to be
 * written to master_contacts via promote. Mutates a shallow clone, returns the
 * sanitized object.
 */
export function stripWorkspaceFieldsForPromote<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const out: Partial<T> = { ...payload };
  for (const f of CONTACT_WORKSPACE_FIELDS) {
    delete (out as Record<string, unknown>)[f];
  }
  return out;
}

/**
 * From a partial PATCH/PUT payload, return only the conflict-review fields
 * that are present and that the field-authority layer permits adopting from
 * master. Used by the Adopt endpoint.
 */
export function pickConflictReviewFields(
  payload: Record<string, unknown>,
): Partial<Record<ContactConflictReviewField, string | null>> {
  const out: Partial<Record<ContactConflictReviewField, string | null>> = {};
  for (const f of CONTACT_CONFLICT_REVIEW_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, f)) {
      const v = payload[f];
      out[f] = v === null || v === undefined ? null : String(v);
    }
  }
  return out;
}

/**
 * Stable hash for a set of conflict-review diffs. Used by the per-user
 * dismissal record so the badge stays hidden until the master row changes
 * again on a conflict-review field.
 */
export async function diffHash(diffs: ConflictReviewDiff[]): Promise<string> {
  const canonical = diffs
    .slice()
    .sort((a, b) => a.field.localeCompare(b.field))
    .map(d => `${d.field}=${d.masterValue ?? ""}`)
    .join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns true when the only fields changed between previous and next
 * snapshots are auto-promotable (title/department) — the basis for skipping
 * the admin review step on already-linked contacts.
 */
export function isAutoPromotableChange(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  const changed: string[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const k of keys) {
    const a = normalizeForCompare(previous[k]);
    const b = normalizeForCompare(next[k]);
    if (a !== b) changed.push(k);
  }
  if (changed.length === 0) return false;
  return changed.every(k => (AUTO_PROMOTABLE_FIELDS as readonly string[]).includes(k));
}

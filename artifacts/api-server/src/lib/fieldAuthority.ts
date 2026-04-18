/**
 * Field-authority classifier (Decisions §3).
 *
 * Every column on contacts / master_contacts falls into one of three buckets:
 *
 *   - PLATFORM:        canonical, enriched, or platform-derived (canonical_name,
 *                      normalized_name, website_domain, industry, fingerprints,
 *                      aliases). Workspace promote MUST NOT overwrite these.
 *   - WORKSPACE:       owned by the workspace (relationship_strength,
 *                      is_primary_relationship, status, owner_user_id, notes,
 *                      pain_points, opportunity_score, commission_records).
 *                      Master adopt MUST NOT overwrite these.
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
 */

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
  if ((MASTER_PLATFORM_FIELDS as readonly string[]).includes(field)) return "PLATFORM";
  // Unknown / metadata fields default to PLATFORM so a workspace promote cannot
  // accidentally overwrite an unrecognized master column. Add explicitly above
  // when intentionally classifying a new field.
  return "PLATFORM";
}

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

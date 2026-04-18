/**
 * Shared phone normalization utility for contact identity.
 * Produces an E.164-ish string. Defaults to +1 country code when 10 digits provided.
 * Returns null when input has no digits.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/**
 * Identity fingerprint per contact-identity v1 decisions section 2.
 * sha256(lower(work_email) || ':' || e164(work_phone) || ':' || master_org_id)
 *
 * NOTE: This helper is for backfill / app-side computation. The same logic is
 * reproduced in the migration SQL using digest(..., 'sha256').
 */
export async function computeIdentityFingerprint(
  workEmail: string | null,
  workPhone: string | null,
  masterOrgId: string | null,
): Promise<string | null> {
  const email = (workEmail ?? "").trim().toLowerCase();
  const phone = normalizePhoneE164(workPhone) ?? "";
  const org = masterOrgId ?? "";
  if (!email && !phone && !org) return null;
  const input = `${email}:${phone}:${org}`;
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

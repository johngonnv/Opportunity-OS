import { db } from "@workspace/db";
import { contactsTable } from "@workspace/db";
import { isNull } from "drizzle-orm";
import { eq, and, or, ilike, sql } from "drizzle-orm";

export interface NormalizedCapture {
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string;
  emailDomain: string;
}

export interface DuplicateHit {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  organizationId: string | null;
  matchReason: "email" | "phone";
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function extractEmailDomain(email: string): string {
  const normalized = normalizeEmail(email);
  const atIdx = normalized.lastIndexOf("@");
  if (atIdx < 0) return "";
  return normalized.slice(atIdx + 1);
}

export function normalizeName(raw: string): { firstName: string; lastName: string; fullName: string } {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "", fullName: "" };
  const parts = trimmed.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "", fullName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" "), fullName: trimmed };
}

export function normalizeCapture(input: {
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}): NormalizedCapture {
  let firstName = (input.firstName || "").trim();
  let lastName = (input.lastName || "").trim();

  if (input.name && (!firstName || !lastName)) {
    const parsed = normalizeName(input.name);
    if (!firstName) firstName = parsed.firstName;
    if (!lastName) lastName = parsed.lastName;
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
  const email = input.email ? normalizeEmail(input.email) : "";
  const emailDomain = email ? extractEmailDomain(email) : "";

  return {
    firstName,
    lastName,
    fullName,
    phone: input.phone ? normalizePhone(input.phone) : "",
    email,
    emailDomain,
  };
}

export async function findDuplicate(
  workspaceId: string,
  normalized: NormalizedCapture,
): Promise<DuplicateHit | null> {
  if (!normalized.fullName || normalized.fullName === "Unknown") return null;
  if (!normalized.email && !normalized.phone) return null;

  const workspaceCond = eq(contactsTable.workspaceId, workspaceId);

  const subConditions: ReturnType<typeof sql>[] = [];

  if (normalized.email) {
    subConditions.push(
      sql`(lower(${contactsTable.fullName}) = lower(${normalized.fullName}) AND lower(${contactsTable.email}) = lower(${normalized.email}))`,
    );
  }

  if (normalized.phone) {
    const digits = normalized.phone.replace(/\D/g, "");
    if (digits) {
      subConditions.push(
        sql`(lower(${contactsTable.fullName}) = lower(${normalized.fullName}) AND (regexp_replace(coalesce(${contactsTable.phone}, ''), '[^0-9]', '', 'g') = ${digits} OR regexp_replace(coalesce(${contactsTable.mobile}, ''), '[^0-9]', '', 'g') = ${digits}))`,
      );
    }
  }

  if (subConditions.length === 0) return null;

  const orClause = subConditions.length === 1 ? subConditions[0] : or(...subConditions)!;

  const rows = await db
    .select({
      id: contactsTable.id,
      fullName: contactsTable.fullName,
      email: contactsTable.email,
      phone: contactsTable.phone,
      organizationId: contactsTable.organizationId,
    })
    .from(contactsTable)
    .where(and(workspaceCond, isNull(contactsTable.deletedAt), orClause))
    .limit(1);

  if (!rows[0]) return null;

  const hit = rows[0];
  const matchReason: DuplicateHit["matchReason"] =
    normalized.email && hit.email && hit.email.toLowerCase() === normalized.email ? "email" : "phone";

  return { ...hit, matchReason };
}

import { db } from "@workspace/db";
import { contactsTable } from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";

export interface NormalizedCapture {
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string;
}

export interface DuplicateHit {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  organizationId: string | null;
  matchReason: "email" | "phone" | "name";
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

export function normalizeName(raw: string): { firstName: string; lastName: string; fullName: string } {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const parts = trimmed.split(" ");
  if (parts.length === 0 || !trimmed) return { firstName: "", lastName: "", fullName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "", fullName: parts[0] };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  const fullName = trimmed;
  return { firstName, lastName, fullName };
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
  let fullName = "";

  if (input.name) {
    const parsed = normalizeName(input.name);
    if (!firstName) firstName = parsed.firstName;
    if (!lastName) lastName = parsed.lastName;
  }

  fullName = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";

  return {
    firstName,
    lastName,
    fullName,
    phone: input.phone ? normalizePhone(input.phone) : "",
    email: input.email ? normalizeEmail(input.email) : "",
  };
}

export async function findDuplicate(
  workspaceId: string,
  normalized: NormalizedCapture,
): Promise<DuplicateHit | null> {
  const conditions: ReturnType<typeof sql>[] = [];

  if (normalized.email) {
    conditions.push(sql`(lower(${contactsTable.email}) = lower(${normalized.email}))`);
  }
  if (normalized.phone) {
    const digits = normalized.phone.replace(/\D/g, "");
    conditions.push(sql`(regexp_replace(coalesce(${contactsTable.phone}, ${contactsTable.mobile}, ''), '[^0-9]', '', 'g') = ${digits} AND regexp_replace(coalesce(${contactsTable.phone}, ${contactsTable.mobile}, ''), '[^0-9]', '', 'g') != '')`);
  }

  if (conditions.length === 0 && normalized.fullName && normalized.fullName !== "Unknown") {
    const rows = await db
      .select({
        id: contactsTable.id,
        fullName: contactsTable.fullName,
        email: contactsTable.email,
        phone: contactsTable.phone,
        organizationId: contactsTable.organizationId,
      })
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.workspaceId, workspaceId),
          ilike(contactsTable.fullName, normalized.fullName),
        ),
      )
      .limit(1);
    if (rows[0]) return { ...rows[0], matchReason: "name" };
    return null;
  }

  if (conditions.length === 0) return null;

  const orClause = conditions.length === 1 ? conditions[0] : or(...conditions)!;

  const rows = await db
    .select({
      id: contactsTable.id,
      fullName: contactsTable.fullName,
      email: contactsTable.email,
      phone: contactsTable.phone,
      organizationId: contactsTable.organizationId,
    })
    .from(contactsTable)
    .where(and(eq(contactsTable.workspaceId, workspaceId), orClause))
    .limit(1);

  if (!rows[0]) return null;

  const hit = rows[0];
  let matchReason: DuplicateHit["matchReason"] = "name";
  if (normalized.email && hit.email && hit.email.toLowerCase() === normalized.email.toLowerCase()) {
    matchReason = "email";
  } else if (normalized.phone) {
    matchReason = "phone";
  }

  return { ...hit, matchReason };
}

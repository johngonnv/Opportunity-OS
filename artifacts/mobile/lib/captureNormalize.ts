export interface RawCaptureFields {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  linkedinUrl?: string;
  department?: string;
  notes?: string;
}

export interface LocalNormalized extends RawCaptureFields {
  fullName?: string;
  emailDomain?: string;
}

function capitalizeWords(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function sanitizePhone(raw: string): string {
  const stripped = raw.replace(/[^\d+\-().x ]/g, "").trim();
  return stripped;
}

function extractDomain(email: string): string | undefined {
  const at = email.lastIndexOf("@");
  if (at === -1) return undefined;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return domain.length > 0 ? domain : undefined;
}

export function normalizeLocalCapture(fields: RawCaptureFields): LocalNormalized {
  const firstName = fields.firstName ? capitalizeWords(fields.firstName) : undefined;
  const lastName = fields.lastName ? capitalizeWords(fields.lastName) : undefined;
  const email = fields.email ? fields.email.trim().toLowerCase() : undefined;
  const phone = fields.phone ? sanitizePhone(fields.phone) : undefined;
  const title = fields.title ? fields.title.trim() : undefined;
  const linkedinUrl = fields.linkedinUrl ? fields.linkedinUrl.trim() : undefined;
  const department = fields.department ? fields.department.trim() : undefined;
  const notes = fields.notes ? fields.notes.trim() : undefined;

  const nameParts = [firstName, lastName].filter(Boolean);
  const fullName = nameParts.length > 0 ? nameParts.join(" ") : undefined;
  const emailDomain = email ? extractDomain(email) : undefined;

  return { firstName, lastName, email, phone, title, linkedinUrl, department, notes, fullName, emailDomain };
}

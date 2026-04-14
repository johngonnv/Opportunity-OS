export interface RawCaptureFields {
  firstName?: string;
  lastName?: string;
  fullName?: string;
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

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+") && digitsOnly.length >= 10) {
    return `+${digitsOnly}`;
  }
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return `+${digitsOnly}`;
  }
  return trimmed.replace(/[^\d+\-().x ]/g, "").trim();
}

function extractDomain(email: string): string | undefined {
  const at = email.lastIndexOf("@");
  if (at === -1) return undefined;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return domain.length > 0 ? domain : undefined;
}

function parseFullName(full: string): { firstName?: string; lastName?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: capitalizeWords(parts[0]) };
  return {
    firstName: capitalizeWords(parts[0]),
    lastName: capitalizeWords(parts.slice(1).join(" ")),
  };
}

export function normalizeLocalCapture(fields: RawCaptureFields): LocalNormalized {
  let firstName = fields.firstName ? capitalizeWords(fields.firstName) : undefined;
  let lastName = fields.lastName ? capitalizeWords(fields.lastName) : undefined;

  if ((!firstName || !lastName) && fields.fullName) {
    const parsed = parseFullName(fields.fullName);
    if (!firstName && parsed.firstName) firstName = parsed.firstName;
    if (!lastName && parsed.lastName) lastName = parsed.lastName;
  }

  const email = fields.email ? fields.email.trim().toLowerCase() : undefined;
  const phone = fields.phone ? normalizePhone(fields.phone) : undefined;
  const title = fields.title ? fields.title.trim() : undefined;
  const linkedinUrl = fields.linkedinUrl ? fields.linkedinUrl.trim() : undefined;
  const department = fields.department ? fields.department.trim() : undefined;
  const notes = fields.notes ? fields.notes.trim() : undefined;

  const nameParts = [firstName, lastName].filter(Boolean);
  const fullName = nameParts.length > 0 ? nameParts.join(" ") : undefined;
  const emailDomain = email ? extractDomain(email) : undefined;

  return { firstName, lastName, email, phone, title, linkedinUrl, department, notes, fullName, emailDomain };
}

export interface ParsedContact {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  company?: string;
}

const FIELD_MAP: Record<string, keyof ParsedContact> = {
  name: "name",
  full_name: "name",
  fullname: "name",
  "full name": "name",
  first_name: "firstName",
  firstname: "firstName",
  "first name": "firstName",
  last_name: "lastName",
  lastname: "lastName",
  "last name": "lastName",
  email: "email",
  email_address: "email",
  "email address": "email",
  e_mail: "email",
  "e-mail": "email",
  phone: "phone",
  phone_number: "phone",
  "phone number": "phone",
  mobile: "phone",
  mobile_number: "phone",
  "mobile number": "phone",
  cell: "phone",
  telephone: "phone",
  title: "title",
  job_title: "title",
  "job title": "title",
  role: "title",
  position: "title",
  company: "company",
  company_name: "company",
  "company name": "company",
  organization: "company",
  org: "company",
  employer: "company",
  "employer name": "company",
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map((v) => v.trim());
}

export function parseCSV(text: string): ParsedContact[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9 _-]/g, "").trim());

  const columnMap: Array<{ idx: number; field: keyof ParsedContact }> = [];
  headers.forEach((h, idx) => {
    const field = FIELD_MAP[h];
    if (field && !columnMap.find((c) => c.field === field)) {
      columnMap.push({ idx, field });
    }
  });

  if (columnMap.length === 0) return [];

  return lines
    .slice(1)
    .map((line) => {
      const values = parseCSVLine(line);
      const contact: ParsedContact = {};
      columnMap.forEach(({ idx, field }) => {
        const v = values[idx];
        if (v) (contact as Record<string, string>)[field] = v;
      });
      return contact;
    })
    .filter((c) => c.name || c.firstName || c.email || c.phone);
}

const LEGAL_SUFFIXES = [
  "incorporated", "inc", "corporation", "corp", "limited liability company",
  "llc", "limited", "ltd", "company", "co", "lp", "llp", "plc",
  "association", "assoc", "foundation", "health system", "health systems",
  "health network", "healthcare", "health care", "hospital system",
  "medical center", "medical group", "medical", "hospital", "hospitals",
];

export function normalizeOrgName(name: string): string {
  let n = name.toLowerCase().trim();
  n = n.replace(/[^a-z0-9\s]/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  for (const suffix of LEGAL_SUFFIXES) {
    const pattern = new RegExp(`\\b${suffix.replace(/\s+/g, "\\s+")}\\b`, "g");
    n = n.replace(pattern, "").trim();
  }
  return n.replace(/\s+/g, " ").trim();
}

export function normalizeDomain(url: string): string | null {
  if (!url || !url.trim()) return null;
  try {
    let normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = "https://" + normalized;
    }
    const parsed = new URL(normalized);
    let hostname = parsed.hostname.toLowerCase();
    hostname = hostname.replace(/^www\./, "");
    const parts = hostname.split(".");
    if (parts.length > 2) {
      hostname = parts.slice(-2).join(".");
    }
    return hostname || null;
  } catch {
    let domain = url.toLowerCase().trim();
    domain = domain.replace(/^https?:\/\//i, "");
    domain = domain.replace(/^www\./i, "");
    domain = domain.split("/")[0];
    return domain || null;
  }
}

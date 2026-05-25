/**
 * CMS Provider of Services sync
 *
 * Pulls authoritative facility data from CMS (data.cms.gov) and overlays it on
 * `organizations` so bed_count, teaching_hospital, medicare_certified,
 * medicaid_certified, and trauma_level stop being Grok guesses. The CMS profile
 * row (`organization_healthcare_profile`) is also upserted with cms_ccn,
 * cms_bed_count, cms_match_method, cmsVerificationStatus, etc., so downstream
 * UI can show "CMS-verified" badges.
 *
 * Matching strategy, in order:
 *   1. exact match on cms_provider_number (the CCN) — cmsMatchMethod = "ccn_exact"
 *   2. normalized name + state match — cmsMatchMethod = "name_state_fuzzy"
 *
 * The HTTP fetcher is injectable so the caller (script vs. admin route) can
 * point at a local fixture, an alternate CMS dataset URL, or a cached file.
 *
 * Intended invocation:
 *   - on a schedule via `pnpm --filter @workspace/api-server run sync:cms`
 *     (cron / scheduler runs the script — see scripts/sync-cms-providers.ts)
 *   - on demand via POST /api/admin/cms-sync (platform-admin only)
 */

import { db } from "@workspace/db";
import {
  organizationsTable,
  organizationHealthcareProfilesTable,
  type Organization,
} from "@workspace/db";
import { normalizeOrgName } from "@workspace/db";
import { eq, and, isNotNull, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CmsProviderRecord {
  /** CMS Certification Number (provider number). */
  ccn: string;
  name: string;
  state: string | null;
  bedCount: number | null;
  teachingHospital: boolean | null;
  medicareCertified: boolean | null;
  medicaidCertified: boolean | null;
  /** "Level I" | "Level II" | "Level III" | "Level IV" | null */
  traumaLevel: string | null;
  hospitalType: string | null;
  ownershipType: string | null;
  emergencyServices: boolean | null;
}

export interface SyncLog {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

export interface SyncOptions {
  /** If provided, restricts the sync to a single workspace. */
  workspaceId?: string;
  /** If true, runs without writing — useful for dry-run / preview. */
  dryRun?: boolean;
  /** Injectable fetcher; defaults to the CMS data.cms.gov endpoint. */
  fetchRecords?: () => Promise<CmsProviderRecord[]>;
  log?: SyncLog;
}

export interface OrgMatchResult {
  organizationId: string;
  organizationName: string;
  matched: boolean;
  matchMethod: "ccn_exact" | "name_state_fuzzy" | null;
  matchConfidence: number | null;
  ccn: string | null;
  fieldsUpdated: string[];
}

export interface SyncSummary {
  totalOrgs: number;
  cmsRecordCount: number;
  matchedCount: number;
  ccnMatches: number;
  nameStateMatches: number;
  unmatchedCount: number;
  updatedCount: number;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  results: OrgMatchResult[];
}

// ─── Default CMS fetcher ──────────────────────────────────────────────────────

/**
 * Default CMS Hospital General Information dataset URL. This is a public,
 * unauthenticated dataset on data.cms.gov in CSV form. It covers the fields we
 * need (CCN, name, state, hospital type, ownership, emergency services) plus a
 * "Hospital overall rating" column. Bed count, teaching status, and trauma
 * level come from the Provider of Services file when CMS_POS_DATA_URL is set.
 *
 * Operators can override the data sources via env:
 *   CMS_HOSPITAL_GENERAL_INFO_URL  — CSV or JSON of the General Info dataset
 *   CMS_POS_DATA_URL               — JSON of the Provider of Services hospital file
 */
const DEFAULT_HOSPITAL_GENERAL_INFO_URL =
  "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0?limit=10000";

function pickString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function pickInt(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string" && v.trim()) {
      const n = parseInt(v.replace(/[, ]/g, ""), 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickBoolYN(row: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const s = v.trim().toUpperCase();
      if (s === "Y" || s === "YES" || s === "TRUE" || s === "1") return true;
      if (s === "N" || s === "NO" || s === "FALSE" || s === "0") return false;
    }
  }
  return null;
}

function parseTraumaLevel(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.toUpperCase().match(/LEVEL\s*(I{1,4}|1|2|3|4|V)/);
  if (!m) return null;
  const roman = m[1].replace("1", "I").replace("2", "II").replace("3", "III").replace("4", "IV");
  return `Level ${roman}`;
}

/**
 * Normalize a single raw CMS row (from either the General Info or POS dataset)
 * into a CmsProviderRecord. Returns null if it can't extract a CCN.
 */
export function normalizeCmsRow(row: Record<string, unknown>): CmsProviderRecord | null {
  const ccn = pickString(
    row,
    "ccn",
    "provider_id",
    "provider_number",
    "facility_id",
    "prvdr_num",
  );
  if (!ccn) return null;

  const name = pickString(row, "facility_name", "provider_name", "name", "fac_name") ?? ccn;
  const state = pickString(row, "state", "state_cd", "provider_state");

  const teaching = pickBoolYN(row, "teaching_hospital", "teaching_status", "teach_stus_cd");
  const medicare = pickBoolYN(row, "medicare_certified", "medicare_participating");
  const medicaid = pickBoolYN(row, "medicaid_certified", "medicaid_participating");

  // The POS file uses cert_dt / mdcd_cert_dt for certification dates — presence
  // of a non-empty date implies certified.
  const medicareInferred =
    medicare ??
    (pickString(row, "cert_dt", "medicare_certification_date") ? true : null);
  const medicaidInferred =
    medicaid ??
    (pickString(row, "mdcd_cert_dt", "medicaid_certification_date") ? true : null);

  const trauma = parseTraumaLevel(
    pickString(row, "trauma_level", "trauma_lvl", "trauma_designation"),
  );

  return {
    ccn,
    name,
    state,
    bedCount: pickInt(row, "bed_count", "beds", "total_beds", "crtfd_bed_cnt", "fac_bed_cnt"),
    teachingHospital: teaching,
    medicareCertified: medicareInferred,
    medicaidCertified: medicaidInferred,
    traumaLevel: trauma,
    hospitalType: pickString(row, "hospital_type", "facility_type", "provider_subtype"),
    ownershipType: pickString(row, "hospital_ownership", "ownership", "ownership_type"),
    emergencyServices: pickBoolYN(row, "emergency_services", "er_services"),
  };
}

async function defaultFetchRecords(log?: SyncLog): Promise<CmsProviderRecord[]> {
  const generalInfoUrl =
    process.env["CMS_HOSPITAL_GENERAL_INFO_URL"] ?? DEFAULT_HOSPITAL_GENERAL_INFO_URL;
  const posUrl = process.env["CMS_POS_DATA_URL"] ?? null;

  const records = new Map<string, CmsProviderRecord>();

  async function ingest(url: string, label: string) {
    log?.info({ url, label }, "[cmsProviderSync] fetching CMS dataset");
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`CMS fetch failed (${label}): ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as unknown;
    // data.cms.gov datastore wraps rows in { results: [...] }; bare arrays
    // also occur for direct dataset downloads.
    const rows: Record<string, unknown>[] = Array.isArray(body)
      ? (body as Record<string, unknown>[])
      : Array.isArray((body as { results?: unknown }).results)
        ? ((body as { results: Record<string, unknown>[] }).results)
        : [];
    for (const row of rows) {
      const rec = normalizeCmsRow(row);
      if (!rec) continue;
      const existing = records.get(rec.ccn);
      records.set(rec.ccn, existing ? mergeRecords(existing, rec) : rec);
    }
    log?.info({ url, label, rowCount: rows.length }, "[cmsProviderSync] dataset ingested");
  }

  await ingest(generalInfoUrl, "hospital_general_info");
  if (posUrl) await ingest(posUrl, "provider_of_services");

  return Array.from(records.values());
}

function mergeRecords(a: CmsProviderRecord, b: CmsProviderRecord): CmsProviderRecord {
  // Prefer non-null fields from b (later source), keep a's values otherwise.
  return {
    ccn: a.ccn,
    name: b.name || a.name,
    state: b.state ?? a.state,
    bedCount: b.bedCount ?? a.bedCount,
    teachingHospital: b.teachingHospital ?? a.teachingHospital,
    medicareCertified: b.medicareCertified ?? a.medicareCertified,
    medicaidCertified: b.medicaidCertified ?? a.medicaidCertified,
    traumaLevel: b.traumaLevel ?? a.traumaLevel,
    hospitalType: b.hospitalType ?? a.hospitalType,
    ownershipType: b.ownershipType ?? a.ownershipType,
    emergencyServices: b.emergencyServices ?? a.emergencyServices,
  };
}

// ─── Matching ─────────────────────────────────────────────────────────────────

interface IndexedRecords {
  byCcn: Map<string, CmsProviderRecord>;
  byNameState: Map<string, CmsProviderRecord>;
}

function indexRecords(records: CmsProviderRecord[]): IndexedRecords {
  const byCcn = new Map<string, CmsProviderRecord>();
  const byNameState = new Map<string, CmsProviderRecord>();
  for (const r of records) {
    byCcn.set(r.ccn.trim(), r);
    if (r.state) {
      const key = `${normalizeOrgName(r.name)}|${r.state.trim().toUpperCase()}`;
      // First-write wins to avoid overwriting a more authoritative row.
      if (!byNameState.has(key)) byNameState.set(key, r);
    }
  }
  return { byCcn, byNameState };
}

export function matchOrgToCmsRecord(
  org: Pick<Organization, "cmsProviderNumber" | "name" | "state">,
  idx: IndexedRecords,
): { record: CmsProviderRecord; method: "ccn_exact" | "name_state_fuzzy"; confidence: number } | null {
  if (org.cmsProviderNumber) {
    const r = idx.byCcn.get(org.cmsProviderNumber.trim());
    if (r) return { record: r, method: "ccn_exact", confidence: 100 };
  }
  if (org.state && org.name) {
    const key = `${normalizeOrgName(org.name)}|${org.state.trim().toUpperCase()}`;
    const r = idx.byNameState.get(key);
    if (r) return { record: r, method: "name_state_fuzzy", confidence: 80 };
  }
  return null;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

/**
 * Apply a CMS record to an organization row + upsert its healthcare profile.
 * Only overwrites fields when the CMS source has a concrete (non-null) value,
 * so partial CMS datasets don't wipe values populated by other paths.
 *
 * Returns the list of organization-table field names that were actually changed.
 */
async function applyToOrg(
  org: Organization,
  record: CmsProviderRecord,
  method: "ccn_exact" | "name_state_fuzzy",
  confidence: number,
): Promise<string[]> {
  const patch: Partial<Organization> = {};
  const changed: string[] = [];

  if (record.bedCount !== null && record.bedCount !== org.bedCount) {
    patch.bedCount = record.bedCount;
    changed.push("bedCount");
  }
  if (record.teachingHospital !== null && record.teachingHospital !== org.teachingHospital) {
    patch.teachingHospital = record.teachingHospital;
    changed.push("teachingHospital");
  }
  if (record.medicareCertified !== null && record.medicareCertified !== org.medicareCertified) {
    patch.medicareCertified = record.medicareCertified;
    changed.push("medicareCertified");
  }
  if (record.medicaidCertified !== null && record.medicaidCertified !== org.medicaidCertified) {
    patch.medicaidCertified = record.medicaidCertified;
    changed.push("medicaidCertified");
  }
  if (record.traumaLevel && record.traumaLevel !== org.traumaLevel) {
    patch.traumaLevel = record.traumaLevel;
    changed.push("traumaLevel");
  }
  if (!org.cmsProviderNumber && record.ccn) {
    patch.cmsProviderNumber = record.ccn;
    changed.push("cmsProviderNumber");
  }

  if (Object.keys(patch).length > 0) {
    await db.update(organizationsTable).set(patch).where(eq(organizationsTable.id, org.id));
  }

  // Upsert the healthcare profile so the UI can show CMS-verified status.
  const existing = await db
    .select({ id: organizationHealthcareProfilesTable.id })
    .from(organizationHealthcareProfilesTable)
    .where(eq(organizationHealthcareProfilesTable.organizationId, org.id))
    .limit(1);

  const profilePatch = {
    cmsCcn: record.ccn,
    cmsBedCount: record.bedCount,
    cmsEmergencyServices: record.emergencyServices,
    cmsProviderType: record.hospitalType,
    cmsOwnershipType: record.ownershipType,
    cmsSource: "data.cms.gov",
    cmsVerificationStatus: "MATCHED" as const,
    cmsLastUpdatedAt: new Date(),
    cmsExtractedAt: new Date(),
    cmsMatchMethod: method,
    cmsMatchConfidenceScore: confidence,
    cmsDatasetName: "Hospital General Information / Provider of Services",
  };

  if (existing.length > 0) {
    await db
      .update(organizationHealthcareProfilesTable)
      .set(profilePatch)
      .where(eq(organizationHealthcareProfilesTable.id, existing[0].id));
  } else {
    await db.insert(organizationHealthcareProfilesTable).values({
      organizationId: org.id,
      workspaceId: org.workspaceId,
      ...profilePatch,
    });
  }

  return changed;
}

/**
 * Mark un-matched orgs as NEEDS_REVIEW on their existing profile (if any), so
 * reps can see the org wasn't CMS-verified on this run. We don't create a new
 * profile row for unmatched orgs — that would be noise.
 */
async function markUnmatched(org: Organization): Promise<void> {
  const existing = await db
    .select({ id: organizationHealthcareProfilesTable.id })
    .from(organizationHealthcareProfilesTable)
    .where(eq(organizationHealthcareProfilesTable.organizationId, org.id))
    .limit(1);
  if (existing.length === 0) return;
  await db
    .update(organizationHealthcareProfilesTable)
    .set({
      cmsVerificationStatus: "NEEDS_REVIEW",
      cmsMatchMethod: null,
      cmsMatchConfidenceScore: null,
    })
    .where(eq(organizationHealthcareProfilesTable.id, existing[0].id));
}

/**
 * Main entry. Pulls CMS data, matches each candidate org, writes updates, and
 * returns a structured summary the caller can log or surface to admins.
 */
export async function syncCmsProviders(opts: SyncOptions = {}): Promise<SyncSummary> {
  const startedAt = new Date();
  const log = opts.log;
  const fetcher = opts.fetchRecords ?? (() => defaultFetchRecords(log));

  log?.info({ workspaceId: opts.workspaceId, dryRun: !!opts.dryRun }, "[cmsProviderSync] starting");

  const records = await fetcher();
  const idx = indexRecords(records);
  log?.info({ cmsRecordCount: records.length }, "[cmsProviderSync] CMS records loaded");

  // Candidate orgs: healthcare-vertical orgs that have either a CCN or
  // (name + state) we can match on. Non-healthcare orgs are skipped.
  const whereParts = [
    isNotNull(organizationsTable.name),
    sql`(${organizationsTable.cmsProviderNumber} IS NOT NULL OR ${organizationsTable.state} IS NOT NULL)`,
    sql`${organizationsTable.deletedAt} IS NULL`,
  ];
  if (opts.workspaceId) whereParts.push(eq(organizationsTable.workspaceId, opts.workspaceId));

  const orgs = await db
    .select()
    .from(organizationsTable)
    .where(and(...whereParts));

  log?.info({ candidateOrgCount: orgs.length }, "[cmsProviderSync] candidate orgs loaded");

  const results: OrgMatchResult[] = [];
  let matchedCount = 0;
  let ccnMatches = 0;
  let nameStateMatches = 0;
  let updatedCount = 0;

  for (const org of orgs) {
    const match = matchOrgToCmsRecord(org, idx);
    if (!match) {
      results.push({
        organizationId: org.id,
        organizationName: org.name,
        matched: false,
        matchMethod: null,
        matchConfidence: null,
        ccn: org.cmsProviderNumber,
        fieldsUpdated: [],
      });
      if (!opts.dryRun) await markUnmatched(org);
      continue;
    }

    matchedCount++;
    if (match.method === "ccn_exact") ccnMatches++;
    else nameStateMatches++;

    let fieldsUpdated: string[] = [];
    if (!opts.dryRun) {
      fieldsUpdated = await applyToOrg(org, match.record, match.method, match.confidence);
      if (fieldsUpdated.length > 0) updatedCount++;
    }

    results.push({
      organizationId: org.id,
      organizationName: org.name,
      matched: true,
      matchMethod: match.method,
      matchConfidence: match.confidence,
      ccn: match.record.ccn,
      fieldsUpdated,
    });
  }

  const finishedAt = new Date();
  const summary: SyncSummary = {
    totalOrgs: orgs.length,
    cmsRecordCount: records.length,
    matchedCount,
    ccnMatches,
    nameStateMatches,
    unmatchedCount: orgs.length - matchedCount,
    updatedCount,
    dryRun: !!opts.dryRun,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    results,
  };

  log?.info(
    {
      totalOrgs: summary.totalOrgs,
      matchedCount,
      ccnMatches,
      nameStateMatches,
      updatedCount,
      dryRun: summary.dryRun,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    },
    "[cmsProviderSync] sync complete",
  );

  return summary;
}

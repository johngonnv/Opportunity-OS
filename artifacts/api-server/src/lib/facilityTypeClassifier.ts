/**
 * Healthcare Facility Type Classifier
 *
 * Calls Grok to auto-assign clinical/healthcare classification fields to
 * an organization based on its name and (optional) description. Returns
 * denormalized fields that are written directly onto the `organizations`
 * table (facilityType, naicsCode, cmsDesignation, subType, confidence).
 *
 * This is intentionally separate from the GovCon NAICS/PSC classifier
 * (govconClassifier.ts) which writes to organization_naics / organization_psc.
 */

import { getAiClient, GROK_DEFAULT_MODEL, logTokenUsage } from "./aiProvider";

export interface FacilityClassification {
  facilityType: string | null;
  naicsCode: string | null;
  cmsDesignation: string | null;
  subType: string | null;
  confidence: number | null;
}

export interface ClassifyFacilityLog {
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

const EMPTY_RESULT: FacilityClassification = {
  facilityType: null,
  naicsCode: null,
  cmsDesignation: null,
  subType: null,
  confidence: null,
};

// Vertical-aware NAICS reference tables
function getNaicsReference(vertical?: string | null, subVertical?: string | null): string {
  const v = (vertical || "").toLowerCase();
  const sv = (subVertical || "").toLowerCase();

  if (v === "healthcare") {
    return NAICS_REFERENCE; // existing healthcare table
  }

  if (v === "industrial_services" || sv.includes("water")) {
    return `
221310  Water Supply and Irrigation Systems
221320  Sewage Treatment Facilities
325180  Other Basic Inorganic Chemical Manufacturing
541620  Environmental Consulting Services
333318  Other Commercial and Service Industry Machinery Manufacturing
332999  All Other Miscellaneous Fabricated Metal Product Manufacturing
562998  All Other Miscellaneous Waste Management Services
221118  Other Electric Power Generation (for power plant water treatment)
334519  Other Measuring and Controlling Device Manufacturing (sensors/monitoring)
541330  Engineering Services
`.trim();
  }

  if (v === "general_business" || v === "manufacturing") {
    return `
311000  Food Manufacturing
324000  Petroleum and Coal Products Manufacturing
325000  Chemical Manufacturing
332000  Fabricated Metal Product Manufacturing
333000  Machinery Manufacturing
334000  Computer and Electronic Product Manufacturing
335000  Electrical Equipment, Appliance, and Component Manufacturing
221118  Other Electric Power Generation
518210  Data Processing, Hosting, and Related Services (data centers)
541620  Environmental Consulting Services
`.trim();
  }

  // Default / broad industrial + commercial
  return `
221100  Electric Power Generation, Transmission and Distribution
518210  Data Processing, Hosting, and Related Services
541620  Environmental Consulting Services
221310  Water Supply and Irrigation Systems
325180  Other Basic Inorganic Chemical Manufacturing
332000  Fabricated Metal Product Manufacturing
`.trim();
}

// NAICS reference table (6-digit codes used in healthcare facility taxonomy).
// Sent to Grok as the closed vocabulary for `naicsCode` selection.
const NAICS_REFERENCE = `
622110  General Medical and Surgical Hospitals
622210  Psychiatric and Substance Abuse Hospitals
622310  Specialty (except Psychiatric and Substance Abuse) Hospitals
621111  Offices of Physicians (except Mental Health Specialists)
621112  Offices of Physicians, Mental Health Specialists
621210  Offices of Dentists
621310  Offices of Chiropractors
621320  Offices of Optometrists
621330  Offices of Mental Health Practitioners (except Physicians)
621340  Offices of Physical, Occupational and Speech Therapists
621391  Offices of Podiatrists
621399  Offices of All Other Miscellaneous Health Practitioners
621410  Family Planning Centers
621420  Outpatient Mental Health and Substance Abuse Centers
621491  HMO Medical Centers
621492  Kidney Dialysis Centers
621493  Freestanding Ambulatory Surgical and Emergency Centers
621498  All Other Outpatient Care Centers
621511  Medical Laboratories
621512  Diagnostic Imaging Centers
621610  Home Health Care Services
621910  Ambulance Services
621991  Blood and Organ Banks
621999  All Other Miscellaneous Ambulatory Health Care Services
623110  Nursing Care Facilities (Skilled Nursing Facilities)
623210  Residential Intellectual and Developmental Disability Facilities
623220  Residential Mental Health and Substance Abuse Facilities
623311  Continuing Care Retirement Communities
623312  Assisted Living Facilities for the Elderly
623990  Other Residential Care Facilities
624190  Other Individual and Family Services
624310  Vocational Rehabilitation Services
`.trim();

// Closed vocabularies for facilityType + cmsDesignation so the output is
// predictable and filterable in the UI.
const FACILITY_TYPES = [
  "ACUTE_CARE_HOSPITAL",
  "CRITICAL_ACCESS_HOSPITAL",
  "CHILDRENS_HOSPITAL",
  "PSYCHIATRIC_HOSPITAL",
  "REHABILITATION_HOSPITAL",
  "LONG_TERM_ACUTE_CARE",
  "SPECIALTY_HOSPITAL",
  "AMBULATORY_SURGERY_CENTER",
  "URGENT_CARE",
  "DIALYSIS_CENTER",
  "IMAGING_CENTER",
  "PHYSICIAN_PRACTICE",
  "FQHC",
  "RURAL_HEALTH_CLINIC",
  "SKILLED_NURSING_FACILITY",
  "ASSISTED_LIVING",
  "HOSPICE",
  "HOME_HEALTH_AGENCY",
  "BEHAVIORAL_HEALTH",
  "EMS_AGENCY",
  "LABORATORY",
  "PHARMACY",
  "HEALTH_SYSTEM",
  "PAYER",
  "GOVERNMENT_AGENCY",
  "OTHER",
];

const CMS_DESIGNATIONS = [
  "PPS_HOSPITAL",
  "CRITICAL_ACCESS_HOSPITAL",
  "LONG_TERM_CARE_HOSPITAL",
  "INPATIENT_REHAB_FACILITY",
  "INPATIENT_PSYCHIATRIC_FACILITY",
  "CHILDRENS_HOSPITAL",
  "CANCER_HOSPITAL",
  "RELIGIOUS_NONMEDICAL",
  "SOLE_COMMUNITY_HOSPITAL",
  "MEDICARE_DEPENDENT_HOSPITAL",
  "RURAL_REFERRAL_CENTER",
  "FQHC",
  "RHC",
  "ASC",
  "HHA",
  "HOSPICE",
  "SNF",
  "ESRD_FACILITY",
  "NOT_APPLICABLE",
];

interface GrokResponseShape {
  facilityType?: string | null;
  naicsCode?: string | null;
  cmsDesignation?: string | null;
  subType?: string | null;
  confidence?: number | string | null;
}

function coerceConfidence(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function sanitize(value: unknown, allowed?: string[]): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (allowed && !allowed.includes(trimmed)) return null;
  return trimmed;
}

export async function classifyOrgFacilityType(
  orgName: string,
  description?: string | null,
  vertical?: string | null,           // e.g. "healthcare", "general_business", "industrial_services"
  subVertical?: string | null,        // e.g. "water_treatment", "ems"
  log?: ClassifyFacilityLog,
): Promise<FacilityClassification> {
  const trimmedName = orgName?.trim();
  if (!trimmedName) return EMPTY_RESULT;

  let ai: ReturnType<typeof getAiClient>;
  try {
    ai = getAiClient("grok");
  } catch (initErr) {
    log?.error({ err: initErr }, "[facilityTypeClassifier] Grok init failed");
    return EMPTY_RESULT;
  }

  const isHealthcare = !vertical || vertical === "healthcare";

  const naicsRef = getNaicsReference(vertical, subVertical);

  const systemPrompt = isHealthcare
    ? `You are a healthcare facility classification specialist.
Given an organization's name (and optional description), assign:
  - facilityType: one of ${FACILITY_TYPES.join(", ")}
  - naicsCode: pick the best 6-digit NAICS code from the reference list
  - cmsDesignation: one of ${CMS_DESIGNATIONS.join(", ")} (use NOT_APPLICABLE if non-clinical)
  - subType: short free-text descriptor (e.g. "Level II Trauma Center", "Cardiology", "Pediatric Oncology") or null
  - confidence: decimal 0.00–1.00 reflecting how certain you are

Rules:
  - Output JSON only — no markdown, no prose.
  - Use OTHER / NOT_APPLICABLE when uncertain rather than guessing.
  - confidence < 0.50 means low-confidence; that's fine — be honest.

NAICS reference (code  title):
${naicsRef}

JSON schema:
{
  "facilityType": "string",
  "naicsCode": "string",
  "cmsDesignation": "string",
  "subType": "string | null",
  "confidence": 0.0
}`
    : `You are an expert industrial and commercial facility classifier specializing in water treatment, process chemistry, environmental services, and industrial optimization services.

Given the organization name, any available description/notes, vertical="${vertical}", subVertical="${subVertical || 'water_treatment'}", classify it appropriately.

Focus on industries like: Manufacturing, Power Generation, Data Centers, Food & Beverage, Agriculture, Pharmaceuticals, Heavy Industry, etc.

Return only valid JSON with these fields:
{
  "facilityType": "e.g. MANUFACTURING_PLANT, DATA_CENTER, POWER_GENERATION_FACILITY, WASTEWATER_TREATMENT_PLANT, COOLING_TOWER_OPERATION, BREWERY, etc.",
  "naicsCode": "best 6-digit NAICS code",
  "cmsDesignation": "NOT_APPLICABLE",
  "subType": "short descriptive type (e.g. 'Cooling Tower System', 'High Purity Water System', 'Boiler Water Treatment')",
  "confidence": 0.0 to 1.0
}

Use terminology relevant to industrial water treatment, process equipment, remote monitoring, and optimization. Never use healthcare, hospital, or medical terminology.

NAICS reference (code  title):
${naicsRef}
`;

  const userPrompt = description?.trim()
    ? `Organization name: ${trimmedName}\nDescription: ${description.trim()}`
    : `Organization name: ${trimmedName}`;

  const startMs = Date.now();
  try {
    const completion = await ai.client.chat.completions.create({
      model: GROK_DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
    });

    if (log) {
      logTokenUsage(log, ai.provider, GROK_DEFAULT_MODEL, completion.usage, Date.now() - startMs);
    }

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return EMPTY_RESULT;

    const parsed = JSON.parse(raw) as GrokResponseShape;

    return {
      facilityType: sanitize(parsed.facilityType, FACILITY_TYPES) ?? "OTHER",
      naicsCode: sanitize(parsed.naicsCode),
      cmsDesignation: sanitize(parsed.cmsDesignation, CMS_DESIGNATIONS),
      subType: sanitize(parsed.subType),
      confidence: coerceConfidence(parsed.confidence),
    };
  } catch (err) {
    log?.error({ err, orgName: trimmedName }, "[facilityTypeClassifier] Grok call failed");
    return EMPTY_RESULT;
  }
}

/**
 * Convenience helper for fire-and-forget classification after an org is saved.
 * Looks up the org, classifies, and PATCHes the new fields.
 */
export async function classifyAndPersistFacilityType(
  orgId: string,
  orgName: string,
  description: string | null | undefined,
  patchFn: (orgId: string, patch: Partial<FacilityClassification>) => Promise<void>,
  log?: ClassifyFacilityLog,
): Promise<void> {
  const result = await classifyOrgFacilityType(orgName, description ?? null, log);
  // Only patch if we actually got something — avoid wiping existing values.
  if (!result.facilityType && !result.naicsCode && !result.cmsDesignation) return;
  await patchFn(orgId, result);
}

/**
 * Bulk classifier — sends a batch of orgs in a single Grok call.
 * Used by the bulk-import /analyze step so reps can see facilityType in the
 * review table without firing N separate Grok requests.
 *
 * Returns an array the same length as the input, in the same order.
 * If Grok fails or returns malformed JSON, the result for that slot is the
 * EMPTY_RESULT shape (all nulls) — the caller can ignore or retry per row.
 */
export async function classifyOrgFacilityTypesBulk(
  orgs: { name: string; description?: string | null; vertical?: string | null; subVertical?: string | null }[],
  log?: ClassifyFacilityLog,
): Promise<FacilityClassification[]> {
  if (orgs.length === 0) return [];

  let ai: ReturnType<typeof getAiClient>;
  try {
    ai = getAiClient("grok");
  } catch (initErr) {
    log?.error({ err: initErr }, "[facilityTypeClassifier] Grok init failed (bulk)");
    return orgs.map(() => ({ ...EMPTY_RESULT }));
  }

  // Process in chunks to keep individual prompts under the token ceiling.
  const CHUNK_SIZE = 25;
  const results: FacilityClassification[] = [];

  for (let i = 0; i < orgs.length; i += CHUNK_SIZE) {
    const chunk = orgs.slice(i, i + CHUNK_SIZE);

    const systemPrompt = `You are a healthcare facility classification specialist.
For each organization in the input array, assign:
  - facilityType: one of ${FACILITY_TYPES.join(", ")}
  - naicsCode: pick the best 6-digit NAICS code from the reference list
  - cmsDesignation: one of ${CMS_DESIGNATIONS.join(", ")} (use NOT_APPLICABLE if non-clinical)
  - subType: short free-text descriptor (e.g. "Level II Trauma Center") or null
  - confidence: decimal 0.00–1.00

Rules:
  - Return ONLY a JSON object of the form {"results":[...]}, no markdown.
  - The results array MUST have exactly ${chunk.length} entries in the same order as input.
  - Use OTHER / NOT_APPLICABLE when uncertain.

NAICS reference (code  title):
${NAICS_REFERENCE}`;

    const userPrompt = `Classify these ${chunk.length} organizations:\n${JSON.stringify(
      chunk.map((o) => ({ name: o.name, description: o.description ?? null })),
      null,
      2,
    )}`;

    const startMs = Date.now();
    let parsedResults: GrokResponseShape[] = [];

    try {
      const completion = await ai.client.chat.completions.create({
        model: GROK_DEFAULT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      });

      if (log) {
        logTokenUsage(log, ai.provider, GROK_DEFAULT_MODEL, completion.usage, Date.now() - startMs);
      }

      const raw = completion.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw) as { results?: GrokResponseShape[] };
        if (Array.isArray(parsed.results)) {
          parsedResults = parsed.results;
        }
      }
    } catch (err) {
      log?.error({ err, chunkSize: chunk.length, chunkIndex: i }, "[facilityTypeClassifier] bulk Grok call failed");
    }

    for (let j = 0; j < chunk.length; j++) {
      const r = parsedResults[j];
      if (!r) {
        results.push({ ...EMPTY_RESULT });
        continue;
      }
      results.push({
        facilityType: sanitize(r.facilityType, isHealthcare ? FACILITY_TYPES : undefined) ?? "OTHER",
        naicsCode: sanitize(r.naicsCode),
        cmsDesignation: sanitize(r.cmsDesignation, CMS_DESIGNATIONS),
        subType: sanitize(r.subType),
        confidence: coerceConfidence(r.confidence),
      });
    }
  }

  return results;
}

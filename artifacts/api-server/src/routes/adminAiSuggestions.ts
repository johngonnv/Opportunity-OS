import { Router } from "express";
import { db } from "@workspace/db";
import {
  masterOrgAiSuggestionsTable,
  masterOrganizationsTable,
  masterOrgHealthcareOverlayTable,
  masterOrgGovconOverlayTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getAiClient, logTokenUsage } from "../lib/aiProvider";
import { normalizeOrgName } from "../lib/orgNameNormalization";

const router = Router();

// ─── Normalization Safety Net ─────────────────────────────────────────────────
// Maps common Grok variations to exact DB enum / schema values.
// Runs after every AI response as a final backstop regardless of provider.

function normalizeFieldValue(field: string, raw: string): string {
  const v = raw.trim();
  const u = v.toUpperCase().replace(/[-\s]+/g, "_");

  switch (field) {
    case "industry": {
      const map: Record<string, string> = {
        HEALTHCARE: "HEALTHCARE", HEALTH_CARE: "HEALTHCARE", HEALTH: "HEALTHCARE",
        MEDICAL: "HEALTHCARE", HOSPITAL: "HEALTHCARE",
        GOVCON: "GOVCON", GOVERNMENT_CONTRACTING: "GOVCON", GOV_CON: "GOVCON",
        GOVERNMENT: "GOVCON", DEFENSE: "GOVCON",
        GENERAL_BUSINESS: "GENERAL_BUSINESS", GENERAL: "GENERAL_BUSINESS",
        BUSINESS: "GENERAL_BUSINESS", OTHER: "GENERAL_BUSINESS",
      };
      return map[u] ?? v;
    }
    case "accountStructureType": {
      const map: Record<string, string> = {
        ENTERPRISE: "ENTERPRISE", HEALTH_SYSTEM: "ENTERPRISE", SYSTEM: "ENTERPRISE",
        NETWORK: "ENTERPRISE", INTEGRATED_DELIVERY_NETWORK: "ENTERPRISE",
        REGIONAL: "REGIONAL", REGIONAL_OFFICE: "REGIONAL",
        FACILITY: "FACILITY", SINGLE_FACILITY: "FACILITY", HOSPITAL: "FACILITY",
        MEDICAL_CENTER: "FACILITY", CLINIC: "FACILITY",
        SUB_FACILITY: "SUB_FACILITY", SUBFACILITY: "SUB_FACILITY",
        DEPARTMENT: "SUB_FACILITY", UNIT: "SUB_FACILITY",
        GENERAL_ORG: "GENERAL_ORG", STANDALONE: "GENERAL_ORG",
        INDEPENDENT: "GENERAL_ORG", ORGANIZATION: "GENERAL_ORG", OTHER: "GENERAL_ORG",
      };
      return map[u] ?? v;
    }
    case "healthcare.facilityType": {
      const map: Record<string, string> = {
        HOSPITAL: "HOSPITAL", ACUTE_CARE_HOSPITAL: "HOSPITAL", ACUTE_CARE: "HOSPITAL",
        MEDICAL_CENTER: "HOSPITAL", GENERAL_HOSPITAL: "HOSPITAL",
        AMBULATORY_SURGERY_CENTER: "AMBULATORY_SURGERY_CENTER", ASC: "AMBULATORY_SURGERY_CENTER",
        SKILLED_NURSING_FACILITY: "SKILLED_NURSING_FACILITY", SNF: "SKILLED_NURSING_FACILITY",
        HOME_HEALTH: "HOME_HEALTH", HOME_HEALTH_AGENCY: "HOME_HEALTH",
        HOSPICE: "HOSPICE", HOSPICE_CARE: "HOSPICE",
        BEHAVIORAL_HEALTH: "BEHAVIORAL_HEALTH", PSYCHIATRIC: "BEHAVIORAL_HEALTH",
        MENTAL_HEALTH: "BEHAVIORAL_HEALTH", BEHAVIORAL: "BEHAVIORAL_HEALTH",
        PHYSICIAN_GROUP: "PHYSICIAN_GROUP", MEDICAL_GROUP: "PHYSICIAN_GROUP",
        PHYSICIAN_PRACTICE: "PHYSICIAN_GROUP",
        HEALTH_SYSTEM: "HEALTH_SYSTEM", INTEGRATED_HEALTH_SYSTEM: "HEALTH_SYSTEM",
        IMAGING_CENTER: "IMAGING_CENTER", RADIOLOGY: "IMAGING_CENTER",
        URGENT_CARE: "URGENT_CARE", URGENT_CARE_CENTER: "URGENT_CARE",
        FQHC: "FQHC", FEDERALLY_QUALIFIED_HEALTH_CENTER: "FQHC",
        CRITICAL_ACCESS_HOSPITAL: "CRITICAL_ACCESS_HOSPITAL", CAH: "CRITICAL_ACCESS_HOSPITAL",
      };
      return map[u] ?? v;
    }
    case "healthcare.traumaLevel": {
      const map: Record<string, string> = {
        LEVEL_I: "LEVEL_I", LEVEL_1: "LEVEL_I", I: "LEVEL_I", "1": "LEVEL_I",
        LEVEL_II: "LEVEL_II", LEVEL_2: "LEVEL_II", II: "LEVEL_II", "2": "LEVEL_II",
        LEVEL_III: "LEVEL_III", LEVEL_3: "LEVEL_III", III: "LEVEL_III", "3": "LEVEL_III",
        LEVEL_IV: "LEVEL_IV", LEVEL_4: "LEVEL_IV", IV: "LEVEL_IV", "4": "LEVEL_IV",
        NONE: "NONE", NOT_APPLICABLE: "NONE", N_A: "NONE",
      };
      return map[u] ?? v;
    }
    case "healthcare.systemType": {
      const map: Record<string, string> = {
        ACADEMIC_MEDICAL_CENTER: "ACADEMIC_MEDICAL_CENTER", AMC: "ACADEMIC_MEDICAL_CENTER",
        TEACHING_HOSPITAL: "ACADEMIC_MEDICAL_CENTER", UNIVERSITY_HOSPITAL: "ACADEMIC_MEDICAL_CENTER",
        COMMUNITY_HOSPITAL: "COMMUNITY_HOSPITAL", COMMUNITY: "COMMUNITY_HOSPITAL",
        INTEGRATED_DELIVERY_NETWORK: "INTEGRATED_DELIVERY_NETWORK", IDN: "INTEGRATED_DELIVERY_NETWORK",
        HEALTH_SYSTEM: "INTEGRATED_DELIVERY_NETWORK",
        INDEPENDENT: "INDEPENDENT", STANDALONE: "INDEPENDENT",
        SAFETY_NET: "SAFETY_NET", SAFETY_NET_HOSPITAL: "SAFETY_NET",
        VA_DOD: "VA_DOD", VA: "VA_DOD", DOD: "VA_DOD",
        VETERANS_AFFAIRS: "VA_DOD", MILITARY: "VA_DOD",
      };
      return map[u] ?? v;
    }
    case "healthcare.ownershipModel": {
      const map: Record<string, string> = {
        FOR_PROFIT: "FOR_PROFIT", FORPROFIT: "FOR_PROFIT", FOR_PROFIT_CORPORATION: "FOR_PROFIT",
        NON_PROFIT: "NON_PROFIT", NONPROFIT: "NON_PROFIT", NOT_FOR_PROFIT: "NON_PROFIT",
        NONFORPROFIT: "NON_PROFIT",
        GOVERNMENT: "GOVERNMENT", GOV: "GOVERNMENT", PUBLIC: "GOVERNMENT",
        GOVERNMENT_OWNED: "GOVERNMENT",
        RELIGIOUS: "RELIGIOUS", FAITH_BASED: "RELIGIOUS", FAITH: "RELIGIOUS",
        CHURCH: "RELIGIOUS", CATHOLIC: "RELIGIOUS",
        COOPERATIVE: "COOPERATIVE", CO_OP: "COOPERATIVE", COOP: "COOPERATIVE",
      };
      return map[u] ?? v;
    }
    case "healthcare.careSetting": {
      const map: Record<string, string> = {
        INPATIENT: "INPATIENT", IN_PATIENT: "INPATIENT",
        OUTPATIENT: "OUTPATIENT", OUT_PATIENT: "OUTPATIENT", AMBULATORY: "OUTPATIENT",
        BOTH: "BOTH", INPATIENT_AND_OUTPATIENT: "BOTH", MIXED: "BOTH",
        POST_ACUTE: "POST_ACUTE", POST_ACUTE_CARE: "POST_ACUTE",
        COMMUNITY: "COMMUNITY", COMMUNITY_BASED: "COMMUNITY",
      };
      return map[u] ?? v;
    }
    case "govcon.primeOrSub": {
      const map: Record<string, string> = {
        PRIME: "PRIME", PRIME_CONTRACTOR: "PRIME", PRIMARY: "PRIME",
        SUB: "SUB", SUBCONTRACTOR: "SUB", SUB_CONTRACTOR: "SUB",
        BOTH: "BOTH", PRIME_AND_SUB: "BOTH",
      };
      return map[u] ?? v;
    }
    case "isStandalone": {
      const lower = v.toLowerCase();
      if (lower === "true" || lower === "yes" || lower === "1") return "true";
      if (lower === "false" || lower === "no" || lower === "0") return "false";
      return v;
    }
    case "confidenceScore": {
      const num = parseFloat(v);
      if (isNaN(num)) return v;
      const clamped = Math.min(1, Math.max(0, num));
      return clamped.toFixed(2);
    }
    default:
      return v;
  }
}

// ─── GET /admin/ai-suggestions ───────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { orgId, status = "PENDING" } = req.query as Record<string, string>;

    const rows = await db.execute<{
      id: string;
      master_organization_id: string;
      canonical_name: string;
      field: string;
      current_value: string | null;
      suggested_value: string;
      rationale: string | null;
      status: string;
      reviewed_at: string | null;
      created_at: string;
    }>(sql`
      SELECT
        s.id,
        s.master_organization_id,
        mo.canonical_name,
        s.field,
        s.current_value,
        s.suggested_value,
        s.rationale,
        s.status,
        s.reviewed_at,
        s.created_at
      FROM master_org_ai_suggestions s
      JOIN master_organizations mo ON mo.id = s.master_organization_id
      WHERE
        ${orgId ? sql`s.master_organization_id = ${orgId} AND` : sql``}
        ${status && status !== "ALL" ? sql`s.status = ${status}::master_org_ai_suggestion_status` : sql`TRUE`}
      ORDER BY s.created_at DESC
      LIMIT 100
    `);

    const suggestions = rows.rows.map(r => ({
      id: r.id,
      masterOrganizationId: r.master_organization_id,
      canonicalName: r.canonical_name,
      field: r.field,
      currentValue: r.current_value,
      suggestedValue: r.suggested_value,
      rationale: r.rationale,
      status: r.status,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
    }));

    const pendingCount = await db.execute<{ count: string }>(sql`
      SELECT count(*) AS count FROM master_org_ai_suggestions WHERE status = 'PENDING'
    `);

    res.json({ suggestions, total: suggestions.length, pendingCount: parseInt(pendingCount.rows[0].count) });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-AI-SUGGESTIONS] list failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/ai-suggestions/:orgId/generate ──────────────────────────────
// Query params:
//   ?provider=grok   — use Grok (x.ai) for this request
//   ?provider=openai — use OpenAI (Replit proxy) for this request
//   (no param)       — uses AI_PROVIDER env var, defaults to 'openai'
//   ?complex=true    — escalate to the complex model (Grok: grok-4.20-reasoning)
router.post("/:orgId/generate", async (req, res) => {
  try {
    const { orgId } = req.params;
    const { provider: providerParam, complex } = req.query as Record<string, string>;

    const [org] = await db.select().from(masterOrganizationsTable).where(eq(masterOrganizationsTable.id, orgId));
    if (!org) return res.status(404).json({ error: "Master org not found" });

    const [hc] = await db.select().from(masterOrgHealthcareOverlayTable).where(eq(masterOrgHealthcareOverlayTable.masterOrganizationId, orgId));
    const [gc] = await db.select().from(masterOrgGovconOverlayTable).where(eq(masterOrgGovconOverlayTable.masterOrganizationId, orgId));

    // ── Auto-approve stale PENDING suggestions (suggestedValue already matches DB) ──
    const existingPending = await db.execute<{
      id: string; field: string; suggested_value: string;
    }>(sql`
      SELECT id, field, suggested_value
      FROM master_org_ai_suggestions
      WHERE master_organization_id = ${orgId} AND status = 'PENDING'
    `);
    for (const pending of existingPending.rows) {
      const currentVal = getCurrentFieldValue(
        pending.field,
        org as unknown as Record<string, unknown>,
        hc as unknown as Record<string, unknown> ?? null,
        gc as unknown as Record<string, unknown> ?? null,
      );
      if (currentVal !== null && currentVal === pending.suggested_value) {
        await db.execute(sql`
          UPDATE master_org_ai_suggestions
          SET status = 'APPROVED', reviewed_at = now(), updated_at = now()
          WHERE id = ${pending.id}
        `);
        req.log.info({ field: pending.field }, "[ADMIN-AI-SUGGESTIONS] stale PENDING auto-approved");
      }
    }

    // ── Count parent relationships (used to contextualise isStandalone check) ─
    const parentRelCount = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*) AS cnt FROM master_organization_relationships
      WHERE child_master_organization_id = ${orgId}
    `);
    const hasParents = parseInt(parentRelCount.rows[0]?.cnt ?? "0") > 0;

    // ── Collect missing core fields ─────────────────────────────────────────
    const missingCore: string[] = [];
    if (!org.websiteDomain) missingCore.push("websiteDomain");
    if (!org.industry) missingCore.push("industry");
    if (!org.accountStructureType) missingCore.push("accountStructureType");
    if (!org.subVertical) missingCore.push("subVertical");
    if (!org.city) missingCore.push("city");
    if (!org.state) missingCore.push("state");
    if (!org.country) missingCore.push("country");
    if (((org.aliases as string[]) ?? []).length === 0) missingCore.push("aliases");
    // Only suggest isStandalone when the org has no known parents and it isn't already marked standalone.
    // This avoids churning low-value "isStandalone=false" suggestions for orgs with established parents.
    if (!org.isStandalone && !hasParents) missingCore.push("isStandalone");
    if ((org.confidenceScore ?? 0) < 0.6) missingCore.push("confidenceScore");

    // ── Collect missing healthcare overlay fields ────────────────────────────
    const missingHealthcare: string[] = [];
    if (org.industry === "HEALTHCARE") {
      if (!hc?.facilityType) missingHealthcare.push("healthcare.facilityType");
      if (!hc?.licensedBeds) missingHealthcare.push("healthcare.licensedBeds");
      if (!hc?.traumaLevel) missingHealthcare.push("healthcare.traumaLevel");
      if (!hc?.systemType) missingHealthcare.push("healthcare.systemType");
      if (!hc?.ownershipModel) missingHealthcare.push("healthcare.ownershipModel");
      if (!hc?.careSetting) missingHealthcare.push("healthcare.careSetting");
    }

    // ── Collect missing govcon overlay fields ────────────────────────────────
    const missingGovcon: string[] = [];
    if (org.industry === "GOVCON") {
      if (!gc?.uei) missingGovcon.push("govcon.uei");
      if (!gc?.cageCode) missingGovcon.push("govcon.cageCode");
      if (((gc?.naicsCodes as string[]) ?? []).length === 0) missingGovcon.push("govcon.naicsCodes");
      if (!gc?.primeOrSub) missingGovcon.push("govcon.primeOrSub");
      if (((gc?.contractVehicles as string[]) ?? []).length === 0) missingGovcon.push("govcon.contractVehicles");
      if (!gc?.agencyAlignment) missingGovcon.push("govcon.agencyAlignment");
    }

    const allMissing = [...missingCore, ...missingHealthcare, ...missingGovcon];

    // Parent suggestion is needed when the org has no confirmed ultimate parent
    // and isn't already marked standalone.
    const needsParentSuggestion = !org.isStandalone;

    if (allMissing.length === 0 && !needsParentSuggestion) {
      return res.json({ message: "No missing fields require AI enrichment", suggestions: [], parentSuggestion: null });
    }

    // ── Build prompt ─────────────────────────────────────────────────────────
    const hcContext = org.industry === "HEALTHCARE" ? `
Healthcare Overlay (current):
- Facility Type: ${hc?.facilityType ?? "(missing)"}
- Licensed Beds: ${hc?.licensedBeds ?? "(missing)"}
- Trauma Level: ${hc?.traumaLevel ?? "(missing)"}
- System Type: ${hc?.systemType ?? "(missing)"}
- Ownership Model: ${hc?.ownershipModel ?? "(missing)"}
- Care Setting: ${hc?.careSetting ?? "(missing)"}

Healthcare field rules:
- facilityType: one of HOSPITAL, AMBULATORY_SURGERY_CENTER, SKILLED_NURSING_FACILITY, HOME_HEALTH, HOSPICE, BEHAVIORAL_HEALTH, PHYSICIAN_GROUP, HEALTH_SYSTEM, IMAGING_CENTER, URGENT_CARE, FQHC, CRITICAL_ACCESS_HOSPITAL
- licensedBeds: integer (number of beds; 0 for non-inpatient)
- traumaLevel: one of LEVEL_I, LEVEL_II, LEVEL_III, LEVEL_IV, NONE
- systemType: one of ACADEMIC_MEDICAL_CENTER, COMMUNITY_HOSPITAL, INTEGRATED_DELIVERY_NETWORK, INDEPENDENT, SAFETY_NET, VA_DOD
- ownershipModel: one of FOR_PROFIT, NON_PROFIT, GOVERNMENT, RELIGIOUS, COOPERATIVE
- careSetting: one of INPATIENT, OUTPATIENT, BOTH, POST_ACUTE, COMMUNITY` : "";

    const gcContext = org.industry === "GOVCON" ? `
GovCon Overlay (current):
- UEI: ${gc?.uei ?? "(missing)"}
- CAGE Code: ${gc?.cageCode ?? "(missing)"}
- NAICS Codes: ${((gc?.naicsCodes as string[]) ?? []).join(", ") || "(missing)"}
- Prime or Sub: ${gc?.primeOrSub ?? "(missing)"}
- Contract Vehicles: ${((gc?.contractVehicles as string[]) ?? []).join(", ") || "(missing)"}
- Agency Alignment: ${gc?.agencyAlignment ?? "(missing)"}

GovCon field rules:
- uei: 12-character SAM.gov Unique Entity ID (if publicly known; otherwise omit)
- cageCode: 5-character CAGE code (if publicly known; otherwise omit)
- naicsCodes: comma-separated NAICS codes (e.g. "541330,541519")
- primeOrSub: one of PRIME, SUB, BOTH
- contractVehicles: comma-separated contract vehicles (e.g. "GSA Schedule,CIO-SP3,SEWP V")
- agencyAlignment: primary agency focus (e.g. "DoD", "HHS", "VA", "DHS")` : "";

    const SYSTEM_PROMPT = `You are a precise master organization data intelligence assistant for a healthcare and GovCon CRM.

CRITICAL RULES — violating any of these will corrupt the database:
1. Return ONLY exact uppercase enum strings. Never use human-readable labels.
   - industry MUST be exactly one of: HEALTHCARE, GOVCON, GENERAL_BUSINESS
   - accountStructureType MUST be exactly one of: ENTERPRISE, REGIONAL, FACILITY, SUB_FACILITY, GENERAL_ORG
   - healthcare.facilityType MUST be exactly one of: HOSPITAL, AMBULATORY_SURGERY_CENTER, SKILLED_NURSING_FACILITY, HOME_HEALTH, HOSPICE, BEHAVIORAL_HEALTH, PHYSICIAN_GROUP, HEALTH_SYSTEM, IMAGING_CENTER, URGENT_CARE, FQHC, CRITICAL_ACCESS_HOSPITAL
   - healthcare.traumaLevel MUST be exactly one of: LEVEL_I, LEVEL_II, LEVEL_III, LEVEL_IV, NONE
   - healthcare.systemType MUST be exactly one of: ACADEMIC_MEDICAL_CENTER, COMMUNITY_HOSPITAL, INTEGRATED_DELIVERY_NETWORK, INDEPENDENT, SAFETY_NET, VA_DOD
   - healthcare.ownershipModel MUST be exactly one of: FOR_PROFIT, NON_PROFIT, GOVERNMENT, RELIGIOUS, COOPERATIVE
   - healthcare.careSetting MUST be exactly one of: INPATIENT, OUTPATIENT, BOTH, POST_ACUTE, COMMUNITY
   - govcon.primeOrSub MUST be exactly one of: PRIME, SUB, BOTH
2. city and state are SEPARATE fields. Never combine them. State must be a 2-letter US abbreviation (e.g. NV, CA, TX).
3. Only suggest fields you are confident about. Omit fields you cannot determine from the org name, domain, and context.
4. Never invent UEI or CAGE codes — only include if publicly known.
5. Your suggestions are stored as PENDING for human review — never write to any database.
6. isStandalone: suggest "true" if the organization is an independent entity with no known parent (e.g. a standalone private practice, independent clinic, or solo business). Suggest "false" if it is clearly part of a larger system. Only suggest if you are confident.
7. confidenceScore: suggest a decimal between 0.00 and 1.00 representing how confident you are in this record's identity given public information (0.60-0.95 range typical). Only suggest if you have meaningful public data about the org.
8. parentSuggestion — always return this object (never omit it):
   - suggestedParentName: the CANONICAL name of the immediate parent health system, company, or government entity. Return null if the org is independent/standalone, a county/government hospital with no corporate parent, or you are not confident.
   - suggestedUltimateParentName: the top-level enterprise (the root of the ownership chain). Often different from the immediate parent. Return null if the org is standalone or you are not confident.
   - parentConfidence: 0.0–1.0. Your confidence in the parent relationship (not the org identity).
   - reasoning: one concise sentence explaining the ownership chain.

PARENT SUGGESTION EXAMPLES:
• "Summerlin Hospital Medical Center" (summerlinhosp.com):
  suggestedParentName: "Valley Health System", suggestedUltimateParentName: "Universal Health Services", parentConfidence: 0.92
  reasoning: "Summerlin Hospital is owned by Valley Health System, which is a wholly-owned subsidiary of Universal Health Services (UHS), a publicly traded for-profit hospital company."

• "University Medical Center of Southern Nevada" (umcsn.com):
  suggestedParentName: null, suggestedUltimateParentName: null, parentConfidence: 0.0
  reasoning: "UMC of Southern Nevada is a public, county-owned hospital operated by Clark County — it has no corporate parent."

• "Johns Hopkins Hospital" (hopkinsmedicine.org):
  suggestedParentName: "Johns Hopkins Medicine", suggestedUltimateParentName: "Johns Hopkins University", parentConfidence: 0.95
  reasoning: "The hospital is a flagship facility of Johns Hopkins Medicine, itself an academic affiliate of Johns Hopkins University."

• "Leidos Holdings" (leidos.com):
  suggestedParentName: null, suggestedUltimateParentName: null, parentConfidence: 0.0
  reasoning: "Leidos is an independent, publicly traded defense and government IT company with no parent organization."

GovCon parent note: For government contractors, suggestedParentName should be the parent company (e.g. a prime that owns a sub-company), or null if independently traded.`;

    const fieldSection = allMissing.length > 0
      ? `Missing fields to fill: ${allMissing.join(", ")}`
      : "All data fields are already populated — skip the suggestions array (return empty array).";

    const prompt = `Analyze this master organization record and return both field suggestions and parent organization information.

${fieldSection}

Organization:
- Canonical Name: ${org.canonicalName}
- Normalized Name: ${org.normalizedName}
- Domain: ${org.websiteDomain ?? "(missing)"}
- Industry: ${org.industry ?? "(missing)"}
- Account Structure: ${org.accountStructureType ?? "(missing)"}
- Sub-Vertical: ${org.subVertical ?? "(missing)"}
- City: ${org.city ?? "(missing)"}
- State: ${org.state ?? "(missing)"}
- Country: ${org.country ?? "(missing)"}
- Aliases: ${((org.aliases as string[]) ?? []).join(", ") || "(none)"}
- Is Standalone: ${org.isStandalone}
${hcContext}${gcContext}

Return a JSON object with:
1. "suggestions" array — field suggestions for any missing fields listed above (empty array if none).
   Each item: {"field":"<exact field key>","suggestedValue":"<value>","rationale":"<one sentence>"}
2. "parentSuggestion" object — ALWAYS include this, even if all fields are filled.
   Use your knowledge of publicly available corporate/ownership information to identify the parent.
   {"suggestedParentName": string | null, "suggestedUltimateParentName": string | null, "parentConfidence": number, "reasoning": string}`;

    // ── Resolve AI provider ───────────────────────────────────────────────────
    let aiConfig;
    try {
      aiConfig = getAiClient(providerParam);
    } catch (configErr) {
      req.log.error({ err: configErr }, "[ADMIN-AI-SUGGESTIONS] AI provider config error");
      return res.status(503).json({ error: "AI provider not configured" });
    }
    const model = complex === "true" ? aiConfig.complexModel : aiConfig.defaultModel;

    const t0 = Date.now();
    let completion;
    try {
      completion = await aiConfig.client.chat.completions.create({
        model,
        max_tokens: 1500,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "org_suggestions",
            strict: true,
            schema: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string", description: "Exact field key from the missing fields list" },
                      suggestedValue: { type: "string", description: "Exact enum string or value — use only the allowed values listed in the system prompt" },
                      rationale: { type: "string", description: "One sentence explaining the basis for this suggestion" },
                    },
                    required: ["field", "suggestedValue", "rationale"],
                    additionalProperties: false,
                  },
                },
                parentSuggestion: {
                  type: "object",
                  description: "Parent organization suggestion — always present, fields null when org is standalone or parent is unknown",
                  properties: {
                    suggestedParentName: {
                      anyOf: [{ type: "string" }, { type: "null" }],
                      description: "Canonical name of the immediate parent org, or null if standalone/unknown",
                    },
                    suggestedUltimateParentName: {
                      anyOf: [{ type: "string" }, { type: "null" }],
                      description: "Canonical name of the top-level enterprise, or null if standalone/unknown",
                    },
                    parentConfidence: {
                      type: "number",
                      description: "Confidence in the parent relationship (0.0–1.0)",
                    },
                    reasoning: {
                      type: "string",
                      description: "One sentence explaining the ownership chain",
                    },
                  },
                  required: ["suggestedParentName", "suggestedUltimateParentName", "parentConfidence", "reasoning"],
                  additionalProperties: false,
                },
              },
              required: ["suggestions", "parentSuggestion"],
              additionalProperties: false,
            },
          },
        } as any,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      });
    } catch (aiErr: any) {
      const status = aiErr?.status ?? 500;
      if (status === 429) {
        req.log.warn({ provider: aiConfig.provider, model }, "[ADMIN-AI-SUGGESTIONS] rate limited");
        return res.status(429).json({ error: "AI provider rate limit exceeded — retry shortly" });
      }
      if (status === 401) {
        req.log.error({ provider: aiConfig.provider }, "[ADMIN-AI-SUGGESTIONS] auth error — check API key");
        return res.status(503).json({ error: "AI provider authentication failed" });
      }
      req.log.error({ err: aiErr, provider: aiConfig.provider, model }, "[ADMIN-AI-SUGGESTIONS] AI call failed");
      return res.status(500).json({ error: "AI call failed" });
    }

    logTokenUsage(req.log as any, aiConfig.provider, model, completion.usage, Date.now() - t0);

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: { field: string; suggestedValue: string; rationale: string }[] = [];
    let rawParentSuggestion: {
      suggestedParentName: string | null;
      suggestedUltimateParentName: string | null;
      parentConfidence: number;
      reasoning: string;
    } | null = null;

    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const value = JSON.parse(cleaned);
      parsed = Array.isArray(value) ? value : (value.suggestions ?? value.fields ?? []);
      rawParentSuggestion = value.parentSuggestion ?? null;
    } catch {
      req.log.warn({ raw }, "[ADMIN-AI-SUGGESTIONS] failed to parse AI response");
      return res.status(500).json({ error: "AI returned unparseable response" });
    }

    // ── Normalization safety net ────────────────────────────────────────────
    // Maps common Grok variations → exact DB enum values.
    // The prompt + JSON schema should handle this, but normalization is the
    // final backstop before anything is stored as PENDING.
    parsed = parsed.map(s => ({ ...s, suggestedValue: normalizeFieldValue(s.field, s.suggestedValue) }));

    // Remove suggestions with unrecognized field names (guard against hallucination)
    const KNOWN_FIELDS = new Set([
      "websiteDomain", "industry", "accountStructureType", "subVertical",
      "city", "state", "country", "aliases", "isStandalone", "confidenceScore",
      "healthcare.facilityType", "healthcare.licensedBeds", "healthcare.traumaLevel",
      "healthcare.systemType", "healthcare.ownershipModel", "healthcare.careSetting",
      "govcon.uei", "govcon.cageCode", "govcon.naicsCodes", "govcon.primeOrSub",
      "govcon.contractVehicles", "govcon.agencyAlignment",
    ]);
    parsed = parsed.filter(s => {
      if (!KNOWN_FIELDS.has(s.field)) {
        req.log.warn({ field: s.field }, "[ADMIN-AI-SUGGESTIONS] unknown field filtered out");
        return false;
      }
      return true;
    });

    // Delete stale PENDING suggestions for same fields.
    // Also clean up legacy 'location' if we're now generating city/state separately.
    const hasCityOrState = parsed.some(s => s.field === "city" || s.field === "state");
    if (hasCityOrState) {
      await db.execute(sql`
        DELETE FROM master_org_ai_suggestions
        WHERE master_organization_id = ${orgId}
        AND field = 'location'
        AND status = 'PENDING'
      `);
    }
    for (const s of parsed) {
      await db.execute(sql`
        DELETE FROM master_org_ai_suggestions
        WHERE master_organization_id = ${orgId}
        AND field = ${s.field}
        AND status = 'PENDING'
      `);
    }

    const inserted = [];
    for (const s of parsed) {
      if (!s.field || !s.suggestedValue) continue;
      const currentVal = getCurrentFieldValue(s.field, org, hc ?? null, gc ?? null);
      const [row] = await db.insert(masterOrgAiSuggestionsTable).values({
        masterOrganizationId: orgId,
        field: s.field,
        currentValue: currentVal,
        suggestedValue: s.suggestedValue,
        rationale: s.rationale ?? null,
        status: "PENDING",
      }).returning();
      inserted.push(row);
    }

    // ── Fuzzy-search master orgs for parent suggestion names (ephemeral) ─────
    let parentSuggestion: {
      suggestedParentName: string | null;
      suggestedUltimateParentName: string | null;
      parentConfidence: number;
      reasoning: string;
      parentMatches: MasterOrgCandidate[];
      ultimateParentMatches: MasterOrgCandidate[];
    } | null = null;

    if (rawParentSuggestion) {
      const [parentMatches, ultimateParentMatches] = await Promise.all([
        searchMasterOrgsByName(rawParentSuggestion.suggestedParentName ?? ""),
        searchMasterOrgsByName(rawParentSuggestion.suggestedUltimateParentName ?? ""),
      ]);
      parentSuggestion = {
        suggestedParentName: rawParentSuggestion.suggestedParentName,
        suggestedUltimateParentName: rawParentSuggestion.suggestedUltimateParentName,
        parentConfidence: rawParentSuggestion.parentConfidence,
        reasoning: rawParentSuggestion.reasoning,
        parentMatches,
        ultimateParentMatches,
      };
      req.log.info(
        {
          parentConfidence: parentSuggestion.parentConfidence,
          parentMatches: parentMatches.length,
          ultimateParentMatches: ultimateParentMatches.length,
        },
        "[ADMIN-AI-SUGGESTIONS] parent suggestion resolved",
      );
    }

    res.json({
      suggestions: inserted,
      total: inserted.length,
      provider: aiConfig.provider,
      model,
      parentSuggestion,
    });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-AI-SUGGESTIONS] generate failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/ai-suggestions/:id/approve ──────────────────────────────────
router.post("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;

    const [suggestion] = await db.select().from(masterOrgAiSuggestionsTable).where(eq(masterOrgAiSuggestionsTable.id, id));
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    if (suggestion.status !== "PENDING") return res.status(400).json({ error: "Suggestion is not pending" });

    const orgId = suggestion.masterOrganizationId;
    const field = suggestion.field;
    // Normalize at apply-time so old suggestions stored before the safety net
    // was added (e.g. "Healthcare" → "HEALTHCARE", "System" → "ENTERPRISE")
    // don't fail the DB enum constraint.
    const value = normalizeFieldValue(field, suggestion.suggestedValue);

    if (field.startsWith("healthcare.")) {
      await upsertHealthcareField(orgId, field.replace("healthcare.", ""), value);
    } else if (field.startsWith("govcon.")) {
      await upsertGovconField(orgId, field.replace("govcon.", ""), value);
    } else {
      const fieldUpdates = buildMasterOrgUpdate(field, value);
      if (Object.keys(fieldUpdates).length > 0) {
        await db.update(masterOrganizationsTable)
          .set({ ...fieldUpdates, updatedAt: new Date() })
          .where(eq(masterOrganizationsTable.id, orgId));
      }
    }

    const [updated] = await db.update(masterOrgAiSuggestionsTable)
      .set({ status: "APPROVED", reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(masterOrgAiSuggestionsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-AI-SUGGESTIONS] approve failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/ai-suggestions/:id/reject ───────────────────────────────────
router.post("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;

    const [updated] = await db.update(masterOrgAiSuggestionsTable)
      .set({ status: "REJECTED", reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(masterOrgAiSuggestionsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Suggestion not found" });

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-AI-SUGGESTIONS] reject failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function upsertHealthcareField(orgId: string, field: string, value: string) {
  const [existing] = await db.select({ id: masterOrgHealthcareOverlayTable.id })
    .from(masterOrgHealthcareOverlayTable)
    .where(eq(masterOrgHealthcareOverlayTable.masterOrganizationId, orgId));

  const fieldMap: Record<string, Partial<typeof masterOrgHealthcareOverlayTable.$inferInsert>> = {
    facilityType:   { facilityType: value },
    licensedBeds:   { licensedBeds: parseInt(value) || 0 },
    traumaLevel:    { traumaLevel: value },
    systemType:     { systemType: value },
    ownershipModel: { ownershipModel: value },
    careSetting:    { careSetting: value },
  };

  const update = fieldMap[field];
  if (!update) return;

  if (existing) {
    await db.update(masterOrgHealthcareOverlayTable)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(masterOrgHealthcareOverlayTable.masterOrganizationId, orgId));
  } else {
    await db.insert(masterOrgHealthcareOverlayTable).values({
      masterOrganizationId: orgId,
      ...update,
    });
  }
}

async function upsertGovconField(orgId: string, field: string, value: string) {
  const [existing] = await db.select({ id: masterOrgGovconOverlayTable.id })
    .from(masterOrgGovconOverlayTable)
    .where(eq(masterOrgGovconOverlayTable.masterOrganizationId, orgId));

  const toList = (v: string) => v.split(",").map((s: string) => s.trim()).filter(Boolean);

  const fieldMap: Record<string, Partial<typeof masterOrgGovconOverlayTable.$inferInsert>> = {
    uei:              { uei: value },
    cageCode:         { cageCode: value },
    naicsCodes:       { naicsCodes: toList(value) },
    primeOrSub:       { primeOrSub: value },
    contractVehicles: { contractVehicles: toList(value) },
    agencyAlignment:  { agencyAlignment: value },
  };

  const update = fieldMap[field];
  if (!update) return;

  if (existing) {
    await db.update(masterOrgGovconOverlayTable)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(masterOrgGovconOverlayTable.masterOrganizationId, orgId));
  } else {
    await db.insert(masterOrgGovconOverlayTable).values({
      masterOrganizationId: orgId,
      ...update,
    });
  }
}

function getCurrentFieldValue(
  field: string,
  org: Record<string, unknown>,
  hc: Record<string, unknown> | null,
  gc: Record<string, unknown> | null,
): string | null {
  if (field.startsWith("healthcare.")) {
    const f = field.replace("healthcare.", "");
    const val = hc?.[f];
    if (val === null || val === undefined) return null;
    if (Array.isArray(val)) return (val as string[]).join(", ");
    return String(val);
  }
  if (field.startsWith("govcon.")) {
    const f = field.replace("govcon.", "");
    const val = gc?.[f];
    if (val === null || val === undefined) return null;
    if (Array.isArray(val)) return (val as string[]).join(", ");
    return String(val);
  }
  const val = org[field];
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return (val as string[]).join(", ");
  return String(val);
}

function buildMasterOrgUpdate(field: string, value: string): Record<string, unknown> {
  const map: Record<string, string> = {
    websiteDomain: "websiteDomain",
    industry: "industry",
    accountStructureType: "accountStructureType",
    subVertical: "subVertical",
    city: "city",
    state: "state",
    country: "country",
  };
  if (field === "aliases") {
    return { aliases: value.split(",").map((s: string) => s.trim()).filter(Boolean) };
  }
  if (field === "isStandalone") {
    return { isStandalone: value === "true" };
  }
  if (field === "confidenceScore") {
    const num = parseFloat(value);
    return isNaN(num) ? {} : { confidenceScore: Math.min(1, Math.max(0, num)) };
  }
  if (field === "location") return {};
  if (map[field]) return { [map[field]]: value };
  return {};
}

// ─── Fuzzy Master Org Name Search ────────────────────────────────────────────
// Reuses the same logic as GET /admin/master-organizations/suggest-link.
export interface MasterOrgCandidate {
  id: string;
  canonicalName: string;
  websiteDomain: string | null;
  industry: string | null;
  accountStructureType: string | null;
  confidenceScore: number;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
}

async function searchMasterOrgsByName(name: string): Promise<MasterOrgCandidate[]> {
  if (!name || !name.trim()) return [];
  const normalized = normalizeOrgName(name);
  const candidates = await db.execute<{
    id: string;
    canonical_name: string;
    normalized_name: string;
    website_domain: string | null;
    industry: string | null;
    account_structure_type: string | null;
    confidence_score: number;
  }>(sql`
    SELECT id, canonical_name, normalized_name, website_domain, industry, account_structure_type, confidence_score
    FROM master_organizations
    WHERE normalized_name ILIKE ${`%${normalized}%`}
       OR canonical_name ILIKE ${`%${name}%`}
    ORDER BY
      CASE WHEN normalized_name = ${normalized} THEN 0
           WHEN normalized_name ILIKE ${`%${normalized}%`} THEN 1
           ELSE 2
      END,
      confidence_score DESC
    LIMIT 5
  `);
  return candidates.rows.map(c => {
    const score = c.normalized_name === normalized ? 0.95 : 0.75;
    return {
      id: c.id,
      canonicalName: c.canonical_name,
      websiteDomain: c.website_domain,
      industry: c.industry,
      accountStructureType: c.account_structure_type,
      confidenceScore: parseFloat(score.toFixed(2)),
      confidenceBand: (score >= 0.80 ? "HIGH" : score >= 0.50 ? "MEDIUM" : "LOW") as "HIGH" | "MEDIUM" | "LOW",
    };
  });
}

export default router;

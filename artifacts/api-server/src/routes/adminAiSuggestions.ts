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

const router = Router();

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

    // ── Collect missing core fields ─────────────────────────────────────────
    const missingCore: string[] = [];
    if (!org.websiteDomain) missingCore.push("websiteDomain");
    if (!org.industry) missingCore.push("industry");
    if (!org.accountStructureType) missingCore.push("accountStructureType");
    if (!org.subVertical) missingCore.push("subVertical");
    if (!org.city && !org.state) missingCore.push("location");
    if (((org.aliases as string[]) ?? []).length === 0) missingCore.push("aliases");

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

    if (allMissing.length === 0) {
      return res.json({ message: "No missing fields require AI enrichment", suggestions: [] });
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

    const prompt = `You are a master organization data enrichment assistant for a B2G/healthcare CRM intelligence platform.

Given the following master organization record, suggest values for the missing fields.
Return ONLY a JSON array. Each item must have:
- "field": exact field key from the missing fields list (use exactly as given, e.g. "healthcare.facilityType")
- "suggestedValue": the suggested value (always a string; for lists use comma-separated)
- "rationale": one sentence explaining the basis for this suggestion

Only suggest fields you have reasonable confidence in based on the org name and available context.
Skip fields where you have no basis for a suggestion.

Missing fields: ${allMissing.join(", ")}

Organization:
- Canonical Name: ${org.canonicalName}
- Normalized Name: ${org.normalizedName}
- Domain: ${org.websiteDomain ?? "(missing)"}
- Industry: ${org.industry ?? "(missing)"}
- Account Structure: ${org.accountStructureType ?? "(missing)"}
- Sub-Vertical: ${org.subVertical ?? "(missing)"}
- City: ${org.city ?? "(missing)"}
- State: ${org.state ?? "(missing)"}
- Aliases: ${((org.aliases as string[]) ?? []).join(", ") || "(none)"}
${hcContext}${gcContext}

Return a JSON object with a single key "suggestions" containing an array of field suggestions.
No markdown fences, no explanation outside the JSON.
Example: {"suggestions":[{"field":"healthcare.facilityType","suggestedValue":"HOSPITAL","rationale":"The name 'Valley Medical Center' indicates an acute care hospital."}]}`;

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
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a master organization data enrichment assistant for a B2G/healthcare CRM intelligence platform. Always respond with valid JSON only. Never write to any database — your role is to suggest values for human review.",
          },
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

    const raw = completion.choices[0]?.message?.content ?? "[]";

    // json_object mode wraps the array — unwrap if needed
    let parsed: { field: string; suggestedValue: string; rationale: string }[] = [];
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const value = JSON.parse(cleaned);
      parsed = Array.isArray(value) ? value : (value.suggestions ?? value.fields ?? Object.values(value)[0] ?? []);
    } catch {
      req.log.warn({ raw }, "[ADMIN-AI-SUGGESTIONS] failed to parse AI response");
      return res.status(500).json({ error: "AI returned unparseable response" });
    }

    // Delete stale PENDING suggestions for same fields
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

    res.json({
      suggestions: inserted,
      total: inserted.length,
      provider: aiConfig.provider,
      model,
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
    const value = suggestion.suggestedValue;

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
  };
  if (field === "aliases") {
    return { aliases: value.split(",").map((s: string) => s.trim()).filter(Boolean) };
  }
  if (field === "location") return {};
  if (map[field]) return { [map[field]]: value };
  return {};
}

export default router;

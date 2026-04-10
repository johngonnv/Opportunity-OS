import { z } from "zod";
import { db } from "@workspace/db";
import {
  verticalsTable,
  subVerticalsTable,
  serviceLinesTable,
  addOnTypesTable,
  pipelineViewTemplatesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const GROK_MODEL = "x-ai/grok-3";

export interface GrokRawResponse {
  vertical?: string;
  subVertical?: string;
  clientType?: string;
  serviceLines?: Array<{ key: string; label?: string }>;
  pipelineTemplates?: Array<{ templateKey: string; reason?: string }>;
  contactRoles?: Array<{ key: string; label: string }>;
  suggestedTags?: Array<{ name: string; color?: string; category?: string }>;
  addOns?: Array<{ key: string; config?: Record<string, unknown> }>;
  dashboardSuggestions?: Array<{ key: string; label?: string }>;
  govconEnabled?: boolean;
  confidenceLevel?: number;
  warningFlags?: string[];
  rawNotes?: string;
  revenueStreams?: string[];
  targetFacilities?: string[];
  buyerRoles?: string[];
  salesMotions?: string[];
  competitors?: string[];
  painPoints?: string[];
}

const grokRawSchema = z.object({
  vertical: z.string().optional(),
  subVertical: z.string().optional(),
  clientType: z.string().optional(),
  serviceLines: z.array(z.object({ key: z.string(), label: z.string().optional() })).optional(),
  pipelineTemplates: z.array(z.object({ templateKey: z.string(), reason: z.string().optional() })).optional(),
  contactRoles: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
  suggestedTags: z.array(z.object({ name: z.string(), color: z.string().optional(), category: z.string().optional() })).optional(),
  addOns: z.array(z.object({ key: z.string(), config: z.record(z.unknown()).optional() })).optional(),
  dashboardSuggestions: z.array(z.object({ key: z.string(), label: z.string().optional() })).optional(),
  govconEnabled: z.boolean().optional(),
  confidenceLevel: z.number().min(0).max(1).optional(),
  warningFlags: z.array(z.string()).optional(),
  rawNotes: z.string().optional(),
  revenueStreams: z.array(z.string()).optional(),
  targetFacilities: z.array(z.string()).optional(),
  buyerRoles: z.array(z.string()).optional(),
  salesMotions: z.array(z.string()).optional(),
  competitors: z.array(z.string()).optional(),
  painPoints: z.array(z.string()).optional(),
});

export interface MetaBlock {
  source: "grok" | "admin_override";
  confidence: number;
  resolvedFk: boolean;
  adminDecision: "approved" | "edited" | "rejected" | null;
}

export interface NormalizedRecommendation {
  vertical?: {
    id: string;
    key: string;
    label: string;
    _meta: MetaBlock;
  };
  subVertical?: {
    id: string;
    key: string;
    label: string;
    _meta: MetaBlock;
  };
  clientType?: {
    value: string;
    _meta: MetaBlock;
  };
  serviceLines: Array<{
    id?: string;
    key: string;
    label: string;
    _meta: MetaBlock;
  }>;
  pipelineTemplates: Array<{
    id?: string;
    key: string;
    name?: string;
    reason?: string;
    _meta: MetaBlock;
  }>;
  contactRoles: Array<{
    key: string;
    label: string;
    _meta: MetaBlock;
  }>;
  suggestedTags: Array<{
    name: string;
    color?: string;
    category?: string;
    _meta: MetaBlock;
  }>;
  addOns: Array<{
    id?: string;
    key: string;
    label?: string;
    config: Record<string, unknown>;
    _meta: MetaBlock;
  }>;
  dashboardSuggestions: Array<{
    key: string;
    label?: string;
    _meta: MetaBlock;
  }>;
  govconAddOn?: {
    enabled: boolean;
    addOnTypeId?: string;
    _meta: MetaBlock;
  };
  warningFlags: string[];
  rawNotes?: string;
  overallConfidence: number;
  unresolvedItems: Array<{ field: string; grokValue: string; reason: string }>;
  revenueStreams: string[];
  targetFacilities: string[];
  buyerRoles: string[];
  salesMotions: string[];
  competitors: string[];
  painPoints: string[];
}

function makeMeta(confidence: number, resolvedFk: boolean): MetaBlock {
  return { source: "grok", confidence, resolvedFk, adminDecision: null };
}

export async function normalizeGrokResponse(raw: unknown): Promise<NormalizedRecommendation> {
  const unresolved: Array<{ field: string; grokValue: string; reason: string }> = [];
  const validationResult = grokRawSchema.safeParse(raw);

  let grok: GrokRawResponse;
  if (validationResult.success) {
    grok = validationResult.data;
  } else {
    console.warn("[grokNormalizer] VALIDATION_REJECTED: Grok response failed strict schema validation", {
      issues: validationResult.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    // Field-level salvage: parse each top-level field independently so invalid
    // fields are dropped rather than causing the entire payload to collapse.
    const fieldSchemas: { [K in keyof GrokRawResponse]-?: z.ZodTypeAny } = {
      vertical:             z.string(),
      subVertical:          z.string(),
      clientType:           z.string(),
      serviceLines:         z.array(z.object({ key: z.string(), label: z.string().optional() })),
      pipelineTemplates:    z.array(z.object({ templateKey: z.string(), reason: z.string().optional() })),
      contactRoles:         z.array(z.object({ key: z.string(), label: z.string() })),
      suggestedTags:        z.array(z.object({ name: z.string(), color: z.string().optional(), category: z.string().optional() })),
      addOns:               z.array(z.object({ key: z.string(), config: z.record(z.unknown()).optional() })),
      dashboardSuggestions: z.array(z.object({ key: z.string(), label: z.string().optional() })),
      govconEnabled:        z.boolean(),
      confidenceLevel:      z.number().min(0).max(1),
      warningFlags:         z.array(z.string()),
      rawNotes:             z.string(),
      revenueStreams:       z.array(z.string()),
      targetFacilities:     z.array(z.string()),
      buyerRoles:           z.array(z.string()),
      salesMotions:         z.array(z.string()),
      competitors:          z.array(z.string()),
      painPoints:           z.array(z.string()),
    };
    const salvaged: GrokRawResponse = {};
    if (raw && typeof raw === "object") {
      const rawObj = raw as Record<string, unknown>;
      for (const [field, schema] of Object.entries(fieldSchemas)) {
        if (!(field in rawObj)) continue;
        const parsed = schema.safeParse(rawObj[field]);
        if (parsed.success) {
          (salvaged as Record<string, unknown>)[field] = parsed.data;
        } else {
          console.warn(`[grokNormalizer] FIELD_SALVAGE_REJECTED: field '${field}' discarded`, {
            value: rawObj[field],
            issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          });
        }
      }
    }
    grok = salvaged;
  }

  const overallConfidence = grok.confidenceLevel ?? 0.75;
  const result: NormalizedRecommendation = {
    serviceLines: [],
    pipelineTemplates: [],
    contactRoles: [],
    suggestedTags: [],
    addOns: [],
    dashboardSuggestions: [],
    warningFlags: grok.warningFlags ?? [],
    rawNotes: grok.rawNotes,
    overallConfidence,
    unresolvedItems: unresolved,
    revenueStreams: grok.revenueStreams ?? [],
    targetFacilities: grok.targetFacilities ?? [],
    buyerRoles: grok.buyerRoles ?? [],
    salesMotions: grok.salesMotions ?? [],
    competitors: grok.competitors ?? [],
    painPoints: grok.painPoints ?? [],
  };

  if (grok.vertical) {
    const match = await db.query.verticalsTable.findFirst({
      where: eq(verticalsTable.key, grok.vertical.toLowerCase().replace(/\s+/g, "_")),
    });
    if (match) {
      result.vertical = { id: match.id, key: match.key, label: match.label, _meta: makeMeta(overallConfidence, true) };
    } else {
      unresolved.push({ field: "vertical", grokValue: grok.vertical, reason: "No matching vertical key in configuration table" });
    }
  }

  if (grok.subVertical) {
    const match = await db.query.subVerticalsTable.findFirst({
      where: eq(subVerticalsTable.key, grok.subVertical.toLowerCase().replace(/\s+/g, "_")),
    });
    if (match) {
      result.subVertical = { id: match.id, key: match.key, label: match.label, _meta: makeMeta(overallConfidence, true) };
    } else {
      unresolved.push({ field: "subVertical", grokValue: grok.subVertical, reason: "No matching sub_vertical key in configuration table" });
    }
  }

  if (grok.clientType) {
    const VALID_CLIENT_TYPES = ["SINGLE_USER", "SMALL_TEAM", "ENTERPRISE"];
    const upper = grok.clientType.toUpperCase().replace(/\s+/g, "_");
    if (VALID_CLIENT_TYPES.includes(upper)) {
      result.clientType = { value: upper, _meta: makeMeta(overallConfidence, true) };
    } else {
      unresolved.push({ field: "clientType", grokValue: grok.clientType, reason: "Not a valid clientType value" });
    }
  }

  for (const sl of grok.serviceLines ?? []) {
    const match = await db.query.serviceLinesTable.findFirst({
      where: eq(serviceLinesTable.key, sl.key.toLowerCase()),
    });
    if (match) {
      result.serviceLines.push({ id: match.id, key: match.key, label: match.label, _meta: makeMeta(overallConfidence, true) });
    } else {
      result.serviceLines.push({ key: sl.key, label: sl.label ?? sl.key, _meta: makeMeta(overallConfidence * 0.5, false) });
      unresolved.push({ field: `serviceLines[${sl.key}]`, grokValue: sl.key, reason: "No matching service_line key" });
    }
  }

  for (const pt of grok.pipelineTemplates ?? []) {
    const match = await db.query.pipelineViewTemplatesTable.findFirst({
      where: eq(pipelineViewTemplatesTable.key, pt.templateKey),
    });
    if (match) {
      result.pipelineTemplates.push({ id: match.id, key: match.key, name: match.name, reason: pt.reason, _meta: makeMeta(overallConfidence, true) });
    } else {
      result.pipelineTemplates.push({ key: pt.templateKey, reason: pt.reason, _meta: makeMeta(overallConfidence * 0.4, false) });
      unresolved.push({ field: `pipelineTemplates[${pt.templateKey}]`, grokValue: pt.templateKey, reason: "No matching pipeline_view_templates key" });
    }
  }

  for (const cr of grok.contactRoles ?? []) {
    result.contactRoles.push({ key: cr.key, label: cr.label.trim(), _meta: makeMeta(overallConfidence, true) });
  }

  const ALLOWED_TAG_CATEGORIES = ["industry", "account_type", "stage", "priority", "source", "custom"];
  for (const tag of grok.suggestedTags ?? []) {
    const normalizedCategory = tag.category && ALLOWED_TAG_CATEGORIES.includes(tag.category) ? tag.category : "custom";
    result.suggestedTags.push({
      name: tag.name.trim().toLowerCase(),
      color: tag.color,
      category: normalizedCategory,
      _meta: makeMeta(overallConfidence, true),
    });
  }

  const govconAddOnType = await db.query.addOnTypesTable.findFirst({
    where: eq(addOnTypesTable.key, "govcon"),
  });

  for (const ao of grok.addOns ?? []) {
    const match = await db.query.addOnTypesTable.findFirst({
      where: eq(addOnTypesTable.key, ao.key.toLowerCase()),
    });
    if (match) {
      result.addOns.push({ id: match.id, key: match.key, label: match.label, config: ao.config ?? {}, _meta: makeMeta(overallConfidence, true) });
    } else {
      result.addOns.push({ key: ao.key, config: ao.config ?? {}, _meta: makeMeta(overallConfidence * 0.4, false) });
      unresolved.push({ field: `addOns[${ao.key}]`, grokValue: ao.key, reason: "No matching add_on_types key" });
    }
  }

  if (grok.govconEnabled === true && govconAddOnType) {
    const alreadyInAddOns = result.addOns.some((ao) => ao.key === "govcon");
    if (!alreadyInAddOns) {
      result.addOns.push({ id: govconAddOnType.id, key: "govcon", label: govconAddOnType.label, config: {}, _meta: makeMeta(overallConfidence, true) });
    }
    result.govconAddOn = { enabled: true, addOnTypeId: govconAddOnType.id, _meta: makeMeta(overallConfidence, true) };
  }

  const KNOWN_DASHBOARD_KEYS = ["pipeline_overview", "contact_activity", "org_health", "opportunity_forecast", "ems_transport_volume"];
  for (const ds of grok.dashboardSuggestions ?? []) {
    if (KNOWN_DASHBOARD_KEYS.includes(ds.key)) {
      result.dashboardSuggestions.push({ key: ds.key, label: ds.label, _meta: makeMeta(overallConfidence, true) });
    } else {
      unresolved.push({ field: `dashboardSuggestions[${ds.key}]`, grokValue: ds.key, reason: "Unknown dashboard key" });
    }
  }

  return result;
}

export async function callGrok(
  intakePayload: Record<string, unknown>
): Promise<{ raw: GrokRawResponse; modelVersion: string; confidence: number }> {
  const { openrouter } = await import("@workspace/integrations-openrouter-ai");

  const prompt = buildPrompt(intakePayload);

  const response = await openrouter.chat.completions.create({
    model: GROK_MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `You are an expert CRM workspace configurator for Opportunity OS. 
Given information about a new client, return a JSON configuration recommendation.
Your response must be valid JSON only — no markdown, no explanation, no code blocks.
Use the exact field names specified. All keys must be lowercase_snake_case.
Return only fields you are confident about. Omit fields you cannot determine.`,
      },
      { role: "user", content: prompt },
    ],
  });

  const rawText = response.choices[0]?.message?.content ?? "{}";
  let rawJson: unknown;
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    rawJson = match ? JSON.parse(match[0]) : {};
  } catch {
    rawJson = {};
  }

  const confidence = rawJson !== null && typeof rawJson === "object" && "confidenceLevel" in rawJson
    ? (rawJson as { confidenceLevel?: number }).confidenceLevel ?? 0.75
    : 0.75;

  return {
    raw: rawJson as GrokRawResponse,
    modelVersion: GROK_MODEL,
    confidence: typeof confidence === "number" ? confidence : 0.75,
  };
}

function buildPrompt(intake: Record<string, unknown>): string {
  return `New client intake for CRM workspace configuration.

Client Information:
- Company Name: ${intake.clientName ?? "Unknown"}
- Website: ${intake.website ?? "Not provided"}
- Industry Description: ${intake.industryDescription ?? "Not provided"}
- Products/Services Sold: ${intake.productsSold ?? "Not provided"}
- Who They Sell To: ${intake.customerType ?? "Not provided"}
- Sales Cycle Type: ${intake.salesCycleType ?? "Not provided"}
- Team Size: ${intake.teamSize ?? "Not provided"}
- Compliance Needs: ${intake.complianceNeeds ?? "None specified"}
- GovCon Involved: ${intake.govconInvolved ? "Yes" : "No"}
- Client Type: ${intake.clientType ?? "Not specified"}

Return a JSON object with these fields:
{
  "vertical": "key from: healthcare, govcon, general_business",
  "subVertical": "key from: ems, ambulatory_surgery, health_system (healthcare only)",
  "clientType": "SINGLE_USER | SMALL_TEAM | ENTERPRISE",
  "revenueStreams": ["Interfacility Transport", "Event Medical Staffing"],
  "serviceLines": [{"key": "bls|als|cct", "label": "..."}],
  "targetFacilities": ["Hospitals", "SNFs", "Rehab Centers"],
  "buyerRoles": ["Director of Case Management", "Discharge Planner"],
  "salesMotions": ["Cold Calling", "Facility Drop-ins", "Government Capture"],
  "pipelineTemplates": [{"templateKey": "ems_interfacility_transport_v1", "reason": "..."}],
  "competitors": ["AMR", "MedicWest"],
  "painPoints": ["Long ETA", "No availability"],
  "contactRoles": [{"key": "decision_maker", "label": "Medical Director"}, ...],
  "suggestedTags": [{"name": "tag-name", "color": "#hex", "category": "industry|account_type|stage|priority|source|custom"}],
  "addOns": [{"key": "govcon", "config": {"agencyAlignment": "...", "contractTypes": ["PRIME"]}}],
  "govconEnabled": false,
  "dashboardSuggestions": [{"key": "pipeline_overview", "label": "Pipeline Overview"}],
  "confidenceLevel": 0.85,
  "warningFlags": ["..."],
  "rawNotes": "..."
}`;
}

import { db } from "@workspace/db";
import {
  masterOrganizationsTable,
  masterOrganizationRelationshipsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { normalizeOrgName, normalizeDomain } from "./orgNameNormalization";
import { getAiClient, logTokenUsage } from "./aiProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MasterCandidate {
  masterOrgId: string;
  canonicalName: string;
  normalizedName: string;
  websiteDomain: string | null;
  aliases: string[];
  confidence: number;
  matchType: "exact" | "alias" | "fuzzy" | "domain";
  suggestedUltimateParentName: string | null;
}

export interface ExternalCandidate {
  name: string;
  websiteDomain: string | null;
  source: "google_places" | "domain_analysis";
  rawData: Record<string, unknown>;
}

export type ScanStepStatus = "MASTER_MATCHED" | "EXTERNAL_SEARCHED" | "LLM_REVIEWED" | "COMPLETED" | "FAILED";

export interface PipelineResult {
  scanStatus: ScanStepStatus;
  suggestedParentMasterOrganizationId: string | null;
  suggestedParentName: string | null;
  suggestedUltimateParentName: string | null;
  suggestedStructureType: string | null;
  confidenceScore: number | null;
  evidenceSummary: string | null;
  externalSourcePayload: Record<string, unknown> | null;
  llmReasoningSummary: string | null;
  errorMessage?: string;
}

export interface PipelineOptions {
  orgName: string;
  websiteDomain?: string | null;
  googlePlaceId?: string | null;
  onStatusUpdate?: (status: ScanStepStatus) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findUltimateParentName(masterOrgId: string, depth = 0): Promise<string | null> {
  if (depth > 10) return null;
  const rels = await db.select({
    parentId: masterOrganizationRelationshipsTable.parentMasterOrganizationId,
    parentName: masterOrganizationsTable.canonicalName,
  })
    .from(masterOrganizationRelationshipsTable)
    .innerJoin(
      masterOrganizationsTable,
      eq(masterOrganizationRelationshipsTable.parentMasterOrganizationId, masterOrganizationsTable.id),
    )
    .where(eq(masterOrganizationRelationshipsTable.childMasterOrganizationId, masterOrgId))
    .limit(1);

  if (rels.length === 0) return null;
  const parent = rels[0];
  const grandparent = await findUltimateParentName(parent.parentId, depth + 1);
  return grandparent ?? parent.parentName;
}

// ─── Step 1: Master DB Lookup ─────────────────────────────────────────────────

export async function lookupInMasterDB(
  orgName: string,
  websiteDomain?: string | null,
): Promise<MasterCandidate[]> {
  const candidates: MasterCandidate[] = [];
  const seen = new Set<string>();

  const normalized = normalizeOrgName(orgName);
  const domainNorm = websiteDomain ? normalizeDomain(websiteDomain) : null;

  // (a) Exact canonical name match — confidence 0.95 (+0.15 domain bonus → max 1.0)
  const exactRows = await db.select()
    .from(masterOrganizationsTable)
    .where(sql`lower(${masterOrganizationsTable.canonicalName}) = lower(${orgName})`)
    .limit(5);

  for (const row of exactRows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    let confidence = 0.95;
    if (domainNorm && row.websiteDomain === domainNorm) confidence = Math.min(1.0, confidence + 0.15);
    candidates.push({
      masterOrgId: row.id,
      canonicalName: row.canonicalName,
      normalizedName: row.normalizedName,
      websiteDomain: row.websiteDomain,
      aliases: (row.aliases as string[]) ?? [],
      confidence,
      matchType: "exact",
      suggestedUltimateParentName: null,
    });
  }

  // (b) Alias array match — confidence 0.85
  const aliasRows = await db.select()
    .from(masterOrganizationsTable)
    .where(sql`${masterOrganizationsTable.aliases} @> ${JSON.stringify([orgName])}::jsonb`)
    .limit(5);

  for (const row of aliasRows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    let confidence = 0.85;
    if (domainNorm && row.websiteDomain === domainNorm) confidence = Math.min(1.0, confidence + 0.15);
    candidates.push({
      masterOrgId: row.id,
      canonicalName: row.canonicalName,
      normalizedName: row.normalizedName,
      websiteDomain: row.websiteDomain,
      aliases: (row.aliases as string[]) ?? [],
      confidence,
      matchType: "alias",
      suggestedUltimateParentName: null,
    });
  }

  // (c) pg_trgm fuzzy match — similarity ≥ 0.80 → 0.75, domain bonus +0.15
  const fuzzyRows = await db.execute<{
    id: string;
    canonical_name: string;
    normalized_name: string;
    website_domain: string | null;
    aliases: unknown;
    similarity: string;
  }>(sql`
    SELECT id, canonical_name, normalized_name, website_domain, aliases,
           similarity(normalized_name, ${normalized}) AS similarity
    FROM master_organizations
    WHERE similarity(normalized_name, ${normalized}) > 0.35
    ORDER BY similarity(normalized_name, ${normalized}) DESC
    LIMIT 5
  `);

  for (const row of fuzzyRows.rows) {
    if (seen.has(row.id)) continue;
    const sim = Number(row.similarity);
    if (sim < 0.35) continue;
    seen.add(row.id);
    // name similarity ≥ 0.80 → base 0.75; below 0.80 → scale between 0.35 and 0.75
    const base = sim >= 0.80 ? 0.75 : 0.35 + ((sim - 0.35) / 0.45) * 0.40;
    const domainBonus = domainNorm && row.website_domain === domainNorm ? 0.15 : 0;
    const confidence = Math.min(1.0, base + domainBonus);
    candidates.push({
      masterOrgId: row.id,
      canonicalName: row.canonical_name,
      normalizedName: row.normalized_name,
      websiteDomain: row.website_domain,
      aliases: (row.aliases as string[]) ?? [],
      confidence,
      matchType: "fuzzy",
      suggestedUltimateParentName: null,
    });
  }

  // (d) Domain exact match — confidence 0.85 (same tier as alias)
  if (domainNorm) {
    const domainRows = await db.select()
      .from(masterOrganizationsTable)
      .where(eq(masterOrganizationsTable.websiteDomain, domainNorm))
      .limit(3);

    for (const row of domainRows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      candidates.push({
        masterOrgId: row.id,
        canonicalName: row.canonicalName,
        normalizedName: row.normalizedName,
        websiteDomain: row.websiteDomain,
        aliases: (row.aliases as string[]) ?? [],
        confidence: 0.85,
        matchType: "domain",
        suggestedUltimateParentName: null,
      });
    }
  }

  // Resolve ultimate parent names for all candidates
  for (const c of candidates) {
    c.suggestedUltimateParentName = await findUltimateParentName(c.masterOrgId);
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// ─── Step 2: External Validation Hook ────────────────────────────────────────

export async function runExternalValidation(
  orgName: string,
  websiteDomain?: string | null,
  googlePlaceId?: string | null,
): Promise<{ candidates: ExternalCandidate[]; payload: Record<string, unknown> }> {
  const results: ExternalCandidate[] = [];
  const payload: Record<string, unknown> = {};

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return { candidates: results, payload };
  }

  // If we have a known placeId, fetch place details directly for higher precision
  if (googlePlaceId) {
    try {
      const detailRes = await fetch(
        `https://places.googleapis.com/v1/places/${googlePlaceId}`,
        {
          headers: {
            "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": "id,displayName,formattedAddress,websiteUri,primaryType",
          },
        },
      );
      if (detailRes.ok) {
        const place = await detailRes.json() as {
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          websiteUri?: string;
          primaryType?: string;
        };
        payload.googlePlaceDetail = place;
        const name = place.displayName?.text ?? orgName;
        const website = place.websiteUri ?? null;
        const domain = website ? normalizeDomain(website) : null;
        results.push({
          name,
          websiteDomain: domain,
          source: "google_places",
          rawData: {
            placeId: place.id ?? googlePlaceId,
            name,
            formattedAddress: place.formattedAddress ?? null,
            website,
            primaryType: place.primaryType ?? null,
          },
        });
      }
    } catch (err) {
      payload.googlePlaceDetailError = String(err);
    }
  }

  // Text search for additional candidates (or as fallback if no placeId)
  try {
    const searchBody = {
      textQuery: orgName,
      maxResultCount: 3,
    };

    const placesRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.primaryType",
      },
      body: JSON.stringify(searchBody),
    });

    if (placesRes.ok) {
      const data = await placesRes.json() as {
        places?: Array<{
          id: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          websiteUri?: string;
          primaryType?: string;
        }>;
      };
      payload.googlePlaces = data;

      for (const place of (data.places ?? []).slice(0, 3)) {
        // Skip if we already have this placeId from the detail fetch
        if (googlePlaceId && place.id === googlePlaceId) continue;
        const name = place.displayName?.text ?? "";
        const website = place.websiteUri ?? null;
        const domain = website ? normalizeDomain(website) : null;
        results.push({
          name,
          websiteDomain: domain,
          source: "google_places",
          rawData: {
            placeId: place.id,
            name,
            formattedAddress: place.formattedAddress ?? null,
            website,
            primaryType: place.primaryType ?? null,
          },
        });
      }
    }
  } catch (err) {
    payload.googlePlacesError = String(err);
  }

  // Domain analysis: check if the org's domain matches a known master org
  if (websiteDomain) {
    const domain = normalizeDomain(websiteDomain);
    if (domain) {
      try {
        const parentRow = await db.select()
          .from(masterOrganizationsTable)
          .where(eq(masterOrganizationsTable.websiteDomain, domain))
          .limit(1);

        if (parentRow.length > 0) {
          payload.domainMatch = { masterOrgId: parentRow[0].id, canonicalName: parentRow[0].canonicalName };
          results.push({
            name: parentRow[0].canonicalName,
            websiteDomain: domain,
            source: "domain_analysis",
            rawData: { masterOrgId: parentRow[0].id },
          });
        }
      } catch {
        // domain analysis is best-effort
      }
    }
  }

  return { candidates: results, payload };
}

// ─── Step 3: LLM Reasoning (gated) ──────────────────────────────────────────

export async function runLlmReasoning(
  orgName: string,
  masterCandidates: MasterCandidate[],
  externalCandidates: ExternalCandidate[],
): Promise<{ reasoningSummary: string; adjustedConfidence: number | null }> {
  // Always use Grok for this flow (OpenAI has been removed)
  const ai = getAiClient("grok");
  const startTime = Date.now();

  const prompt = `You are an expert at corporate hierarchy analysis, especially in healthcare and complex organizations.

Your task: Analyze whether the organization below likely belongs to a larger parent or health system.

Organization being analyzed: "${orgName}"

Top Master Database candidates (already matched by name/domain):
${masterCandidates.slice(0, 5).map((c, i) =>
  `${i + 1}. ${c.canonicalName} (match type: ${c.matchType}, confidence: ${c.confidence.toFixed(2)})`
).join("\n") || "(none)"}

External search results (Google/domain analysis):
${externalCandidates.slice(0, 3).map((c, i) =>
  `${i + 1}. ${c.name} (source: ${c.source})`
).join("\n") || "(none)"}

Return a JSON object with exactly these fields:
{
  "suggestedParentName": "Most likely direct parent organization name, or null if it appears standalone",
  "suggestedUltimateParentName": "Ultimate parent / health system name if different from direct parent, or null",
  "confidence": 0.0 to 0.50,   // Your confidence this is a real parent relationship (LLM-only max is 0.50)
  "reasoning": "1-2 sentence explanation of your conclusion"
}

Rules:
- Be conservative. Only suggest a parent if there is reasonable supporting evidence.
- Prefer matches from the Master Database when they make sense.
- Return ONLY valid JSON. No markdown, no explanations outside the JSON.`;

  const ai = getAiClient("grok");
  const startTime = Date.now();

  try {
    const response = await ai.client.chat.completions.create({
      model: ai.complexModel,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { reasoningSummary: content.slice(0, 500), adjustedConfidence: null };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      suggestedParentName?: string;
      confidence?: number;
      reasoning?: string;
    };

    const adjustedConfidence = parsed.confidence != null ? Math.min(0.50, Number(parsed.confidence)) : null;
    const summary = parsed.reasoning ?? "LLM analysis completed";

    logTokenUsage(console, "grok", ai.complexModel, response.usage, Date.now() - startTime);

    return { reasoningSummary: summary, adjustedConfidence };
  } catch (err) {
    return { reasoningSummary: `LLM error: ${String(err)}`, adjustedConfidence: null };
  }
}

// ─── Full Pipeline ─────────────────────────────────────────────────────────────

export async function runStructureScanPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { orgName, websiteDomain, onStatusUpdate } = opts;

  const updateStatus = async (status: ScanStepStatus) => {
    if (onStatusUpdate) await onStatusUpdate(status).catch(() => {});
  };

  try {
    // Step 1: Master DB lookup
    const masterCandidates = await lookupInMasterDB(orgName, websiteDomain);
    const topMaster = masterCandidates[0] ?? null;

    await updateStatus("MASTER_MATCHED");

    let suggestedParentMasterOrganizationId: string | null = topMaster?.masterOrgId ?? null;
    let suggestedParentName: string | null = topMaster?.canonicalName ?? null;
    let suggestedUltimateParentName: string | null = topMaster?.suggestedUltimateParentName ?? null;
    let confidenceScore: number | null = topMaster?.confidence ?? null;
    let evidenceSummary: string | null = topMaster
      ? `Matched via ${topMaster.matchType} in master database with confidence ${topMaster.confidence.toFixed(2)}`
      : null;
    let externalSourcePayload: Record<string, unknown> | null = null;
    let llmReasoningSummary: string | null = null;

    // Step 2: External validation — only if no high-confidence master match
    if (!topMaster || topMaster.confidence < 0.80) {
      const external = await runExternalValidation(orgName, websiteDomain, opts.googlePlaceId);
      externalSourcePayload = external.payload;

      await updateStatus("EXTERNAL_SEARCHED");

      if (external.candidates.length > 0) {
        // External agreement bonus: +0.10 if external source agrees with master match
        const extAgreement = external.candidates.some((c) =>
          topMaster && (
            (c.websiteDomain && c.websiteDomain === topMaster.websiteDomain) ||
            c.name.toLowerCase().includes(topMaster.canonicalName.toLowerCase().slice(0, 8))
          )
        );
        if (extAgreement && confidenceScore != null) {
          confidenceScore = Math.min(1.0, confidenceScore + 0.10);
          evidenceSummary = evidenceSummary
            ? `${evidenceSummary}; external sources confirm this match (+0.10 confidence)`
            : "External sources confirm match";
        }
      }

      // Step 3: LLM reasoning — strictly gated
      // Only call when: confidence < 0.60 AND external candidates exist AND candidates are ambiguous
      const hasMultipleSimilarMaster =
        masterCandidates.length > 1 &&
        masterCandidates[1] !== undefined &&
        Math.abs((masterCandidates[0]?.confidence ?? 0) - masterCandidates[1].confidence) < 0.15;

      if (
        (confidenceScore == null || confidenceScore < 0.60) &&
        external.candidates.length > 0 &&
        hasMultipleSimilarMaster
      ) {
        const llm = await runLlmReasoning(orgName, masterCandidates, external.candidates);
        llmReasoningSummary = llm.reasoningSummary;

        await updateStatus("LLM_REVIEWED");

        // LLM can only raise confidence if it's better than current, and capped at 0.50
        if (llm.adjustedConfidence != null && (confidenceScore == null || llm.adjustedConfidence > confidenceScore)) {
          confidenceScore = llm.adjustedConfidence;
        }
      }
    }

    return {
      scanStatus: "COMPLETED",
      suggestedParentMasterOrganizationId,
      suggestedParentName,
      suggestedUltimateParentName,
      suggestedStructureType: suggestedParentMasterOrganizationId ? "SUBSIDIARY" : null,
      confidenceScore,
      evidenceSummary,
      externalSourcePayload,
      llmReasoningSummary,
    };
  } catch (err) {
    return {
      scanStatus: "FAILED",
      suggestedParentMasterOrganizationId: null,
      suggestedParentName: null,
      suggestedUltimateParentName: null,
      suggestedStructureType: null,
      confidenceScore: null,
      evidenceSummary: null,
      externalSourcePayload: null,
      llmReasoningSummary: null,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

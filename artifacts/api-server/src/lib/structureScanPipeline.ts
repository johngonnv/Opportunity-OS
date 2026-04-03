import { db } from "@workspace/db";
import {
  masterOrganizationsTable,
  masterOrganizationRelationshipsTable,
} from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import { normalizeOrgName, normalizeDomain } from "./orgNameNormalization";
import OpenAI from "openai";

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

export interface PipelineResult {
  scanStatus: "MASTER_MATCHED" | "EXTERNAL_SEARCHED" | "LLM_REVIEWED" | "COMPLETED" | "FAILED";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOpenAIClient(): OpenAI | null {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

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
  googlePlaceId?: string | null,
): Promise<MasterCandidate[]> {
  const candidates: MasterCandidate[] = [];
  const seen = new Set<string>();

  const normalized = normalizeOrgName(orgName);
  const domainNorm = websiteDomain ? normalizeDomain(websiteDomain) : null;

  // (a) Exact canonical name match
  const exactRows = await db.select()
    .from(masterOrganizationsTable)
    .where(sql`lower(${masterOrganizationsTable.canonicalName}) = lower(${orgName})`)
    .limit(5);

  for (const row of exactRows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    let confidence = 0.95;
    if (domainNorm && row.websiteDomain === domainNorm) confidence = Math.min(1.0, confidence + 0.05);
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

  // (b) Alias array match
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

  // (c) pg_trgm fuzzy match on normalized_name
  const fuzzyRows = await db.execute<{
    id: string;
    canonical_name: string;
    normalized_name: string;
    website_domain: string | null;
    aliases: string[];
    similarity: number;
  }>(sql`
    SELECT id, canonical_name, normalized_name, website_domain, aliases,
           similarity(normalized_name, ${normalized}) AS similarity
    FROM master_organizations
    WHERE similarity(normalized_name, ${normalized}) > 0.35
    ORDER BY similarity DESC
    LIMIT 5
  `);

  for (const row of fuzzyRows.rows) {
    if (seen.has(row.id)) continue;
    const sim = Number(row.similarity);
    if (sim < 0.35) continue;
    seen.add(row.id);
    let confidence = sim >= 0.80 ? 0.75 : 0.50 + (sim - 0.35) * 0.35;
    if (domainNorm && row.website_domain === domainNorm) confidence = Math.min(1.0, confidence + 0.15);
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

  // (d) Domain exact match
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

  // Resolve ultimate parent names
  for (const c of candidates) {
    c.suggestedUltimateParentName = await findUltimateParentName(c.masterOrgId);
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// ─── Step 2: External Validation Hook ────────────────────────────────────────

export async function runExternalValidation(
  orgName: string,
  websiteDomain?: string | null,
  placeId?: string | null,
): Promise<{ candidates: ExternalCandidate[]; payload: Record<string, unknown> }> {
  const results: ExternalCandidate[] = [];
  const payload: Record<string, unknown> = {};

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return { candidates: results, payload };
  }

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
      const data = await placesRes.json() as { places?: Array<{
        id: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        websiteUri?: string;
        primaryType?: string;
      }> };
      payload.googlePlaces = data;

      for (const place of (data.places ?? []).slice(0, 3)) {
        const name = place.displayName?.text ?? "";
        const website = place.websiteUri ?? null;
        const domain = website ? normalizeDomain(website) : null;
        results.push({
          name,
          websiteDomain: domain,
          source: "google_places",
          rawData: { placeId: place.id, name, formattedAddress: place.formattedAddress, website, primaryType: place.primaryType },
        });
      }
    }
  } catch (err) {
    payload.googlePlacesError = String(err);
  }

  // Domain analysis: check if the org's domain has any known parent clues
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
      }
    }
  }

  return { candidates: results, payload };
}

// ─── Step 3: LLM Reasoning ───────────────────────────────────────────────────

export async function runLlmReasoning(
  orgName: string,
  masterCandidates: MasterCandidate[],
  externalCandidates: ExternalCandidate[],
): Promise<{ reasoningSummary: string; adjustedConfidence: number | null }> {
  const openai = getOpenAIClient();
  if (!openai) {
    return { reasoningSummary: "LLM not configured", adjustedConfidence: null };
  }

  const prompt = `You are a healthcare industry expert helping determine corporate hierarchy relationships.

Organization being scanned: "${orgName}"

Master database candidates (our known health systems):
${masterCandidates.slice(0, 5).map((c, i) =>
  `${i + 1}. ${c.canonicalName} (confidence: ${c.confidence.toFixed(2)}, match: ${c.matchType})`
).join("\n") || "(none)"}

External search results:
${externalCandidates.slice(0, 3).map((c, i) =>
  `${i + 1}. ${c.name} (source: ${c.source})`
).join("\n") || "(none)"}

Based on your knowledge of US healthcare systems and the evidence above, determine:
1. Whether "${orgName}" likely belongs to a parent health system or hospital network
2. Which parent organization is most likely, if any
3. Your confidence level (0.0 to 0.50 — note the cap at 0.50 for LLM-only assessments)
4. A brief evidence summary (1-2 sentences)

Return a JSON object with exactly these fields:
{
  "suggestedParentName": "Name of likely parent organization, or null if standalone",
  "suggestedUltimateParentName": "Name of ultimate parent/health system, or null",
  "confidence": 0.45,
  "reasoning": "Brief explanation of why this organization belongs to this parent"
}

Return ONLY the JSON object. No markdown, no code fences.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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
      suggestedUltimateParentName?: string;
      confidence?: number;
      reasoning?: string;
    };

    const adjustedConfidence = parsed.confidence != null ? Math.min(0.50, Number(parsed.confidence)) : null;
    const summary = parsed.reasoning ?? "LLM analysis completed";

    return { reasoningSummary: summary, adjustedConfidence };
  } catch (err) {
    return { reasoningSummary: `LLM error: ${String(err)}`, adjustedConfidence: null };
  }
}

// ─── Full Pipeline ─────────────────────────────────────────────────────────────

export async function runStructureScanPipeline(opts: {
  orgName: string;
  websiteDomain?: string | null;
  googlePlaceId?: string | null;
}): Promise<PipelineResult> {
  const { orgName, websiteDomain, googlePlaceId } = opts;

  try {
    // Step 1: Master DB lookup
    const masterCandidates = await lookupInMasterDB(orgName, websiteDomain, googlePlaceId);
    const topMaster = masterCandidates[0] ?? null;

    let currentStatus: PipelineResult["scanStatus"] = "MASTER_MATCHED";
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
      const external = await runExternalValidation(orgName, websiteDomain, googlePlaceId);
      externalSourcePayload = external.payload;
      currentStatus = "EXTERNAL_SEARCHED";

      if (external.candidates.length > 0) {
        const extAgreement = external.candidates.some((c) =>
          topMaster && (
            c.websiteDomain === topMaster.websiteDomain ||
            c.name.toLowerCase().includes(topMaster.canonicalName.toLowerCase().slice(0, 8))
          )
        );
        if (extAgreement && confidenceScore != null) {
          confidenceScore = Math.min(1.0, confidenceScore + 0.10);
          evidenceSummary = `${evidenceSummary ?? ""}; External sources agree with master match`;
        }
      }

      // Step 3: LLM reasoning — only when truly ambiguous / low confidence
      const hasMultipleSimilarMaster = masterCandidates.length > 1 && 
        masterCandidates[1] && Math.abs((masterCandidates[0]?.confidence ?? 0) - masterCandidates[1].confidence) < 0.15;
      
      if ((confidenceScore == null || confidenceScore < 0.60) && external.candidates.length > 0 && hasMultipleSimilarMaster) {
        const llm = await runLlmReasoning(orgName, masterCandidates, external.candidates);
        llmReasoningSummary = llm.reasoningSummary;
        currentStatus = "LLM_REVIEWED";

        if (llm.adjustedConfidence != null && (confidenceScore == null || llm.adjustedConfidence > confidenceScore)) {
          confidenceScore = llm.adjustedConfidence;
        }

        if (!topMaster && llm.reasoningSummary && llm.adjustedConfidence && llm.adjustedConfidence > 0) {
          suggestedParentName = null;
          evidenceSummary = llm.reasoningSummary;
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

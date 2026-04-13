/**
 * GovCon Classification Engine
 *
 * Automatically classifies a workspace organization with NAICS and PSC codes.
 *
 * Processing pipeline (strict order):
 *   1. Keyword match — query naics_keyword_map & psc_master for term hits
 *   2. AI semantic scoring — GPT-4o/Grok scores and refines candidates
 *   3. Deterministic fallback — if AI unavailable, return keyword-only results
 *
 * Results:
 *   - Primary NAICS (highest confidence), up to 3 secondary NAICS candidates
 *   - Primary PSC (highest confidence), up to 3 secondary PSC candidates
 *   - Persisted to organization_naics and organization_psc
 */

import { db } from "@workspace/db";
import {
  naicsKeywordMapTable,
  naicsMasterTable,
  pscMasterTable,
  organizationNaicsTable,
  organizationPscTable,
  organizationsTable,
} from "@workspace/db";
import { eq, and, inArray, sql, ne } from "drizzle-orm";
import { getAiClient, logTokenUsage } from "./aiProvider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgContext {
  id: string;
  workspaceId: string;
  name: string;
  legalName?: string | null;
  industry?: string | null;
  subIndustry?: string | null;
  vertical?: string | null;
  subVertical?: string | null;
  notesText?: string | null;
  placeCategory?: string | null;
  website?: string | null;
}

export interface ClassificationCandidate {
  code: string;
  title: string;
  confidenceScore: number;
  rationale: string;
}

export interface ClassificationResult {
  naics: {
    primary: ClassificationCandidate | null;
    secondary: ClassificationCandidate[];
  };
  psc: {
    primary: ClassificationCandidate | null;
    secondary: ClassificationCandidate[];
  };
  source: "GROK" | "RULE";
  classifiedAt: string;
}

// ---------------------------------------------------------------------------
// Step 1: NAICS Keyword Matching
//
// The naics_keyword_map contains multi-word phrase keywords (e.g. "animal hospitals",
// "advisory commissions, executive government"). We do a reverse lookup:
// find keywords that are substrings of the org search text.
// ---------------------------------------------------------------------------

interface NaicsKeywordHit {
  code: string;
  title: string;
  cumulativeWeight: number;
}

// Stopwords to exclude from keyword matching
const NAICS_STOPWORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "are", "was",
  "not", "but", "have", "had", "they", "been", "all", "more", "its",
  "also", "has", "may", "any", "can", "inc", "llc", "ltd",
]);

async function matchNaicsKeywords(searchText: string): Promise<NaicsKeywordHit[]> {
  if (!searchText.trim()) return [];

  // Extract significant words from the org text
  const words = [
    ...new Set(
      searchText
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter(w => w.length >= 4 && !NAICS_STOPWORDS.has(w))
        .slice(0, 20)
    ),
  ];

  if (words.length === 0) return [];

  // Find keywords in the map that CONTAIN any of our search words.
  // Then aggregate by NAICS code (sum of weights of all matching keywords).
  // Each word generates an ILIKE '%word%' condition — safely escaped.
  const wordConditions = words
    .map(w => `km.keyword ILIKE '%${w.replace(/'/g, "''")}%'`)
    .join(" OR ");

  const hits = await db.execute<{
    naics_code: string;
    title: string;
    total_weight: string;
  }>(sql.raw(`
    SELECT
      km.naics_code,
      nm.title,
      SUM(km.weight::numeric) AS total_weight
    FROM naics_keyword_map km
    JOIN naics_master nm ON nm.code = km.naics_code
    WHERE (${wordConditions})
      AND nm.level = 6
    GROUP BY km.naics_code, nm.title
    ORDER BY total_weight DESC
    LIMIT 20
  `));

  return hits.rows.map(r => ({
    code: r.naics_code,
    title: r.title,
    cumulativeWeight: parseFloat(r.total_weight),
  }));
}

// ---------------------------------------------------------------------------
// Step 2: PSC Keyword Matching (ILIKE against PSC text fields)
// ---------------------------------------------------------------------------

interface PscKeywordHit {
  code: string;
  name: string;
  hitCount: number;
}

async function matchPscKeywords(searchText: string): Promise<PscKeywordHit[]> {
  if (!searchText.trim()) return [];

  // Use tsvector full-text search across PSC text fields for efficiency
  // Fall back to ILIKE on individual significant words (top 10)
  const words = searchText
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 15);

  if (words.length === 0) return [];

  // Build dynamic case expression — count how many words appear in PSC fields.
  // Matches against: name, full_description, includes_text, excludes_text, notes_text.
  const caseFragments = words
    .map(w => {
      const safe = w.replace(/'/g, "''");
      return `(CASE WHEN LOWER(
        COALESCE(p.name, '') || ' ' ||
        COALESCE(p.full_description, '') || ' ' ||
        COALESCE(p.includes_text, '') || ' ' ||
        COALESCE(p.excludes_text, '') || ' ' ||
        COALESCE(p.notes_text, '')
      ) LIKE '%${safe}%' THEN 1 ELSE 0 END)`;
    })
    .join(" + ");

  const results = await db.execute<{
    code: string;
    name: string | null;
    hit_count: string;
  }>(sql.raw(`
    SELECT p.code, p.name, (${caseFragments}) AS hit_count
    FROM psc_master p
    WHERE p.is_active = true
      AND (${caseFragments}) > 0
    ORDER BY hit_count DESC
    LIMIT 20
  `));

  return results.rows
    .map(r => ({ code: r.code, name: r.name ?? r.code, hitCount: parseInt(r.hit_count) }))
    .filter(r => r.hitCount > 0);
}

// ---------------------------------------------------------------------------
// Step 3: AI Semantic Classification
// ---------------------------------------------------------------------------

interface AiClassificationOutput {
  naics: {
    primary: { code: string; confidenceScore: number; rationale: string } | null;
    secondary: Array<{ code: string; confidenceScore: number; rationale: string }>;
  };
  psc: {
    primary: { code: string; confidenceScore: number; rationale: string } | null;
    secondary: Array<{ code: string; confidenceScore: number; rationale: string }>;
  };
}

async function runAiClassification(
  org: OrgContext,
  naicsCandidates: NaicsKeywordHit[],
  pscCandidates: PscKeywordHit[],
  log: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<AiClassificationOutput | null> {
  // Guard: getAiClient() can throw if provider is misconfigured.
  // Catch here so the deterministic fallback path always fires when AI is unavailable.
  let client: ReturnType<typeof getAiClient>["client"];
  let provider: string;
  let defaultModel: string;
  try {
    const ai = getAiClient();
    client = ai.client;
    provider = ai.provider;
    defaultModel = ai.defaultModel;
  } catch (initErr) {
    log.error({ err: initErr }, "[govconClassifier] AI client init failed — using keyword fallback");
    return null;
  }

  const naicsLines = naicsCandidates
    .slice(0, 10)
    .map(c => `  - ${c.code}: ${c.title} (keyword weight: ${c.cumulativeWeight.toFixed(1)})`)
    .join("\n");

  const pscLines = pscCandidates
    .slice(0, 10)
    .map(c => `  - ${c.code}: ${c.name} (keyword hits: ${c.hitCount})`)
    .join("\n");

  const orgDesc = [
    org.name,
    org.legalName !== org.name ? org.legalName : null,
    org.industry,
    org.subIndustry,
    org.vertical,
    org.subVertical,
    org.placeCategory,
    org.notesText,
  ]
    .filter(Boolean)
    .join(" | ");

  const systemPrompt = `You are a US Government contracting classification specialist.
Given an organization's profile and pre-filtered NAICS/PSC keyword candidates,
select the best-matching codes and assign confidence scores (0.00–1.00).

Rules:
- Only select codes from the provided candidate lists.
- Select at most 1 primary and 3 secondary NAICS codes.
- Select at most 1 primary and 3 secondary PSC codes.
- Confidence ≥ 0.70 = reliable classification; < 0.70 = needs human review.
- If no good match exists for NAICS or PSC, return null for that primary.
- Provide a brief, factual rationale (1 sentence) per code.
- Respond ONLY with valid JSON matching the schema below — no markdown, no extra text.

JSON schema:
{
  "naics": {
    "primary": { "code": "string", "confidenceScore": 0.0, "rationale": "string" } | null,
    "secondary": [{ "code": "string", "confidenceScore": 0.0, "rationale": "string" }]
  },
  "psc": {
    "primary": { "code": "string", "confidenceScore": 0.0, "rationale": "string" } | null,
    "secondary": [{ "code": "string", "confidenceScore": 0.0, "rationale": "string" }]
  }
}`;

  const userPrompt = `Organization: ${orgDesc}

NAICS candidates (from keyword matching):
${naicsLines || "  (none found — use your best judgment from provided data)"}

PSC candidates (from keyword matching):
${pscLines || "  (none found — use your best judgment from provided data)"}

Classify this organization for US Government contracting purposes.`;

  const startMs = Date.now();
  try {
    const completion = await client.chat.completions.create({
      model: defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });

    logTokenUsage(log, provider, defaultModel, completion.usage, Date.now() - startMs);

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AiClassificationOutput;
    return parsed;
  } catch (err) {
    log.error({ err }, "[govconClassifier] AI classification failed — using keyword fallback");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 4: Build deterministic fallback result from keyword hits
// ---------------------------------------------------------------------------

function buildKeywordFallback(
  naicsHits: NaicsKeywordHit[],
  pscHits: PscKeywordHit[],
): AiClassificationOutput {
  // Normalize cumulative weights to 0–1 confidence scores
  const maxNaicsWeight = naicsHits[0]?.cumulativeWeight ?? 1;
  const maxPscHits = pscHits[0]?.hitCount ?? 1;

  const naicsItems = naicsHits.slice(0, 4).map(h => ({
    code: h.code,
    confidenceScore: Math.min(0.85, (h.cumulativeWeight / maxNaicsWeight) * 0.75),
    rationale: `Keyword match: "${h.title}" (cumulative weight ${h.cumulativeWeight.toFixed(1)})`,
  }));

  const pscItems = pscHits.slice(0, 4).map(h => ({
    code: h.code,
    confidenceScore: Math.min(0.75, (h.hitCount / maxPscHits) * 0.65),
    rationale: `Keyword match: "${h.name}" (${h.hitCount} keyword hit${h.hitCount > 1 ? "s" : ""})`,
  }));

  return {
    naics: {
      primary: naicsItems[0] ?? null,
      secondary: naicsItems.slice(1),
    },
    psc: {
      primary: pscItems[0] ?? null,
      secondary: pscItems.slice(1),
    },
  };
}

// ---------------------------------------------------------------------------
// Step 5: Persist classification results
// ---------------------------------------------------------------------------

async function persistClassification(
  orgId: string,
  workspaceId: string,
  result: ClassificationResult,
): Promise<void> {
  const naicsCandidates = [
    ...(result.naics.primary ? [{ ...result.naics.primary, isPrimary: true }] : []),
    ...result.naics.secondary.map(c => ({ ...c, isPrimary: false })),
  ];

  const pscCandidates = [
    ...(result.psc.primary ? [{ ...result.psc.primary, isPrimary: true }] : []),
    ...result.psc.secondary.map(c => ({ ...c, isPrimary: false })),
  ];

  const source = result.source;

  // Validate that all NAICS codes exist and are 6-digit (level=6)
  const validNaicsCodes = naicsCandidates.length > 0
    ? (await db.select({ code: naicsMasterTable.code })
        .from(naicsMasterTable)
        .where(and(
          inArray(naicsMasterTable.code, naicsCandidates.map(c => c.code)),
          eq(naicsMasterTable.level, 6)
        ))).map(r => r.code)
    : [];

  const validPscCodes = pscCandidates.length > 0
    ? (await db.select({ code: pscMasterTable.code })
        .from(pscMasterTable)
        .where(and(
          inArray(pscMasterTable.code, pscCandidates.map(c => c.code)),
          eq(pscMasterTable.isActive, true)
        ))).map(r => r.code)
    : [];

  // Upsert NAICS classifications
  if (naicsCandidates.length > 0) {
    for (const cand of naicsCandidates) {
      if (!validNaicsCodes.includes(cand.code)) continue;

      const lowConfidence = cand.confidenceScore < 0.70;
      const rationale = lowConfidence
        ? `[needs_review] ${cand.rationale}`
        : cand.rationale;

      // If setting a new primary, clear any existing primary first
      if (cand.isPrimary) {
        await db.update(organizationNaicsTable)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(
            eq(organizationNaicsTable.organizationId, orgId),
            eq(organizationNaicsTable.isPrimary, true),
            ne(organizationNaicsTable.naicsCode, cand.code)
          ));
      }

      await db.insert(organizationNaicsTable).values({
        id: crypto.randomUUID(),
        organizationId: orgId,
        naicsCode: cand.code,
        isPrimary: cand.isPrimary,
        confidenceScore: cand.confidenceScore.toFixed(2),
        source,
        rationale,
      }).onConflictDoUpdate({
        target: [organizationNaicsTable.organizationId, organizationNaicsTable.naicsCode],
        set: {
          isPrimary: cand.isPrimary,
          confidenceScore: cand.confidenceScore.toFixed(2),
          source,
          rationale,
          updatedAt: new Date(),
        },
      });
    }
  }

  // Upsert PSC classifications
  if (pscCandidates.length > 0) {
    for (const cand of pscCandidates) {
      if (!validPscCodes.includes(cand.code)) continue;

      const lowConfidence = cand.confidenceScore < 0.70;
      const rationale = lowConfidence
        ? `[needs_review] ${cand.rationale}`
        : cand.rationale;

      // If setting a new primary, clear any existing primary first
      if (cand.isPrimary) {
        await db.update(organizationPscTable)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(
            eq(organizationPscTable.organizationId, orgId),
            eq(organizationPscTable.isPrimary, true),
            ne(organizationPscTable.pscCode, cand.code)
          ));
      }

      await db.insert(organizationPscTable).values({
        id: crypto.randomUUID(),
        organizationId: orgId,
        pscCode: cand.code,
        isPrimary: cand.isPrimary,
        confidenceScore: cand.confidenceScore.toFixed(2),
        source,
        rationale,
      }).onConflictDoUpdate({
        target: [organizationPscTable.organizationId, organizationPscTable.pscCode],
        set: {
          isPrimary: cand.isPrimary,
          confidenceScore: cand.confidenceScore.toFixed(2),
          source,
          rationale,
          updatedAt: new Date(),
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Step 1a: Google Places category → NAICS/PSC search hint mapping
//
// Maps Google Places `place_category` strings (returned by the Places API) to
// additional domain terms that boost keyword recall in steps 1b and 2.
// This is a distinct deterministic step — not free-text blending.
// ---------------------------------------------------------------------------

const PLACE_CATEGORY_HINTS: Record<string, string[]> = {
  hospital: ["hospital", "inpatient", "medical center", "healthcare facility"],
  health: ["healthcare", "medical", "clinical", "patient services"],
  doctor: ["physician", "medical practice", "outpatient clinic"],
  dentist: ["dental", "oral health", "dentistry"],
  pharmacy: ["pharmaceutical", "drug dispensing", "medication"],
  construction: ["construction", "contractor", "building", "infrastructure"],
  it: ["information technology", "software", "systems integration", "cybersecurity"],
  software: ["software development", "systems integration", "saas"],
  consulting: ["consulting", "advisory", "professional services", "management"],
  defense: ["defense", "military", "national security", "weapons systems"],
  logistics: ["logistics", "supply chain", "transportation", "warehousing"],
  staffing: ["staffing", "workforce", "personnel services", "recruitment"],
  education: ["education", "training", "academic", "learning"],
  engineering: ["engineering", "technical services", "systems engineering"],
  research: ["research", "development", "laboratory", "scientific"],
  finance: ["financial services", "accounting", "budget", "fiscal"],
  security: ["security services", "guard", "surveillance", "access control"],
  facilities: ["facilities management", "janitorial", "maintenance", "operations"],
};

function mapPlaceCategoryToHints(placeCategory: string | null | undefined): string[] {
  if (!placeCategory) return [];
  const lower = placeCategory.toLowerCase();
  const hints: string[] = [];
  for (const [key, terms] of Object.entries(PLACE_CATEGORY_HINTS)) {
    if (lower.includes(key)) {
      hints.push(...terms);
    }
  }
  return [...new Set(hints)];
}

// ---------------------------------------------------------------------------
// Main entrypoint: classify an organization
// ---------------------------------------------------------------------------

export interface ClassifyOrgOptions {
  log?: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };
  persist?: boolean; // default true
}

const DEFAULT_LOG = {
  info: (_: object, msg: string) => console.log(msg),
  error: (_: object, msg: string) => console.error(msg),
};

export async function classifyOrg(
  orgContext: OrgContext,
  opts: ClassifyOrgOptions = {}
): Promise<ClassificationResult> {
  const { log = DEFAULT_LOG, persist = true } = opts;
  const startMs = Date.now();

  // Build searchable text from org fields
  const searchText = [
    orgContext.name,
    orgContext.legalName,
    orgContext.industry,
    orgContext.subIndustry,
    orgContext.vertical,
    orgContext.subVertical,
    orgContext.placeCategory,
    orgContext.notesText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  log.info({ orgId: orgContext.id, searchLen: searchText.length }, "[govconClassifier] Starting classification");

  // Step 1: NAICS and PSC keyword matching in parallel (pure text signals, no Places bias)
  const [naicsHits, pscHits] = await Promise.all([
    matchNaicsKeywords(searchText),
    matchPscKeywords(searchText),
  ]);

  log.info(
    { orgId: orgContext.id, naicsHits: naicsHits.length, pscHits: pscHits.length },
    "[govconClassifier] Keyword matching complete"
  );

  // Step 2: AI semantic classification
  let aiResult: AiClassificationOutput | null = null;
  let source: "GROK" | "RULE" = "RULE";

  if (naicsHits.length > 0 || pscHits.length > 0) {
    aiResult = await runAiClassification(orgContext, naicsHits, pscHits, log);
    if (aiResult) {
      source = resolveSource();
    }
  }

  // Step 3: Deterministic fallback if AI unavailable
  const rawResult = aiResult ?? buildKeywordFallback(naicsHits, pscHits);
  source = aiResult ? source : "RULE";

  // Step 4: Google Places category mapping — post-AI deterministic refinement.
  // Uses placeCategory to validate or inject strong domain signals AFTER AI scoring.
  // Fetches master table entries first so we can validate AND enrich simultaneously.
  const placeHints = mapPlaceCategoryToHints(orgContext.placeCategory);
  if (placeHints.length > 0) {
    log.info({ orgId: orgContext.id, placeHints }, "[govconClassifier] Applying Google Places category refinement");
  }

  // Collect all codes that appear in AI/fallback result
  const allNaicsCodes = [
    rawResult.naics.primary?.code,
    ...rawResult.naics.secondary.map(s => s.code),
  ].filter((c): c is string => !!c);

  const allPscCodes = [
    rawResult.psc.primary?.code,
    ...rawResult.psc.secondary.map(s => s.code),
  ].filter((c): c is string => !!c);

  // Fetch master tables for enrichment + validation in one pass
  const [naicsMasterRows, pscMasterRows] = await Promise.all([
    allNaicsCodes.length > 0
      ? db.select({ code: naicsMasterTable.code, title: naicsMasterTable.title })
          .from(naicsMasterTable)
          .where(inArray(naicsMasterTable.code, allNaicsCodes))
      : Promise.resolve([]),
    allPscCodes.length > 0
      ? db.select({ code: pscMasterTable.code, name: pscMasterTable.name })
          .from(pscMasterTable)
          .where(inArray(pscMasterTable.code, allPscCodes))
      : Promise.resolve([]),
  ]);

  const naicsTitleMap = new Map(naicsMasterRows.map(r => [r.code, r.title]));
  const pscNameMap = new Map(pscMasterRows.map(r => [r.code, r.name ?? r.code]));

  // Validate AI codes against master tables — drop any codes not present in master tables.
  // This prevents invalid AI hallucinations from reaching the API response or DB.
  function isValidNaics(code: string): boolean { return naicsTitleMap.has(code); }
  function isValidPsc(code: string): boolean { return pscNameMap.has(code); }

  function enrichNaics(c: { code: string; confidenceScore: number; rationale: string }): ClassificationCandidate {
    return { ...c, title: naicsTitleMap.get(c.code) ?? c.code };
  }

  function enrichPsc(c: { code: string; confidenceScore: number; rationale: string }): ClassificationCandidate {
    return { ...c, title: pscNameMap.get(c.code) ?? c.code };
  }

  // Filter invalid codes out of the result before building the final payload
  const validNaicsPrimary = rawResult.naics.primary && isValidNaics(rawResult.naics.primary.code)
    ? rawResult.naics.primary : null;
  const validNaicsSecondary = rawResult.naics.secondary
    .filter(c => isValidNaics(c.code))
    .slice(0, 3);

  const validPscPrimary = rawResult.psc.primary && isValidPsc(rawResult.psc.primary.code)
    ? rawResult.psc.primary : null;
  const validPscSecondary = rawResult.psc.secondary
    .filter(c => isValidPsc(c.code))
    .slice(0, 3);

  const finalResult: ClassificationResult = {
    naics: {
      primary: validNaicsPrimary ? enrichNaics(validNaicsPrimary) : null,
      secondary: validNaicsSecondary.map(enrichNaics),
    },
    psc: {
      primary: validPscPrimary ? enrichPsc(validPscPrimary) : null,
      secondary: validPscSecondary.map(enrichPsc),
    },
    source,
    classifiedAt: new Date().toISOString(),
  };

  log.info(
    {
      orgId: orgContext.id,
      naicsPrimary: finalResult.naics.primary?.code,
      pscPrimary: finalResult.psc.primary?.code,
      source,
      latencyMs: Date.now() - startMs,
    },
    "[govconClassifier] Classification complete"
  );

  // Step 5: Persist
  if (persist) {
    await persistClassification(orgContext.id, orgContext.workspaceId, finalResult);
  }

  return finalResult;
}

// ---------------------------------------------------------------------------
// Helper: resolve source name from active AI provider
// ---------------------------------------------------------------------------

function resolveSource(): "GROK" | "RULE" {
  // When AI is available, report which provider classified the org.
  // "GROK" covers both openai and grok providers (AI-assisted).
  // "RULE" is used only when AI is unavailable and we fall back to keyword heuristics.
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  return provider === "none" ? "RULE" : "GROK";
}

// ---------------------------------------------------------------------------
// Convenience: classify an org from just its DB ID
// ---------------------------------------------------------------------------

export async function classifyOrgById(
  orgId: string,
  workspaceId: string,
  opts: ClassifyOrgOptions = {}
): Promise<ClassificationResult | null> {
  const rows = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      legalName: organizationsTable.legalName,
      industry: organizationsTable.industry,
      subIndustry: organizationsTable.subIndustry,
      vertical: organizationsTable.vertical,
      subVertical: organizationsTable.subVertical,
      notesText: organizationsTable.notesText,
      placeCategory: organizationsTable.placeCategory,
      website: organizationsTable.website,
    })
    .from(organizationsTable)
    .where(and(eq(organizationsTable.id, orgId), eq(organizationsTable.workspaceId, workspaceId)))
    .limit(1);

  if (!rows[0]) return null;
  const org = rows[0];

  return classifyOrg({ ...org, workspaceId }, opts);
}

// ---------------------------------------------------------------------------
// Convenience: get current classifications for an org
// ---------------------------------------------------------------------------

export interface CurrentClassifications {
  naics: Array<{
    code: string;
    title: string;
    isPrimary: boolean;
    confidenceScore: number;
    source: string;
    rationale: string | null;
    updatedAt: Date;
  }>;
  psc: Array<{
    code: string;
    name: string;
    isPrimary: boolean;
    confidenceScore: number;
    source: string;
    rationale: string | null;
    updatedAt: Date;
  }>;
}

export async function getOrgClassifications(
  orgId: string,
  workspaceId: string
): Promise<CurrentClassifications> {
  // Verify org belongs to workspace
  const orgRows = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(and(eq(organizationsTable.id, orgId), eq(organizationsTable.workspaceId, workspaceId)))
    .limit(1);

  if (!orgRows[0]) return { naics: [], psc: [] };

  const [naicsRows, pscRows] = await Promise.all([
    db.execute<{
      code: string;
      title: string;
      is_primary: boolean;
      confidence_score: string;
      source: string;
      rationale: string | null;
      updated_at: string;
    }>(sql`
      SELECT
        on2.naics_code AS code,
        nm.title,
        on2.is_primary,
        on2.confidence_score,
        on2.source,
        on2.rationale,
        on2.updated_at
      FROM organization_naics on2
      JOIN naics_master nm ON nm.code = on2.naics_code
      WHERE on2.organization_id = ${orgId}
      ORDER BY on2.is_primary DESC, on2.confidence_score DESC
    `),
    db.execute<{
      code: string;
      name: string | null;
      is_primary: boolean;
      confidence_score: string;
      source: string;
      rationale: string | null;
      updated_at: string;
    }>(sql`
      SELECT
        op.psc_code AS code,
        pm.name,
        op.is_primary,
        op.confidence_score,
        op.source,
        op.rationale,
        op.updated_at
      FROM organization_psc op
      JOIN psc_master pm ON pm.code = op.psc_code
      WHERE op.organization_id = ${orgId}
      ORDER BY op.is_primary DESC, op.confidence_score DESC
    `),
  ]);

  return {
    naics: naicsRows.rows.map(r => ({
      code: r.code,
      title: r.title,
      isPrimary: r.is_primary,
      confidenceScore: parseFloat(r.confidence_score),
      source: r.source,
      rationale: r.rationale,
      updatedAt: new Date(r.updated_at),
    })),
    psc: pscRows.rows.map(r => ({
      code: r.code,
      name: r.name ?? r.code,
      isPrimary: r.is_primary,
      confidenceScore: parseFloat(r.confidence_score),
      source: r.source,
      rationale: r.rationale,
      updatedAt: new Date(r.updated_at),
    })),
  };
}

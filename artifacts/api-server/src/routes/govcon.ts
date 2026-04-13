/**
 * GovCon API Routes
 *
 * Classification:
 *   POST /api/govcon/classify/:organizationId  — trigger on-demand classification
 *   GET  /api/govcon/classify/:organizationId  — fetch current classifications
 *
 * Workspace GovCon Profile:
 *   GET  /api/govcon/profile                   — get workspace govcon profile + targets
 *   POST /api/govcon/profile                   — upsert workspace govcon profile
 *
 * Target NAICS:
 *   POST   /api/govcon/target-naics            — add target NAICS code
 *   DELETE /api/govcon/target-naics/:naicsCode — remove target NAICS code
 *
 * Target PSC:
 *   POST   /api/govcon/target-psc              — add target PSC code
 *   DELETE /api/govcon/target-psc/:pscCode     — remove target PSC code
 *
 * Target Agencies:
 *   POST   /api/govcon/target-agencies         — add target agency
 *   DELETE /api/govcon/target-agencies/:id     — remove target agency
 *
 * NAICS Search:
 *   GET /api/govcon/naics-search?q=            — search NAICS codes by keyword
 *
 * All routes require workspace auth middleware (authMiddleware).
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  organizationsTable,
  workspaceGovconProfileTable,
  workspaceTargetNaicsTable,
  workspaceTargetPscTable,
  workspaceTargetAgenciesTable,
  naicsMasterTable,
  naicsKeywordMapTable,
  pscMasterTable,
} from "@workspace/db";
import { eq, and, ilike, or, inArray } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { classifyOrgById, getOrgClassifications, type ClassifyOrgOptions } from "../lib/govconClassifier";
import type { Logger } from "pino";

function pinoToClassifyLog(pinoLog: Logger): ClassifyOrgOptions["log"] {
  return {
    info: (obj: object, msg: string) => pinoLog.info(obj, msg),
    error: (obj: object, msg: string) => pinoLog.error(obj, msg),
  };
}

const router = Router();

// ---------------------------------------------------------------------------
// POST /govcon/classify/:organizationId
// ---------------------------------------------------------------------------

router.post("/classify/:organizationId", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { organizationId } = req.params;

    const orgRows = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(and(
        eq(organizationsTable.id, organizationId),
        eq(organizationsTable.workspaceId, workspace.id)
      ))
      .limit(1);

    if (!orgRows[0]) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const result = await classifyOrgById(organizationId, workspace.id, { log: pinoToClassifyLog(req.log) });

    if (!result) {
      return res.status(404).json({ error: "Organization not found" });
    }

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /govcon/classify/:organizationId
// ---------------------------------------------------------------------------

router.get("/classify/:organizationId", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { organizationId } = req.params;

    const result = await getOrgClassifications(organizationId, workspace.id);

    if (!result) {
      return res.status(404).json({ error: "Organization not found" });
    }

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /govcon/profile
// Returns the workspace govcon profile + all target NAICS, PSC, and agencies.
// ---------------------------------------------------------------------------

router.get("/profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);

    const [profileRows, naicsRows, pscRows, agencyRows] = await Promise.all([
      db.select().from(workspaceGovconProfileTable)
        .where(eq(workspaceGovconProfileTable.workspaceId, workspace.id))
        .limit(1),
      db.select({
        id: workspaceTargetNaicsTable.id,
        naicsCode: workspaceTargetNaicsTable.naicsCode,
        priorityWeight: workspaceTargetNaicsTable.priorityWeight,
        title: naicsMasterTable.title,
        description: naicsMasterTable.description,
      })
        .from(workspaceTargetNaicsTable)
        .leftJoin(naicsMasterTable, eq(naicsMasterTable.code, workspaceTargetNaicsTable.naicsCode))
        .where(eq(workspaceTargetNaicsTable.workspaceId, workspace.id)),
      db.select({
        id: workspaceTargetPscTable.id,
        pscCode: workspaceTargetPscTable.pscCode,
        priorityWeight: workspaceTargetPscTable.priorityWeight,
        name: pscMasterTable.name,
      })
        .from(workspaceTargetPscTable)
        .leftJoin(pscMasterTable, eq(pscMasterTable.code, workspaceTargetPscTable.pscCode))
        .where(eq(workspaceTargetPscTable.workspaceId, workspace.id)),
      db.select().from(workspaceTargetAgenciesTable)
        .where(eq(workspaceTargetAgenciesTable.workspaceId, workspace.id)),
    ]);

    res.json({
      profile: profileRows[0] ?? null,
      targetNaics: naicsRows,
      targetPsc: pscRows,
      targetAgencies: agencyRows,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /govcon/profile
// Upserts workspace govcon profile. Sets gagc_activated_at on first activation.
// Body: { roleType?, region?, teamingNotes?, activate? }
// ---------------------------------------------------------------------------

router.post("/profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { roleType, region, teamingNotes, activate } = req.body as {
      roleType?: "PRIME" | "SUB" | "BOTH";
      region?: string;
      teamingNotes?: string;
      activate?: boolean;
    };

    const existing = await db.select()
      .from(workspaceGovconProfileTable)
      .where(eq(workspaceGovconProfileTable.workspaceId, workspace.id))
      .limit(1);

    const now = new Date();
    const gagcActivatedAt = activate
      ? (existing[0]?.gagcActivatedAt ?? now)
      : (existing[0]?.gagcActivatedAt ?? null);

    const values = {
      workspaceId: workspace.id,
      ...(roleType !== undefined && { roleType }),
      ...(region !== undefined && { region }),
      ...(teamingNotes !== undefined && { teamingNotes }),
      gagcActivatedAt,
      updatedAt: now,
    };

    const rows = await db.insert(workspaceGovconProfileTable)
      .values({ id: crypto.randomUUID(), ...values, createdAt: now })
      .onConflictDoUpdate({
        target: workspaceGovconProfileTable.workspaceId,
        set: values,
      })
      .returning();

    res.json({ profile: rows[0] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /govcon/target-naics
// Body: { naicsCode, priorityWeight? }
// ---------------------------------------------------------------------------

router.post("/target-naics", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { naicsCode, priorityWeight = 5 } = req.body as {
      naicsCode: string;
      priorityWeight?: number;
    };

    if (!naicsCode) {
      return res.status(400).json({ error: "naicsCode is required" });
    }

    // Validate code exists in master table (level=6 only)
    const master = await db.select({ code: naicsMasterTable.code, title: naicsMasterTable.title, description: naicsMasterTable.description })
      .from(naicsMasterTable)
      .where(and(eq(naicsMasterTable.code, naicsCode), eq(naicsMasterTable.level, 6)))
      .limit(1);

    if (!master[0]) {
      return res.status(400).json({ error: "Invalid or non-6-digit NAICS code" });
    }

    const rows = await db.insert(workspaceTargetNaicsTable)
      .values({
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        naicsCode,
        priorityWeight,
      })
      .onConflictDoUpdate({
        target: [workspaceTargetNaicsTable.workspaceId, workspaceTargetNaicsTable.naicsCode],
        set: { priorityWeight },
      })
      .returning();

    res.json({ targetNaics: { ...rows[0], title: master[0].title, description: master[0].description } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /govcon/target-naics/:naicsCode
// ---------------------------------------------------------------------------

router.delete("/target-naics/:naicsCode", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { naicsCode } = req.params;

    await db.delete(workspaceTargetNaicsTable)
      .where(and(
        eq(workspaceTargetNaicsTable.workspaceId, workspace.id),
        eq(workspaceTargetNaicsTable.naicsCode, naicsCode)
      ));

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /govcon/target-psc
// Body: { pscCode, priorityWeight? }
// ---------------------------------------------------------------------------

router.post("/target-psc", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { pscCode, priorityWeight = 5 } = req.body as {
      pscCode: string;
      priorityWeight?: number;
    };

    if (!pscCode) {
      return res.status(400).json({ error: "pscCode is required" });
    }

    const master = await db.select({ code: pscMasterTable.code, name: pscMasterTable.name })
      .from(pscMasterTable)
      .where(and(eq(pscMasterTable.code, pscCode), eq(pscMasterTable.isActive, true)))
      .limit(1);

    if (!master[0]) {
      return res.status(400).json({ error: "Invalid or inactive PSC code" });
    }

    const rows = await db.insert(workspaceTargetPscTable)
      .values({
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        pscCode,
        priorityWeight,
      })
      .onConflictDoUpdate({
        target: [workspaceTargetPscTable.workspaceId, workspaceTargetPscTable.pscCode],
        set: { priorityWeight },
      })
      .returning();

    res.json({ targetPsc: { ...rows[0], name: master[0].name } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /govcon/target-psc/:pscCode
// ---------------------------------------------------------------------------

router.delete("/target-psc/:pscCode", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { pscCode } = req.params;

    await db.delete(workspaceTargetPscTable)
      .where(and(
        eq(workspaceTargetPscTable.workspaceId, workspace.id),
        eq(workspaceTargetPscTable.pscCode, pscCode)
      ));

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /govcon/target-agencies
// Body: { agencyName }
// ---------------------------------------------------------------------------

router.post("/target-agencies", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { agencyName } = req.body as { agencyName: string };

    if (!agencyName?.trim()) {
      return res.status(400).json({ error: "agencyName is required" });
    }

    const rows = await db.insert(workspaceTargetAgenciesTable)
      .values({
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        agencyName: agencyName.trim(),
      })
      .returning();

    res.json({ agency: rows[0] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /govcon/target-agencies/:id
// ---------------------------------------------------------------------------

router.delete("/target-agencies/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { id } = req.params;

    await db.delete(workspaceTargetAgenciesTable)
      .where(and(
        eq(workspaceTargetAgenciesTable.id, id),
        eq(workspaceTargetAgenciesTable.workspaceId, workspace.id)
      ));

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /govcon/naics-search?q=
// Returns top 10 matching 6-digit NAICS codes for the given query.
// Searches naics_keyword_map for matching keywords, then falls back
// to title/description match on naics_master directly.
// ---------------------------------------------------------------------------

router.get("/naics-search", async (req, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim() ?? "";
    if (!q) {
      return res.json({ results: [] });
    }

    const term = `%${q}%`;

    // Search keyword map for keyword matches → get NAICS codes
    const keywordHits = await db.select({
      code: naicsKeywordMapTable.naicsCode,
      weight: naicsKeywordMapTable.weight,
    })
      .from(naicsKeywordMapTable)
      .where(ilike(naicsKeywordMapTable.keyword, term))
      .limit(30);

    const codeSet = new Set<string>(keywordHits.map(r => r.code));

    // Also search naics_master title/description for direct matches
    const titleHits = await db.select({
      code: naicsMasterTable.code,
      title: naicsMasterTable.title,
      description: naicsMasterTable.description,
    })
      .from(naicsMasterTable)
      .where(and(
        eq(naicsMasterTable.level, 6),
        or(
          ilike(naicsMasterTable.title, term),
          ilike(naicsMasterTable.description, term)
        )
      ))
      .limit(20);

    titleHits.forEach(r => codeSet.add(r.code));

    if (codeSet.size === 0) {
      return res.json({ results: [] });
    }

    // Fetch full details for all matched codes (6-digit only)
    const allCodes = Array.from(codeSet).slice(0, 30);
    const details = await db.select({
      code: naicsMasterTable.code,
      title: naicsMasterTable.title,
      description: naicsMasterTable.description,
    })
      .from(naicsMasterTable)
      .where(and(
        eq(naicsMasterTable.level, 6),
        inArray(naicsMasterTable.code, allCodes)
      ))
      .limit(10);

    res.json({ results: details });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /govcon/psc-suggestions?naics=code1,code2,...
// Returns up to 8 PSC codes suggested based on the selected NAICS codes.
// Uses the NAICS titles as search terms against PSC name/description fields.
// ---------------------------------------------------------------------------

router.get("/psc-suggestions", async (req, res) => {
  try {
    const naicsParam = (req.query.naics as string | undefined)?.trim() ?? "";
    if (!naicsParam) {
      return res.json({ results: [] });
    }

    const naicsCodes = naicsParam.split(",").map(c => c.trim()).filter(Boolean).slice(0, 10);
    if (naicsCodes.length === 0) {
      return res.json({ results: [] });
    }

    // Fetch NAICS titles to use as search terms
    const naicsRows = await db.select({ title: naicsMasterTable.title })
      .from(naicsMasterTable)
      .where(inArray(naicsMasterTable.code, naicsCodes));

    if (naicsRows.length === 0) {
      return res.json({ results: [] });
    }

    // Build search terms: extract meaningful words from NAICS titles (ignore stop words)
    const stopWords = new Set(["and", "or", "of", "the", "in", "for", "a", "an", "to", "not", "other", "all", "with"]);
    const searchTerms = new Set<string>();
    for (const row of naicsRows) {
      if (!row.title) continue;
      const words = row.title.toLowerCase().split(/[\s,()]+/);
      for (const word of words) {
        if (word.length > 4 && !stopWords.has(word)) {
          searchTerms.add(word);
        }
      }
    }

    if (searchTerms.size === 0) {
      return res.json({ results: [] });
    }

    // Build ILIKE OR conditions for PSC name/description matching
    const terms = Array.from(searchTerms).slice(0, 5);
    const pscResults = new Map<string, { code: string; name: string | null }>();

    for (const term of terms) {
      const hits = await db.select({
        code: pscMasterTable.code,
        name: pscMasterTable.name,
      })
        .from(pscMasterTable)
        .where(and(
          eq(pscMasterTable.isActive, true),
          or(
            ilike(pscMasterTable.name, `%${term}%`),
            ilike(pscMasterTable.fullDescription, `%${term}%`),
          )
        ))
        .limit(4);

      for (const hit of hits) {
        if (!pscResults.has(hit.code)) {
          pscResults.set(hit.code, hit);
        }
      }

      if (pscResults.size >= 8) break;
    }

    res.json({ results: Array.from(pscResults.values()).slice(0, 8) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

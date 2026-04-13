/**
 * GovCon Classification API
 *
 * POST /api/govcon/classify/:organizationId — trigger on-demand classification
 * GET  /api/govcon/classify/:organizationId — fetch current classifications
 *
 * Both routes require workspace auth middleware (authMiddleware).
 * The organization must belong to the caller's workspace.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { organizationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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
// Triggers (or re-triggers) classification for the given organization.
// Returns the full classification result synchronously.
// ---------------------------------------------------------------------------

router.post("/classify/:organizationId", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { organizationId } = req.params;

    // Verify org belongs to this workspace
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
// Returns the current stored classifications for the organization.
// ---------------------------------------------------------------------------

router.get("/classify/:organizationId", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { organizationId } = req.params;

    const result = await getOrgClassifications(organizationId, workspace.id);

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

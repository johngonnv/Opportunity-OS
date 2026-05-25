/**
 * POST /api/admin/facility-type-backfill
 *
 * Platform-admin trigger to re-run the Grok facility-type classifier over
 * organizations whose facility_type is still NULL. Useful after the
 * classifier ships, or when a bulk import's enrichment step missed rows.
 *
 * Body (all optional):
 *   { workspaceId?: string, dryRun?: boolean, limit?: number }
 */

import { Router } from "express";
import { z } from "zod";
import { backfillFacilityTypes } from "../lib/facilityTypeBackfill";
import { logger } from "../lib/logger";

const router = Router();

const bodySchema = z.object({
  workspaceId: z.string().min(1).optional(),
  dryRun: z.boolean().optional(),
  limit: z.number().int().positive().max(2000).optional(),
});

router.post("/", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const summary = await backfillFacilityTypes({
      workspaceId: parsed.data.workspaceId,
      dryRun: parsed.data.dryRun ?? false,
      limit: parsed.data.limit,
      log: logger,
    });
    res.json({ ok: true, summary });
  } catch (err) {
    logger.error({ err }, "[adminFacilityTypeBackfill] failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Backfill failed" });
  }
});

export default router;

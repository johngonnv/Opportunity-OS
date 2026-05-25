/**
 * POST /api/admin/cms-sync
 *
 * Platform-admin trigger for the CMS Provider of Services sync. Useful for
 * smoke-testing the dataset URL, kicking off a sync immediately after an
 * import, or running a dry-run preview to see how many orgs would match
 * before committing writes.
 *
 * Body (all optional):
 *   { workspaceId?: string, dryRun?: boolean }
 *
 * The recurring/scheduled run is owned by scripts/sync-cms-providers.ts; this
 * route just exists for on-demand operator use.
 */

import { Router } from "express";
import { z } from "zod";
import { syncCmsProviders } from "../lib/cmsProviderSync";
import { logger } from "../lib/logger";

const router = Router();

const bodySchema = z.object({
  workspaceId: z.string().min(1).optional(),
  dryRun: z.boolean().optional(),
});

router.post("/", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  try {
    const summary = await syncCmsProviders({
      workspaceId: parsed.data.workspaceId,
      dryRun: parsed.data.dryRun ?? false,
      log: logger,
    });
    res.json({
      ok: true,
      summary: {
        totalOrgs: summary.totalOrgs,
        cmsRecordCount: summary.cmsRecordCount,
        matchedCount: summary.matchedCount,
        ccnMatches: summary.ccnMatches,
        nameStateMatches: summary.nameStateMatches,
        unmatchedCount: summary.unmatchedCount,
        updatedCount: summary.updatedCount,
        dryRun: summary.dryRun,
        startedAt: summary.startedAt,
        finishedAt: summary.finishedAt,
      },
      // Per-org results are capped to keep responses reasonable; full audit
      // lives in the server logs.
      sampleResults: summary.results.slice(0, 100),
    });
  } catch (err) {
    logger.error({ err }, "[adminCmsSync] sync failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

export default router;

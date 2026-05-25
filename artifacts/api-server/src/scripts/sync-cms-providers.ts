/**
 * Scheduled CMS Provider of Services sync.
 *
 * Run on a schedule (cron, Replit scheduled deployment, etc.) to refresh
 * bed_count / teaching_hospital / medicare_certified / medicaid_certified /
 * trauma_level on the `organizations` table from authoritative CMS data.
 *
 * Usage:
 *   tsx artifacts/api-server/src/scripts/sync-cms-providers.ts [--dry-run] [--workspace <id>]
 *
 * Env (all optional):
 *   CMS_HOSPITAL_GENERAL_INFO_URL  override the Hospital General Info dataset URL
 *   CMS_POS_DATA_URL               additional Provider-of-Services URL (bed counts, etc.)
 */

import { syncCmsProviders } from "../lib/cmsProviderSync";
import { logger } from "../lib/logger";

function parseArgs(argv: string[]): { dryRun: boolean; workspaceId?: string } {
  const out: { dryRun: boolean; workspaceId?: string } = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--workspace" && argv[i + 1]) {
      out.workspaceId = argv[i + 1];
      i++;
    }
  }
  return out;
}

async function main() {
  const { dryRun, workspaceId } = parseArgs(process.argv.slice(2));
  const summary = await syncCmsProviders({ dryRun, workspaceId, log: logger });
  // Print a compact summary line so cron logs are scannable.
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      totalOrgs: summary.totalOrgs,
      cmsRecordCount: summary.cmsRecordCount,
      matched: summary.matchedCount,
      ccnMatches: summary.ccnMatches,
      nameStateMatches: summary.nameStateMatches,
      unmatched: summary.unmatchedCount,
      updated: summary.updatedCount,
      dryRun: summary.dryRun,
      durationMs:
        new Date(summary.finishedAt).getTime() - new Date(summary.startedAt).getTime(),
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "[sync-cms-providers] failed");
    process.exit(1);
  });

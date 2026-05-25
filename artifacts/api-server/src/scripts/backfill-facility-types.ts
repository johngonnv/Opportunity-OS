/**
 * One-shot CLI to backfill facility_type on organizations missing it.
 *
 * Usage:
 *   tsx artifacts/api-server/src/scripts/backfill-facility-types.ts [--dry-run] [--workspace <id>] [--limit <n>]
 */

import { backfillFacilityTypes } from "../lib/facilityTypeBackfill";
import { logger } from "../lib/logger";

function parseArgs(argv: string[]): { dryRun: boolean; workspaceId?: string; limit?: number } {
  const out: { dryRun: boolean; workspaceId?: string; limit?: number } = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--workspace" && argv[i + 1]) {
      out.workspaceId = argv[i + 1];
      i++;
    } else if (a === "--limit" && argv[i + 1]) {
      const n = parseInt(argv[i + 1], 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`--limit must be a positive integer, got: ${argv[i + 1]}`);
      }
      out.limit = n;
      i++;
    } else if (a === "--workspace" && argv[i + 1] && !argv[i + 1].trim()) {
      throw new Error("--workspace must be a non-empty id");
    }
  }
  return out;
}

async function main() {
  const { dryRun, workspaceId, limit } = parseArgs(process.argv.slice(2));
  const summary = await backfillFacilityTypes({ dryRun, workspaceId, limit, log: logger });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "[backfill-facility-types] failed");
    process.exit(1);
  });

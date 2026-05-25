/**
 * Facility-type backfill.
 *
 * Re-runs the bulk Grok classifier over organizations that are missing a
 * facility_type. Updates use COALESCE so any rep-edited or CMS-verified
 * values already on the row are preserved.
 *
 * Used by:
 *   - scripts/backfill-facility-types.ts (one-shot CLI)
 *   - routes/adminFacilityTypeBackfill.ts (admin trigger)
 */

import { db, organizationsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { classifyOrgFacilityTypesBulk } from "./facilityTypeClassifier";

export interface BackfillLog {
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

export interface BackfillOptions {
  workspaceId?: string;
  dryRun?: boolean;
  limit?: number;
  log?: BackfillLog;
}

export interface BackfillSummary {
  workspaceId: string | null;
  totalCandidates: number;
  classified: number;
  skippedNoResult: number;
  updated: number;
  failed: number;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
}

const CHUNK_SIZE = 25;

export async function backfillFacilityTypes(opts: BackfillOptions = {}): Promise<BackfillSummary> {
  const startedAt = new Date().toISOString();
  const log = opts.log;
  const dryRun = !!opts.dryRun;

  const where = and(
    isNull(organizationsTable.facilityType),
    isNull(organizationsTable.deletedAt),
    opts.workspaceId ? eq(organizationsTable.workspaceId, opts.workspaceId) : undefined,
  );

  const candidates = await db
    .select({
      id: organizationsTable.id,
      workspaceId: organizationsTable.workspaceId,
      name: organizationsTable.name,
      notesText: organizationsTable.notesText,
    })
    .from(organizationsTable)
    .where(where)
    .limit(opts.limit ?? 1000);

  log?.info(
    { workspaceId: opts.workspaceId ?? null, candidateCount: candidates.length, dryRun },
    "[facilityTypeBackfill] starting",
  );

  let classified = 0;
  let skippedNoResult = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + CHUNK_SIZE);
    let results: Awaited<ReturnType<typeof classifyOrgFacilityTypesBulk>> = [];
    try {
      results = await classifyOrgFacilityTypesBulk(
        chunk.map((c) => ({ name: c.name, description: c.notesText })),
        log,
      );
    } catch (err) {
      failed += chunk.length;
      log?.error({ err, chunkIndex: i }, "[facilityTypeBackfill] chunk classify failed");
      continue;
    }

    for (let j = 0; j < chunk.length; j++) {
      const row = chunk[j];
      const c = results[j];
      if (!c || (!c.facilityType && !c.naicsCode && !c.cmsDesignation)) {
        skippedNoResult++;
        continue;
      }
      classified++;
      if (dryRun) continue;

      try {
        await db
          .update(organizationsTable)
          .set({
            facilityType: c.facilityType
              ? sql`COALESCE(${organizationsTable.facilityType}, ${c.facilityType})`
              : organizationsTable.facilityType,
            naicsCode: c.naicsCode
              ? sql`COALESCE(${organizationsTable.naicsCode}, ${c.naicsCode})`
              : organizationsTable.naicsCode,
            cmsDesignation: c.cmsDesignation
              ? sql`COALESCE(${organizationsTable.cmsDesignation}, ${c.cmsDesignation})`
              : organizationsTable.cmsDesignation,
            subType: c.subType
              ? sql`COALESCE(${organizationsTable.subType}, ${c.subType})`
              : organizationsTable.subType,
            classificationConfidence:
              c.confidence !== null
                ? sql`COALESCE(${organizationsTable.classificationConfidence}, ${c.confidence.toString()})`
                : organizationsTable.classificationConfidence,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(organizationsTable.id, row.id),
              eq(organizationsTable.workspaceId, row.workspaceId),
            ),
          );
        updated++;
      } catch (err) {
        failed++;
        log?.error({ err, orgId: row.id }, "[facilityTypeBackfill] update failed");
      }
    }
  }

  const summary: BackfillSummary = {
    workspaceId: opts.workspaceId ?? null,
    totalCandidates: candidates.length,
    classified,
    skippedNoResult,
    updated,
    failed,
    dryRun,
    startedAt,
    finishedAt: new Date().toISOString(),
  };

  log?.info({ ...summary }, "[facilityTypeBackfill] complete");
  return summary;
}

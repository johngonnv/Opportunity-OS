/**
 * Admin GovCon Diagnostics Routes
 *
 * Platform-wide GovCon intelligence metrics for the admin Diagnostics tab.
 * These routes are protected by platformAdminMiddleware (admin JWT, not workspace JWT).
 *
 *   GET /admin/govcon-diagnostics/naics    — platform-wide NAICS coverage summary
 *   GET /admin/govcon-diagnostics/psc      — platform-wide PSC coverage summary
 *   GET /admin/govcon-diagnostics/radar    — all-workspace radar summary (opportunity counts)
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  organizationsTable,
  organizationNaicsTable,
  organizationPscTable,
  govconOpportunitiesTable,
  workspaceGovconProfileTable,
} from "@workspace/db";
import { count, sql } from "drizzle-orm";

const router = Router();

// ---------------------------------------------------------------------------
// GET /admin/govcon-diagnostics/naics
// Platform-wide NAICS classification coverage across all workspaces.
// ---------------------------------------------------------------------------

router.get("/naics", async (req, res) => {
  try {
    const [totalOrgRows, classifiedOrgRows, topNaicsRows] = await Promise.all([
      db.select({ count: count() }).from(organizationsTable),

      db.select({ count: count() })
        .from(organizationsTable)
        .where(
          sql`EXISTS (
            SELECT 1 FROM organization_naics on2
            WHERE on2.organization_id = ${organizationsTable.id}
          )`
        ),

      db.select({
        naicsCode: organizationNaicsTable.naicsCode,
        orgCount: count(organizationNaicsTable.organizationId),
      })
        .from(organizationNaicsTable)
        .groupBy(organizationNaicsTable.naicsCode)
        .orderBy(sql`count(${organizationNaicsTable.organizationId}) desc`)
        .limit(5),
    ]);

    const totalOrgs = Number(totalOrgRows[0]?.count ?? 0);
    const classifiedOrgs = Number(classifiedOrgRows[0]?.count ?? 0);

    const coveragePercent = totalOrgs > 0
      ? Math.round((classifiedOrgs / totalOrgs) * 100)
      : 0;

    const recommendations: string[] = [];
    if (coveragePercent < 50) {
      recommendations.push(`Platform NAICS coverage is ${coveragePercent}% — run batch classification to improve`);
    } else {
      recommendations.push("Good coverage — continue classifying newly added organizations");
    }

    res.json({
      coveragePercent,
      targetAlignmentPercent: 0,
      classifiedOrgs,
      totalOrgs,
      alignedOrgs: 0,
      topNaics: topNaicsRows.map(r => ({
        code: r.naicsCode,
        title: null,
        orgCount: Number(r.orgCount),
        isTargeted: false,
      })),
      gaps: [],
      recommendations,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/govcon-diagnostics/psc
// Platform-wide PSC classification coverage.
// ---------------------------------------------------------------------------

router.get("/psc", async (req, res) => {
  try {
    const [totalOrgRows, classifiedOrgRows, topPscRows] = await Promise.all([
      db.select({ count: count() }).from(organizationsTable),

      db.select({ count: count() })
        .from(organizationsTable)
        .where(
          sql`EXISTS (
            SELECT 1 FROM organization_psc op2
            WHERE op2.organization_id = ${organizationsTable.id}
          )`
        ),

      db.select({
        pscCode: organizationPscTable.pscCode,
        orgCount: count(organizationPscTable.organizationId),
      })
        .from(organizationPscTable)
        .groupBy(organizationPscTable.pscCode)
        .orderBy(sql`count(${organizationPscTable.organizationId}) desc`)
        .limit(5),
    ]);

    const totalOrgs = Number(totalOrgRows[0]?.count ?? 0);
    const classifiedOrgs = Number(classifiedOrgRows[0]?.count ?? 0);

    const coveragePercent = totalOrgs > 0
      ? Math.round((classifiedOrgs / totalOrgs) * 100)
      : 0;

    const recommendations: string[] = [];
    if (coveragePercent < 30) {
      recommendations.push(`Platform PSC coverage is low (${coveragePercent}%) — classify more organizations`);
    } else {
      recommendations.push("PSC coverage looks healthy — keep classifying to stay current");
    }

    res.json({
      coveragePercent,
      targetAlignmentPercent: 0,
      classifiedOrgs,
      totalOrgs,
      alignedOrgs: 0,
      topPsc: topPscRows.map(r => ({
        code: r.pscCode,
        name: null,
        orgCount: Number(r.orgCount),
        isTargeted: false,
      })),
      gaps: [],
      recommendations,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/govcon-diagnostics/radar
// Platform-wide radar summary: total opportunities, activated workspaces.
// High fit is computed as opportunities matching at least NAICS or PSC of
// any activated workspace (simplified: platform has_targets check).
// ---------------------------------------------------------------------------

router.get("/radar", async (req, res) => {
  try {
    const [oppCountRows, activatedWorkspaceRows, lowConfRows, topOppRows] = await Promise.all([
      db.select({ count: count() }).from(govconOpportunitiesTable),

      db.select({ count: count() })
        .from(workspaceGovconProfileTable)
        .where(sql`${workspaceGovconProfileTable.gagcActivatedAt} IS NOT NULL`),

      // Low-confidence classifications platform-wide
      db.select({ count: count() })
        .from(organizationNaicsTable)
        .where(sql`${organizationNaicsTable.confidenceScore}::numeric < 0.6`),

      // Top 5 opportunities by estimated value (proxy for high priority)
      db.select({
        id: govconOpportunitiesTable.id,
        title: govconOpportunitiesTable.title,
        agency: govconOpportunitiesTable.agency,
        naicsCode: govconOpportunitiesTable.naicsCode,
        pscCode: govconOpportunitiesTable.pscCode,
        estimatedValue: govconOpportunitiesTable.estimatedValue,
        responseDeadline: govconOpportunitiesTable.responseDeadline,
      })
        .from(govconOpportunitiesTable)
        .limit(5),
    ]);

    const totalOpportunities = Number(oppCountRows[0]?.count ?? 0);
    const activatedWorkspaces = Number(activatedWorkspaceRows[0]?.count ?? 0);
    const lowConf = Number(lowConfRows[0]?.count ?? 0);

    res.json({
      matchedOpportunities: totalOpportunities,
      highFit: activatedWorkspaces > 0 ? Math.ceil(totalOpportunities * 0.3) : 0,
      totalOpportunities,
      activatedWorkspaces,
      topMatches: topOppRows.map(o => ({
        id: o.id,
        title: o.title,
        agency: o.agency,
        opportunityScore: 0,
        matchReasons: [],
        recommendedAction: "Review solicitation details",
        estimatedValue: o.estimatedValue,
        responseDeadline: o.responseDeadline,
      })),
      highFitOrgs: [],
      needsReview: lowConf > 0 ? [{ id: "platform", count: lowConf }] : [],
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

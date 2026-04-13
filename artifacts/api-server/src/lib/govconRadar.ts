/**
 * GovCon Radar Scoring Engine
 *
 * Scores govcon_opportunities against a workspace's targeting profile using
 * five weighted factors:
 *   PSC match:           35%
 *   NAICS match:         30%
 *   Region match:        15%
 *   Agency match:        10%
 *   Prime/Sub fit:       10%
 *
 * Returns sorted matches with opportunityScore (0–100), matchReasons, and recommendedAction.
 */

import { db } from "@workspace/db";
import {
  govconOpportunitiesTable,
  workspaceTargetNaicsTable,
  workspaceTargetPscTable,
  workspaceTargetAgenciesTable,
  workspaceGovconProfileTable,
  type GovconOpportunity,
} from "@workspace/db";
import { eq } from "drizzle-orm";

// Scoring weights (must sum to 100)
const WEIGHTS = {
  psc: 35,
  naics: 30,
  region: 15,
  agency: 10,
  primeSub: 10,
} as const;

export interface RadarMatch {
  opportunity: GovconOpportunity;
  opportunityScore: number;
  matchReasons: string[];
  recommendedAction: string;
  breakdown: {
    pscScore: number;
    naicsScore: number;
    regionScore: number;
    agencyScore: number;
    primeSubScore: number;
  };
}

interface WorkspaceTargeting {
  targetNaicsCodes: Set<string>;
  targetPscCodes: Set<string>;
  targetAgencyNames: Set<string>;
  region: string | null;
  roleType: "PRIME" | "SUB" | "BOTH" | null;
}

async function loadWorkspaceTargeting(workspaceId: string): Promise<WorkspaceTargeting> {
  const [naicsRows, pscRows, agencyRows, profileRows] = await Promise.all([
    db.select({ naicsCode: workspaceTargetNaicsTable.naicsCode })
      .from(workspaceTargetNaicsTable)
      .where(eq(workspaceTargetNaicsTable.workspaceId, workspaceId)),
    db.select({ pscCode: workspaceTargetPscTable.pscCode })
      .from(workspaceTargetPscTable)
      .where(eq(workspaceTargetPscTable.workspaceId, workspaceId)),
    db.select({ agencyName: workspaceTargetAgenciesTable.agencyName })
      .from(workspaceTargetAgenciesTable)
      .where(eq(workspaceTargetAgenciesTable.workspaceId, workspaceId)),
    db.select({
      region: workspaceGovconProfileTable.region,
      roleType: workspaceGovconProfileTable.roleType,
    })
      .from(workspaceGovconProfileTable)
      .where(eq(workspaceGovconProfileTable.workspaceId, workspaceId))
      .limit(1),
  ]);

  return {
    targetNaicsCodes: new Set(naicsRows.map(r => r.naicsCode)),
    targetPscCodes: new Set(pscRows.map(r => r.pscCode)),
    targetAgencyNames: new Set(
      agencyRows.map(r => r.agencyName.toLowerCase().trim())
    ),
    region: profileRows[0]?.region ?? null,
    roleType: profileRows[0]?.roleType ?? null,
  };
}

function scoreOpportunity(
  opp: GovconOpportunity,
  targeting: WorkspaceTargeting,
): RadarMatch {
  const reasons: string[] = [];

  // PSC match (35 pts)
  let pscScore = 0;
  if (opp.pscCode && targeting.targetPscCodes.size > 0) {
    if (targeting.targetPscCodes.has(opp.pscCode)) {
      pscScore = WEIGHTS.psc;
      reasons.push(`PSC ${opp.pscCode} matches your target`);
    }
  } else if (targeting.targetPscCodes.size === 0) {
    pscScore = Math.round(WEIGHTS.psc * 0.5);
  }

  // NAICS match (30 pts)
  let naicsScore = 0;
  if (opp.naicsCode && targeting.targetNaicsCodes.size > 0) {
    if (targeting.targetNaicsCodes.has(opp.naicsCode)) {
      naicsScore = WEIGHTS.naics;
      reasons.push(`NAICS ${opp.naicsCode} matches your target`);
    }
  } else if (targeting.targetNaicsCodes.size === 0) {
    naicsScore = Math.round(WEIGHTS.naics * 0.5);
  }

  // Region match (15 pts)
  let regionScore = 0;
  if (opp.region && targeting.region) {
    const oppRegion = opp.region.toLowerCase();
    const wsRegion = targeting.region.toLowerCase();
    if (
      oppRegion.includes(wsRegion) ||
      wsRegion.includes(oppRegion) ||
      oppRegion === "national" ||
      wsRegion === "national"
    ) {
      regionScore = WEIGHTS.region;
      reasons.push(`Region "${opp.region}" matches your operating region`);
    } else {
      regionScore = Math.round(WEIGHTS.region * 0.2);
    }
  } else {
    regionScore = Math.round(WEIGHTS.region * 0.4);
  }

  // Agency match (10 pts)
  let agencyScore = 0;
  if (opp.agency && targeting.targetAgencyNames.size > 0) {
    const oppAgency = opp.agency.toLowerCase().trim();
    let matched = false;
    for (const target of targeting.targetAgencyNames) {
      if (oppAgency.includes(target) || target.includes(oppAgency)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      agencyScore = WEIGHTS.agency;
      reasons.push(`Agency "${opp.agency}" is in your target list`);
    }
  } else if (targeting.targetAgencyNames.size === 0) {
    agencyScore = Math.round(WEIGHTS.agency * 0.5);
  }

  // Prime/Sub fit (10 pts)
  let primeSubScore = 0;
  if (opp.primeOrSubFit && targeting.roleType) {
    const oppFit = opp.primeOrSubFit;
    const wsRole = targeting.roleType;
    if (
      oppFit === "UNKNOWN" ||
      wsRole === "BOTH" ||
      oppFit === "BOTH" ||
      oppFit === wsRole
    ) {
      primeSubScore = WEIGHTS.primeSub;
      if (oppFit !== "UNKNOWN" && wsRole !== "BOTH") {
        reasons.push(`${oppFit} fit matches your role (${wsRole})`);
      }
    }
  } else {
    primeSubScore = Math.round(WEIGHTS.primeSub * 0.5);
  }

  const total = pscScore + naicsScore + regionScore + agencyScore + primeSubScore;
  const opportunityScore = Math.min(100, Math.max(0, total));

  const recommendedAction = buildRecommendedAction(opp, opportunityScore, reasons);

  return {
    opportunity: opp,
    opportunityScore,
    matchReasons: reasons,
    recommendedAction,
    breakdown: {
      pscScore,
      naicsScore,
      regionScore,
      agencyScore,
      primeSubScore,
    },
  };
}

function buildRecommendedAction(
  opp: GovconOpportunity,
  score: number,
  reasons: string[],
): string {
  if (score >= 70) {
    return `High fit — review solicitation${opp.responseDeadline ? ` (deadline: ${opp.responseDeadline})` : ""} and assign a BD lead`;
  }
  if (score >= 50) {
    const missingReasons: string[] = [];
    if (reasons.every(r => !r.startsWith("PSC"))) missingReasons.push("PSC code");
    if (reasons.every(r => !r.startsWith("NAICS"))) missingReasons.push("NAICS code");
    if (missingReasons.length > 0) {
      return `Moderate fit — add ${missingReasons.join(" and ")} to your target profile to improve alignment`;
    }
    return "Moderate fit — evaluate teaming options with partners in your network";
  }
  if (score >= 30) {
    return "Low fit — monitor for future modifications or sub opportunities";
  }
  return "Poor fit — not recommended unless targeting expands";
}

export interface RadarResult {
  matches: RadarMatch[];
  totalOpportunities: number;
  matched: number;
  highFit: number;
}

export async function scoreRadar(
  workspaceId: string,
  minScore = 0,
  limit = 50,
): Promise<RadarResult> {
  const [targeting, allOpps] = await Promise.all([
    loadWorkspaceTargeting(workspaceId),
    db.select().from(govconOpportunitiesTable).limit(200),
  ]);

  const allScored = allOpps
    .map(opp => scoreOpportunity(opp, targeting))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  const qualifying = allScored.filter(m => m.opportunityScore >= minScore);

  return {
    matches: qualifying.slice(0, limit),
    totalOpportunities: allOpps.length,
    matched: qualifying.length,
    highFit: allScored.filter(m => m.opportunityScore >= 70).length,
  };
}

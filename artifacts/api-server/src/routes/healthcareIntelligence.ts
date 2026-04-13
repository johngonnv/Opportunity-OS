/**
 * Healthcare Intelligence API
 *
 * Endpoints for CMS healthcare profiles, pain points, competitors,
 * competitor↔pain-point cross-links, opportunity scoring, and intelligence summaries.
 *
 * All routes are mounted under /organizations/:id/...
 * and require the authMiddleware (workspace-scoped).
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  organizationsTable,
  organizationHealthcareProfilesTable,
  organizationPainPointsTable,
  organizationCompetitorsTable,
  competitorPainPointLinksTable,
  workspaceMembersTable,
  contactsTable,
  activitiesTable,
  type OrganizationHealthcareProfile,
  type OrganizationPainPoint,
  type OrganizationCompetitor,
  type CompetitorPainPointLink,
  type OrganizationIntelligenceSummary,
} from "@workspace/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Typed row interfaces for raw SQL results (as any is FORBIDDEN)
// ---------------------------------------------------------------------------

interface ContactRow {
  id: string;
  title: string | null;
  department: string | null;
  stakeholder_role: string | null;
}

interface ActivityCountRow {
  contact_id: string;
  cnt: string;
}

interface WorkspaceMemberRow {
  role: string;
}

interface IntelligenceScoreRow {
  overall_score: number;
  cms_data_age_days: number | null;
  pain_points_last_reviewed_at: string | null;
  competitors_last_updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Helper: verify org belongs to workspace
// ---------------------------------------------------------------------------

async function getOrgInWorkspace(orgId: string, workspaceId: string): Promise<typeof organizationsTable.$inferSelect | null> {
  const rows = await db
    .select()
    .from(organizationsTable)
    .where(and(eq(organizationsTable.id, orgId), eq(organizationsTable.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Helper: check if caller is workspace admin or platform admin
// ---------------------------------------------------------------------------

async function isAdminCaller(
  userId: string,
  workspaceId: string,
  isPlatformAdmin: boolean,
): Promise<boolean> {
  if (isPlatformAdmin) return true;
  const rows = await db.execute<WorkspaceMemberRow>(sql`
    SELECT role FROM workspace_members
    WHERE workspace_id = ${workspaceId}
      AND user_id = ${userId}
    LIMIT 1
  `);
  const member = rows.rows[0];
  return !!member && (member.role === "OWNER" || member.role === "ADMIN");
}

// ---------------------------------------------------------------------------
// Helper: re-aggregate pain_points_caused cache on a competitor
// ---------------------------------------------------------------------------

async function refreshPainPointsCausedCache(competitorId: string): Promise<void> {
  const links = await db.execute<{ pain_point_statement: string | null }>(sql`
    SELECT pp.pain_point_statement
    FROM competitor_pain_point_links lnk
    JOIN organization_pain_points pp ON pp.id = lnk.organization_pain_point_id
    WHERE lnk.organization_competitor_id = ${competitorId}
      AND pp.is_active = true
  `);
  const statements = links.rows
    .map(r => r.pain_point_statement)
    .filter((s): s is string => s !== null && s.trim() !== "");
  await db
    .update(organizationCompetitorsTable)
    .set({ painPointsCaused: statements, updatedAt: new Date() })
    .where(eq(organizationCompetitorsTable.id, competitorId));
}

// ---------------------------------------------------------------------------
// Helper: compute opportunity score dimensions
// ---------------------------------------------------------------------------

interface ScoreDimension {
  score: number;
  weight: number;
  raw: Record<string, unknown>;
}

interface OpportunityScoreResult {
  overallScore: number;
  dimensions: Record<string, ScoreDimension>;
  freshness: {
    cmsDataAgeDays: number | null;
    painPointsLastReviewedAt: string | null;
    competitorsLastUpdatedAt: string | null;
    staleSignals: string[];
  };
  scoredAt: string;
}

async function computeOpportunityScore(
  orgId: string,
  workspaceId: string,
): Promise<OpportunityScoreResult> {
  // --- Fetch all data sources in parallel ---
  const [profileRows, painPointRows, competitorRows] = await Promise.all([
    db
      .select()
      .from(organizationHealthcareProfilesTable)
      .where(eq(organizationHealthcareProfilesTable.organizationId, orgId))
      .limit(1),
    db
      .select()
      .from(organizationPainPointsTable)
      .where(
        and(
          eq(organizationPainPointsTable.organizationId, orgId),
          eq(organizationPainPointsTable.workspaceId, workspaceId),
          eq(organizationPainPointsTable.verificationStatus, "VERIFIED"),
          eq(organizationPainPointsTable.isActive, true),
        ),
      ),
    db
      .select()
      .from(organizationCompetitorsTable)
      .where(
        and(
          eq(organizationCompetitorsTable.organizationId, orgId),
          eq(organizationCompetitorsTable.workspaceId, workspaceId),
          eq(organizationCompetitorsTable.verificationStatus, "VERIFIED"),
          eq(organizationCompetitorsTable.isActive, true),
        ),
      ),
  ]);

  const profile: OrganizationHealthcareProfile | null = profileRows[0] ?? null;

  // Contact rows with activity counts for relationship depth + buyer maturity
  const contactRows = await db.execute<ContactRow>(sql`
    SELECT c.id, c.title, c.department, c.stakeholder_role
    FROM contacts c
    WHERE c.organization_id = ${orgId}
  `);
  const contacts = contactRows.rows;

  const contactIds = contacts.map(c => c.id);
  let contactsWithActivity: Set<string> = new Set();
  if (contactIds.length > 0) {
    const actRows = await db
      .select({
        contactId: activitiesTable.contactId,
      })
      .from(activitiesTable)
      .where(
        and(
          eq(activitiesTable.organizationId, orgId),
          inArray(activitiesTable.contactId, contactIds),
        ),
      );
    contactsWithActivity = new Set(actRows.map(r => r.contactId).filter((id): id is string => id !== null));
  }

  // --- Dimension 1: CMS Operational Pressure (weight 25) ---
  let cmsPressureScore = 0;
  if (profile) {
    const components: number[] = [];
    if (profile.cmsEdBoardingTimeMinutes !== null) {
      // >60 = high pressure; normalize: 0min=0, 120min=100
      components.push(Math.min(100, (profile.cmsEdBoardingTimeMinutes / 120) * 100));
    }
    if (profile.cmsEdLwbsPercent !== null) {
      // basis points: 300=3%; normalize: 0=0, 800bps=100
      components.push(Math.min(100, (profile.cmsEdLwbsPercent / 800) * 100));
    }
    if (profile.cmsOverallStarRating !== null) {
      // Lower star rating = higher pressure; 1 star=100, 5 stars=0
      components.push(Math.max(0, ((5 - profile.cmsOverallStarRating) / 4) * 100));
    }
    if (profile.cmsPatientExperienceRating !== null) {
      components.push(Math.max(0, ((5 - profile.cmsPatientExperienceRating) / 4) * 100));
    }
    if (components.length > 0) {
      cmsPressureScore = components.reduce((a, b) => a + b, 0) / components.length;
    }
  }

  // --- Dimension 2: Pain Point Severity Aggregate (weight 25) ---
  const SEVERITY_WEIGHTS: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  let painSeverityScore = 0;
  if (painPointRows.length > 0) {
    const maxPossible = painPointRows.length * 4 * 100; // all CRITICAL at 100 confidence
    const actual = painPointRows.reduce((sum, pp) => {
      return sum + (SEVERITY_WEIGHTS[pp.severity ?? "LOW"] ?? 1) * (pp.confidenceScore ?? 50);
    }, 0);
    painSeverityScore = maxPossible > 0 ? Math.min(100, (actual / maxPossible) * 100) : 0;
  }

  // --- Dimension 3: Competitor Weakness Delta (weight 20) ---
  let competitorWeaknessScore = 0;
  if (competitorRows.length > 0) {
    let totalWeaknesses = 0;
    let totalStrengths = 0;
    for (const comp of competitorRows) {
      totalWeaknesses += ((comp.weaknesses as string[] | null) ?? []).length;
      totalStrengths += ((comp.strengths as string[] | null) ?? []).length;
    }
    competitorWeaknessScore = (totalWeaknesses / (totalWeaknesses + totalStrengths + 1)) * 100;
  }

  // --- Dimension 4: Relationship Depth (weight 15) ---
  // Count of contacts linked to this org that have at least one logged activity
  const contactsWithActCount = contactIds.filter(id => contactsWithActivity.has(id)).length;
  const relationshipDepthScore = Math.min(1, contactsWithActCount / 5) * 100;

  // --- Dimension 5: Buyer Access Maturity (weight 10) ---
  // Access count = DM-titled contacts + 1 if at least one CHAMPION contact exists
  // Bucket: 0 → 0, 1 → 40, 2 → 70, 3+ → 100
  const DECISION_MAKER_SIGNALS = ["CNO", "CFO", "CEO", "VP", "DIRECTOR", "CIO", "CMO", "ADMINISTRATOR"];
  const hasChampion = contacts.some(c => c.stakeholder_role === "CHAMPION");
  const decisionMakerCount = contacts.filter(c => {
    const titleUpper = (c.title ?? "").toUpperCase();
    return DECISION_MAKER_SIGNALS.some(signal => titleUpper.includes(signal));
  }).length;
  const accessCount = decisionMakerCount + (hasChampion ? 1 : 0);
  const dmScore =
    accessCount === 0 ? 0
    : accessCount === 1 ? 40
    : accessCount === 2 ? 70
    : 100;

  // --- Dimension 6: Bed Count / Scale (weight 10) ---
  let bedCountScore = 0;
  if (profile?.cmsBedCount !== null && profile?.cmsBedCount !== undefined && profile.cmsBedCount > 0) {
    bedCountScore = (Math.log10(profile.cmsBedCount + 1) / Math.log10(1001)) * 100;
  }

  // --- Dimension 7: Data Confidence (weight 5) ---
  const allConfidenceScores = [
    ...painPointRows.map(pp => pp.confidenceScore ?? 50),
    ...competitorRows.map(c => c.confidenceScore ?? 50),
  ];
  const dataConfidenceScore =
    allConfidenceScores.length > 0
      ? allConfidenceScores.reduce((a, b) => a + b, 0) / allConfidenceScores.length
      : 30; // neutral default

  // --- Overall weighted score ---
  const dimensions: Record<string, ScoreDimension> = {
    cmsOperationalPressure: {
      score: Math.round(cmsPressureScore),
      weight: 25,
      raw: {
        boardingTimeMinutes: profile?.cmsEdBoardingTimeMinutes ?? null,
        lwbsPercent: profile?.cmsEdLwbsPercent ?? null,
        starRating: profile?.cmsOverallStarRating ?? null,
        patientExperienceRating: profile?.cmsPatientExperienceRating ?? null,
        hasCmsData: !!profile,
      },
    },
    painPointSeverity: {
      score: Math.round(painSeverityScore),
      weight: 25,
      raw: { verifiedPainPointCount: painPointRows.length },
    },
    competitorWeaknessDelta: {
      score: Math.round(competitorWeaknessScore),
      weight: 20,
      raw: { verifiedCompetitorCount: competitorRows.length },
    },
    relationshipDepth: {
      score: Math.round(relationshipDepthScore),
      weight: 15,
      raw: {
        contactsWithActivity: contactsWithActCount,
        totalContacts: contactIds.length,
        definition: "Contacts with at least one logged activity / 5 (capped at 100)",
      },
    },
    buyerAccessMaturity: {
      score: Math.round(dmScore),
      weight: 10,
      raw: {
        decisionMakerCount,
        hasChampion,
        signals: DECISION_MAKER_SIGNALS,
      },
    },
    bedCountScale: {
      score: Math.round(bedCountScore),
      weight: 10,
      raw: { cmsBedCount: profile?.cmsBedCount ?? null },
    },
    dataConfidence: {
      score: Math.round(dataConfidenceScore),
      weight: 5,
      raw: { scoredRecords: allConfidenceScores.length, isDefault: allConfidenceScores.length === 0 },
    },
  };

  const overallScore = Math.round(
    Object.values(dimensions).reduce((sum, d) => sum + d.score * d.weight, 0) / 100,
  );

  // --- Freshness block ---
  const cmsDataAgeDays =
    profile?.cmsLastUpdatedAt
      ? Math.floor((Date.now() - new Date(profile.cmsLastUpdatedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;

  const painPointsLastReviewedRows = await db.execute<{ reviewed_at: string | null }>(sql`
    SELECT MAX(reviewed_at)::text AS reviewed_at
    FROM organization_pain_points
    WHERE organization_id = ${orgId} AND verification_status = 'VERIFIED'
  `);
  const painPointsLastReviewedAt = painPointsLastReviewedRows.rows[0]?.reviewed_at ?? null;

  const competitorsLastUpdatedRows = await db.execute<{ updated_at: string | null }>(sql`
    SELECT MAX(updated_at)::text AS updated_at
    FROM organization_competitors
    WHERE organization_id = ${orgId} AND is_active = true
  `);
  const competitorsLastUpdatedAt = competitorsLastUpdatedRows.rows[0]?.updated_at ?? null;

  const STALE_THRESHOLD_DAYS = 90;
  const staleSignals: string[] = [];
  if (cmsDataAgeDays !== null && cmsDataAgeDays > STALE_THRESHOLD_DAYS) staleSignals.push("cms_data");
  if (painPointsLastReviewedAt) {
    const age = Math.floor(
      (Date.now() - new Date(painPointsLastReviewedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (age > STALE_THRESHOLD_DAYS) staleSignals.push("pain_points");
  }
  if (competitorsLastUpdatedAt) {
    const age = Math.floor(
      (Date.now() - new Date(competitorsLastUpdatedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (age > STALE_THRESHOLD_DAYS) staleSignals.push("competitors");
  }

  return {
    overallScore,
    dimensions,
    freshness: {
      cmsDataAgeDays,
      painPointsLastReviewedAt,
      competitorsLastUpdatedAt,
      staleSignals,
    },
    scoredAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helper: compute intelligence summary (deterministic v1 rules)
// ---------------------------------------------------------------------------

async function computeIntelligenceSummary(
  org: typeof organizationsTable.$inferSelect,
  workspaceId: string,
): Promise<OrganizationIntelligenceSummary> {
  const orgId = org.id;

  // Pull verified pain points and competitors
  const [verifiedPainPoints, verifiedCompetitors, suggestedPainPoints] = await Promise.all([
    db
      .select()
      .from(organizationPainPointsTable)
      .where(
        and(
          eq(organizationPainPointsTable.organizationId, orgId),
          eq(organizationPainPointsTable.workspaceId, workspaceId),
          eq(organizationPainPointsTable.verificationStatus, "VERIFIED"),
          eq(organizationPainPointsTable.isActive, true),
        ),
      ),
    db
      .select()
      .from(organizationCompetitorsTable)
      .where(
        and(
          eq(organizationCompetitorsTable.organizationId, orgId),
          eq(organizationCompetitorsTable.workspaceId, workspaceId),
          eq(organizationCompetitorsTable.verificationStatus, "VERIFIED"),
          eq(organizationCompetitorsTable.isActive, true),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(organizationPainPointsTable)
      .where(
        and(
          eq(organizationPainPointsTable.organizationId, orgId),
          eq(organizationPainPointsTable.workspaceId, workspaceId),
          eq(organizationPainPointsTable.verificationStatus, "SUGGESTED"),
          eq(organizationPainPointsTable.isActive, false),
        ),
      ),
  ]);

  const contactRows = await db.execute<ContactRow>(sql`
    SELECT id, title, department, stakeholder_role FROM contacts WHERE organization_id = ${orgId}
  `);
  const contacts = contactRows.rows;
  const contactCount = contacts.length;

  // --- topPainPoints: up to 3 VERIFIED, sorted by severity then confidence ---
  const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedPainPoints = [...verifiedPainPoints].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity ?? "LOW"] ?? 3;
    const sb = SEVERITY_ORDER[b.severity ?? "LOW"] ?? 3;
    if (sa !== sb) return sa - sb;
    return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
  });
  const topPainPoints = sortedPainPoints.slice(0, 3).map(pp => ({
    category: pp.painPointCategory,
    statement: pp.painPointStatement,
    severity: pp.severity ?? "MEDIUM",
    confidenceScore: pp.confidenceScore ?? 50,
  }));

  // --- topCompetitors: up to 3 VERIFIED, sorted by displacement_difficulty then confidence ---
  const DISPLACEMENT_ORDER: Record<string, number> = { VERY_HIGH: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedCompetitors = [...verifiedCompetitors].sort((a, b) => {
    const da = DISPLACEMENT_ORDER[a.displacementDifficulty ?? "MEDIUM"] ?? 2;
    const db2 = DISPLACEMENT_ORDER[b.displacementDifficulty ?? "MEDIUM"] ?? 2;
    if (da !== db2) return da - db2;
    return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
  });
  const topCompetitors = sortedCompetitors.slice(0, 3).map(c => ({
    competitorName: c.competitorName,
    incumbentStatus: c.incumbentStatus,
    displacementDifficulty: c.displacementDifficulty ?? "MEDIUM",
    topWeakness: ((c.weaknesses as string[] | null) ?? [])[0] ?? null,
  }));

  // --- buyerPatterns ---
  const buyerPatterns: string[] = [];
  if (contactCount === 0) {
    buyerPatterns.push("No buyer mapping yet — primary gap");
  } else {
    const deptCounts: Record<string, number> = {};
    for (const c of contacts) {
      if (c.department) deptCounts[c.department] = (deptCounts[c.department] ?? 0) + 1;
    }
    for (const [dept, cnt] of Object.entries(deptCounts)) {
      if (cnt >= 2) buyerPatterns.push(`Strong presence in ${dept}`);
    }
    const DECISION_MAKER_SIGNALS = ["CNO", "CFO", "CEO", "VP", "DIRECTOR", "CIO", "CMO", "ADMINISTRATOR"];
    const hasDecisionMaker = contacts.some(c => {
      const t = (c.title ?? "").toUpperCase();
      return DECISION_MAKER_SIGNALS.some(s => t.includes(s));
    });
    if (hasDecisionMaker) buyerPatterns.push("Decision-maker access confirmed");
    if (buyerPatterns.length === 0) buyerPatterns.push("Contacts present but no strong patterns identified");
  }

  // --- entryStrategy (first matching rule) ---
  const confirmedIncumbent = verifiedCompetitors.find(c => c.incumbentStatus === "CONFIRMED_INCUMBENT");
  const hasVeryHighDisplacement = confirmedIncumbent?.displacementDifficulty === "VERY_HIGH";
  const critHighPainPoints = verifiedPainPoints.filter(pp =>
    pp.severity === "CRITICAL" || pp.severity === "HIGH",
  );
  const hasDmContact = contacts.some(c => {
    const t = (c.title ?? "").toUpperCase();
    return ["CNO", "CFO", "CEO", "VP", "DIRECTOR", "CIO", "CMO", "ADMINISTRATOR"].some(s => t.includes(s));
  });
  const hasCareTransitionOrPx = verifiedPainPoints.some(pp =>
    pp.painPointCategory === "CARE_TRANSITION_RISK" || pp.painPointCategory === "PATIENT_EXPERIENCE",
  );

  let entryStrategy: string;
  if (confirmedIncumbent && hasVeryHighDisplacement) {
    entryStrategy = "Displacement play — focus on incumbent weaknesses and quantified pain";
  } else if (critHighPainPoints.length >= 2 && !confirmedIncumbent) {
    entryStrategy = "Pain-led entry — lead with problem statement, avoid feature comparison";
  } else if (hasDmContact && verifiedPainPoints.length >= 1) {
    entryStrategy = "Relationship-anchored entry — activate known buyer, align to confirmed pain";
  } else if (hasCareTransitionOrPx) {
    entryStrategy = "Outcomes-led entry — anchor to CMS ratings and patient experience gaps";
  } else {
    entryStrategy = "Standard discovery entry — map stakeholders and qualify pain before positioning";
  }

  // --- primaryAction (first matching rule) ---
  const suggestedCount = Number(suggestedPainPoints[0]?.count ?? 0);
  let primaryAction: string;
  if (contactCount === 0) {
    primaryAction = "Add a contact — no buyer mapped for this account";
  } else if (suggestedCount > 0) {
    primaryAction = `Review ${suggestedCount} AI-suggested pain points awaiting approval`;
  } else if (verifiedPainPoints.length > 0 && verifiedCompetitors.length === 0) {
    primaryAction = "Map the competitive landscape for this account";
  } else if (confirmedIncumbent) {
    primaryAction = `Prepare displacement brief against ${confirmedIncumbent.competitorName}`;
  } else {
    primaryAction = "Advance the conversation — schedule next touch";
  }

  // --- impactStatement ---
  const scoreResult = await computeOpportunityScore(orgId, workspaceId);
  const categories = [...new Set(verifiedPainPoints.map(pp => pp.painPointCategory))];
  const categoryStr =
    categories.length > 0
      ? categories.join(", ")
      : "no verified categories";
  // Short label from entryStrategy (text before " —")
  const strategyLabel = entryStrategy.split(" —")[0];
  const impactStatement = `${org.name} shows ${verifiedPainPoints.length} verified pain points across ${categoryStr}. Opportunity score: ${scoreResult.overallScore}/100. Entry via ${strategyLabel}.`;

  return {
    topPainPoints,
    topCompetitors,
    buyerPatterns,
    entryStrategy,
    primaryAction,
    impactStatement,
    computedAt: new Date().toISOString(),
  };
}

// ===========================================================================
// ROUTES
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /organizations/:id/healthcare-profile
// ---------------------------------------------------------------------------
router.get("/healthcare-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const rows = await db
      .select()
      .from(organizationHealthcareProfilesTable)
      .where(eq(organizationHealthcareProfilesTable.organizationId, org.id))
      .limit(1);

    return res.json({ profile: rows[0] ?? null });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /organizations/:id/healthcare-profile  (upsert)
// ---------------------------------------------------------------------------
router.post("/healthcare-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const existing = await db
      .select({ id: organizationHealthcareProfilesTable.id })
      .from(organizationHealthcareProfilesTable)
      .where(eq(organizationHealthcareProfilesTable.organizationId, org.id))
      .limit(1);

    let profile: OrganizationHealthcareProfile;
    if (existing.length > 0) {
      const { id: _id, organizationId: _oid, workspaceId: _wid, createdAt: _ca, ...updateData } = req.body;
      const [updated] = await db
        .update(organizationHealthcareProfilesTable)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(organizationHealthcareProfilesTable.id, existing[0].id))
        .returning();
      profile = updated;
    } else {
      const { id: _id, ...insertData } = req.body;
      const [created] = await db
        .insert(organizationHealthcareProfilesTable)
        .values({
          ...insertData,
          id: crypto.randomUUID(),
          organizationId: org.id,
          workspaceId: workspace.id,
        })
        .returning();
      profile = created;
    }

    return res.status(existing.length > 0 ? 200 : 201).json({ profile });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /organizations/:id/healthcare-profile/run-suggestions
// Idempotent CMS→pain-point suggestion engine.
// Deduplicates by (organization_id, pain_point_category, linked_cms_signal_key, source_type).
// CMS signals create SUGGESTED rows only — is_active=false.
// ---------------------------------------------------------------------------
router.post("/healthcare-profile/run-suggestions", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const profileRows = await db
      .select()
      .from(organizationHealthcareProfilesTable)
      .where(eq(organizationHealthcareProfilesTable.organizationId, org.id))
      .limit(1);

    const profile = profileRows[0] ?? null;
    if (!profile) {
      return res.status(400).json({ error: "No CMS healthcare profile found for this organization. Create a profile first." });
    }

    // Rules: each produces a suggestion candidate
    interface SuggestionCandidate {
      painPointCategory: string;
      severity: string;
      linkedCmsSignalKey: string;
      painPointStatement: string;
      confidenceScore: number;
    }

    const candidates: SuggestionCandidate[] = [];

    if (profile.cmsEdBoardingTimeMinutes !== null && profile.cmsEdBoardingTimeMinutes > 60) {
      candidates.push({
        painPointCategory: "ED_BOARDING",
        severity: "HIGH",
        linkedCmsSignalKey: "cms_ed_boarding_time_minutes",
        painPointStatement: `ED boarding time of ${profile.cmsEdBoardingTimeMinutes} minutes exceeds the 60-minute threshold, indicating significant patient flow bottlenecks.`,
        confidenceScore: Math.min(90, 50 + Math.floor(profile.cmsEdBoardingTimeMinutes / 12)),
      });
    }

    if (profile.cmsEdTimeToAdmitMinutes !== null && profile.cmsEdTimeToAdmitMinutes > 120) {
      candidates.push({
        painPointCategory: "DISCHARGE_BOTTLENECK",
        severity: "MEDIUM",
        linkedCmsSignalKey: "cms_ed_time_to_admit_minutes",
        painPointStatement: `ED time-to-admit of ${profile.cmsEdTimeToAdmitMinutes} minutes suggests discharge and bed flow bottlenecks contributing to prolonged ED stays.`,
        confidenceScore: Math.min(85, 50 + Math.floor(profile.cmsEdTimeToAdmitMinutes / 30)),
      });
    }

    if (profile.cmsEdLwbsPercent !== null && profile.cmsEdLwbsPercent > 300) {
      const pct = (profile.cmsEdLwbsPercent / 100).toFixed(1);
      candidates.push({
        painPointCategory: "PATIENT_EXPERIENCE",
        severity: "MEDIUM",
        linkedCmsSignalKey: "cms_ed_lwbs_percent",
        painPointStatement: `Left-without-being-seen rate of ${pct}% (above 3% threshold) indicates patient experience and access concerns in the ED.`,
        confidenceScore: Math.min(80, 50 + Math.floor(profile.cmsEdLwbsPercent / 100)),
      });
    }

    if (profile.cmsOverallStarRating !== null && profile.cmsOverallStarRating <= 2) {
      candidates.push({
        painPointCategory: "CARE_TRANSITION_RISK",
        severity: "HIGH",
        linkedCmsSignalKey: "cms_overall_star_rating",
        painPointStatement: `CMS overall star rating of ${profile.cmsOverallStarRating}/5 indicates systemic quality concerns affecting care transitions and patient outcomes.`,
        confidenceScore: 75,
      });
    }

    if (profile.cmsPatientExperienceRating !== null && profile.cmsPatientExperienceRating <= 2) {
      candidates.push({
        painPointCategory: "PATIENT_EXPERIENCE",
        severity: "HIGH",
        linkedCmsSignalKey: "cms_patient_experience_rating",
        painPointStatement: `CMS patient experience rating of ${profile.cmsPatientExperienceRating}/5 highlights significant gaps in patient-reported care quality.`,
        confidenceScore: 75,
      });
    }

    if (profile.cmsCareTransitionRating !== null && profile.cmsCareTransitionRating <= 2) {
      candidates.push({
        painPointCategory: "CARE_TRANSITION_RISK",
        severity: "MEDIUM",
        linkedCmsSignalKey: "cms_care_transition_rating",
        painPointStatement: `CMS care transition rating of ${profile.cmsCareTransitionRating}/5 suggests opportunities in discharge planning, follow-up communication, and transition coordination.`,
        confidenceScore: 70,
      });
    }

    // Upsert each candidate by deduplication key
    const upserted: OrganizationPainPoint[] = [];
    for (const candidate of candidates) {
      const existingRows = await db.execute<{ id: string }>(sql`
        SELECT id FROM organization_pain_points
        WHERE organization_id = ${org.id}
          AND pain_point_category = ${candidate.painPointCategory}::pain_point_category
          AND linked_cms_signal_key = ${candidate.linkedCmsSignalKey}
          AND source_type = 'CMS_SIGNAL'::pain_point_source_type
        LIMIT 1
      `);

      if (existingRows.rows.length > 0) {
        // Update existing suggested row
        const [updated] = await db
          .update(organizationPainPointsTable)
          .set({
            painPointStatement: candidate.painPointStatement,
            severity: candidate.severity as OrganizationPainPoint["severity"],
            confidenceScore: candidate.confidenceScore,
            updatedAt: new Date(),
          })
          .where(eq(organizationPainPointsTable.id, existingRows.rows[0].id))
          .returning();
        upserted.push(updated);
      } else {
        // Insert new SUGGESTED row — is_active=false until admin approves
        const [created] = await db
          .insert(organizationPainPointsTable)
          .values({
            id: crypto.randomUUID(),
            organizationId: org.id,
            workspaceId: workspace.id,
            painPointCategory: candidate.painPointCategory as OrganizationPainPoint["painPointCategory"],
            severity: candidate.severity as OrganizationPainPoint["severity"],
            linkedCmsSignalKey: candidate.linkedCmsSignalKey,
            painPointStatement: candidate.painPointStatement,
            confidenceScore: candidate.confidenceScore,
            sourceType: "CMS_SIGNAL",
            evidenceType: "QUANTITATIVE",
            verificationStatus: "SUGGESTED",
            isActive: false,
          })
          .returning();
        upserted.push(created);
      }
    }

    return res.json({
      message: `Processed ${candidates.length} CMS signal rule(s). ${upserted.length} suggestion(s) created or updated.`,
      suggestions: upserted,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /organizations/:id/pain-points
// Optional: ?verified_only=true  ?include_rejected=false (default true)
// ---------------------------------------------------------------------------
router.get("/pain-points", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const verifiedOnly = req.query.verified_only === "true";
    const includeRejected = req.query.include_rejected !== "false";

    // Build compound where filter
    const baseFilter = and(
      eq(organizationPainPointsTable.organizationId, org.id),
      eq(organizationPainPointsTable.workspaceId, workspace.id),
    );

    let rows: OrganizationPainPoint[];
    if (verifiedOnly) {
      rows = await db
        .select()
        .from(organizationPainPointsTable)
        .where(and(baseFilter, eq(organizationPainPointsTable.verificationStatus, "VERIFIED")))
        .orderBy(
          sql`CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END`,
          desc(organizationPainPointsTable.confidenceScore),
        );
    } else if (!includeRejected) {
      const allRows = await db
        .select()
        .from(organizationPainPointsTable)
        .where(baseFilter)
        .orderBy(
          sql`CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END`,
          desc(organizationPainPointsTable.confidenceScore),
        );
      rows = allRows.filter(r => r.verificationStatus !== "REJECTED");
    } else {
      rows = await db
        .select()
        .from(organizationPainPointsTable)
        .where(baseFilter)
        .orderBy(
          sql`CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END`,
          desc(organizationPainPointsTable.confidenceScore),
        );
    }

    return res.json({ painPoints: rows });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /organizations/:id/pain-points  (manual create)
// ---------------------------------------------------------------------------
router.post("/pain-points", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const { id: _id, organizationId: _oid, workspaceId: _wid, createdAt: _ca, updatedAt: _ua, ...data } = req.body;

    const [created] = await db
      .insert(organizationPainPointsTable)
      .values({
        ...data,
        id: crypto.randomUUID(),
        organizationId: org.id,
        workspaceId: workspace.id,
      })
      .returning();

    return res.status(201).json(created);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /organizations/:id/pain-points/:ppId
// ---------------------------------------------------------------------------
router.patch("/pain-points/:ppId", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const { id: _id, organizationId: _oid, workspaceId: _wid, createdAt: _ca, ...data } = req.body;

    const [updated] = await db
      .update(organizationPainPointsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(organizationPainPointsTable.id, req.params.ppId),
          eq(organizationPainPointsTable.organizationId, org.id),
          eq(organizationPainPointsTable.workspaceId, workspace.id),
        ),
      )
      .returning();

    if (!updated) return res.status(404).json({ error: "Pain point not found" });
    return res.json(updated);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /organizations/:id/pain-points/:ppId/approve
// Platform admin OR workspace admin (OWNER/ADMIN role)
// ---------------------------------------------------------------------------
router.post("/pain-points/:ppId/approve", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const canApprove = await isAdminCaller(user.id, workspace.id, user.isPlatformAdmin);
    if (!canApprove) {
      return res.status(403).json({ error: "Only workspace admins or platform admins may approve pain points" });
    }

    const reviewNote: string | null = req.body?.reviewNote ?? null;
    const approvedByRole = user.isPlatformAdmin ? "platform_admin" : "workspace_admin";

    const [updated] = await db
      .update(organizationPainPointsTable)
      .set({
        verificationStatus: "VERIFIED",
        isActive: true,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
        reviewNote: reviewNote,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizationPainPointsTable.id, req.params.ppId),
          eq(organizationPainPointsTable.organizationId, org.id),
          eq(organizationPainPointsTable.workspaceId, workspace.id),
        ),
      )
      .returning();

    if (!updated) return res.status(404).json({ error: "Pain point not found" });
    return res.json({ ...updated, approvedByRole });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /organizations/:id/pain-points/:ppId/reject
// Platform admin OR workspace admin (OWNER/ADMIN role)
// ---------------------------------------------------------------------------
router.post("/pain-points/:ppId/reject", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const canReject = await isAdminCaller(user.id, workspace.id, user.isPlatformAdmin);
    if (!canReject) {
      return res.status(403).json({ error: "Only workspace admins or platform admins may reject pain points" });
    }

    const reviewNote: string | null = req.body?.reviewNote ?? null;
    const rejectedByRole = user.isPlatformAdmin ? "platform_admin" : "workspace_admin";

    const [updated] = await db
      .update(organizationPainPointsTable)
      .set({
        verificationStatus: "REJECTED",
        isActive: false,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
        reviewNote: reviewNote,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizationPainPointsTable.id, req.params.ppId),
          eq(organizationPainPointsTable.organizationId, org.id),
          eq(organizationPainPointsTable.workspaceId, workspace.id),
        ),
      )
      .returning();

    if (!updated) return res.status(404).json({ error: "Pain point not found" });
    return res.json({ ...updated, rejectedByRole });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /organizations/:id/competitors
// ---------------------------------------------------------------------------
router.get("/competitors", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const competitors = await db
      .select()
      .from(organizationCompetitorsTable)
      .where(
        and(
          eq(organizationCompetitorsTable.organizationId, org.id),
          eq(organizationCompetitorsTable.workspaceId, workspace.id),
        ),
      )
      .orderBy(desc(organizationCompetitorsTable.createdAt));

    return res.json({ competitors });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /organizations/:id/competitors
// ---------------------------------------------------------------------------
router.post("/competitors", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const { id: _id, organizationId: _oid, workspaceId: _wid, painPointsCaused: _ppc, createdAt: _ca, updatedAt: _ua, ...data } = req.body;

    const [created] = await db
      .insert(organizationCompetitorsTable)
      .values({
        ...data,
        id: crypto.randomUUID(),
        organizationId: org.id,
        workspaceId: workspace.id,
        painPointsCaused: [], // always start empty; populated via links
      })
      .returning();

    return res.status(201).json(created);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /organizations/:id/competitors/:cId
// ---------------------------------------------------------------------------
router.patch("/competitors/:cId", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    // Strip derived/audit fields from update payload
    const { id: _id, organizationId: _oid, workspaceId: _wid, painPointsCaused: _ppc, createdAt: _ca, ...data } = req.body;

    const [updated] = await db
      .update(organizationCompetitorsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(organizationCompetitorsTable.id, req.params.cId),
          eq(organizationCompetitorsTable.organizationId, org.id),
          eq(organizationCompetitorsTable.workspaceId, workspace.id),
        ),
      )
      .returning();

    if (!updated) return res.status(404).json({ error: "Competitor not found" });
    return res.json(updated);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /organizations/:id/competitors/:cId/pain-point-links
// ---------------------------------------------------------------------------
router.get("/competitors/:cId/pain-point-links", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    // Verify competitor belongs to org/workspace
    const compRows = await db
      .select({ id: organizationCompetitorsTable.id })
      .from(organizationCompetitorsTable)
      .where(
        and(
          eq(organizationCompetitorsTable.id, req.params.cId),
          eq(organizationCompetitorsTable.organizationId, org.id),
          eq(organizationCompetitorsTable.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    if (compRows.length === 0) return res.status(404).json({ error: "Competitor not found" });

    const links = await db.execute<{
      id: string;
      organization_competitor_id: string;
      organization_pain_point_id: string;
      relationship_type: string;
      confidence_score: number;
      notes: string | null;
      created_at: string;
      updated_at: string;
      pain_point_category: string;
      pain_point_statement: string | null;
      severity: string;
    }>(sql`
      SELECT
        lnk.id,
        lnk.organization_competitor_id,
        lnk.organization_pain_point_id,
        lnk.relationship_type,
        lnk.confidence_score,
        lnk.notes,
        lnk.created_at,
        lnk.updated_at,
        pp.pain_point_category,
        pp.pain_point_statement,
        pp.severity
      FROM competitor_pain_point_links lnk
      JOIN organization_pain_points pp ON pp.id = lnk.organization_pain_point_id
      WHERE lnk.organization_competitor_id = ${req.params.cId}
      ORDER BY lnk.created_at DESC
    `);

    return res.json({ links: links.rows });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /organizations/:id/competitors/:cId/pain-point-links
// Creates a cross-link. Validates both belong to same org.
// After creating, re-aggregates pain_points_caused cache on competitor.
// ---------------------------------------------------------------------------
router.post("/competitors/:cId/pain-point-links", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const { organizationPainPointId, relationshipType, confidenceScore, notes } = req.body;
    if (!organizationPainPointId) {
      return res.status(400).json({ error: "organizationPainPointId is required" });
    }

    // Verify competitor belongs to this org/workspace
    const compRows = await db
      .select({ id: organizationCompetitorsTable.id })
      .from(organizationCompetitorsTable)
      .where(
        and(
          eq(organizationCompetitorsTable.id, req.params.cId),
          eq(organizationCompetitorsTable.organizationId, org.id),
          eq(organizationCompetitorsTable.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    if (compRows.length === 0) return res.status(404).json({ error: "Competitor not found" });

    // Verify pain point belongs to same org
    const ppRows = await db
      .select({ id: organizationPainPointsTable.id })
      .from(organizationPainPointsTable)
      .where(
        and(
          eq(organizationPainPointsTable.id, organizationPainPointId),
          eq(organizationPainPointsTable.organizationId, org.id),
          eq(organizationPainPointsTable.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    if (ppRows.length === 0) {
      return res.status(400).json({ error: "Pain point not found or does not belong to this organization" });
    }

    const [link] = await db
      .insert(competitorPainPointLinksTable)
      .values({
        id: crypto.randomUUID(),
        organizationCompetitorId: req.params.cId,
        organizationPainPointId,
        relationshipType: relationshipType ?? "CAUSED_BY",
        confidenceScore: confidenceScore ?? 50,
        notes: notes ?? null,
      })
      .returning();

    // Re-aggregate derived cache
    await refreshPainPointsCausedCache(req.params.cId);

    return res.status(201).json(link);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /organizations/:id/competitors/:cId/pain-point-links/:linkId
// ---------------------------------------------------------------------------
router.delete("/competitors/:cId/pain-point-links/:linkId", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    // Verify competitor belongs to this org/workspace
    const compRows = await db
      .select({ id: organizationCompetitorsTable.id })
      .from(organizationCompetitorsTable)
      .where(
        and(
          eq(organizationCompetitorsTable.id, req.params.cId),
          eq(organizationCompetitorsTable.organizationId, org.id),
          eq(organizationCompetitorsTable.workspaceId, workspace.id),
        ),
      )
      .limit(1);
    if (compRows.length === 0) return res.status(404).json({ error: "Competitor not found" });

    const [deleted] = await db
      .delete(competitorPainPointLinksTable)
      .where(
        and(
          eq(competitorPainPointLinksTable.id, req.params.linkId),
          eq(competitorPainPointLinksTable.organizationCompetitorId, req.params.cId),
        ),
      )
      .returning();

    if (!deleted) return res.status(404).json({ error: "Link not found" });

    // Re-aggregate derived cache after deletion
    await refreshPainPointsCausedCache(req.params.cId);

    return res.json({ deleted: true });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /organizations/:id/opportunity-score
// ---------------------------------------------------------------------------
router.get("/opportunity-score", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const result = await computeOpportunityScore(org.id, workspace.id);
    return res.json(result);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /organizations/:id/compute-intelligence-summary
// Computes deterministic v1 intelligence summary and stores it on the org row.
// ---------------------------------------------------------------------------
router.post("/compute-intelligence-summary", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const summary = await computeIntelligenceSummary(org, workspace.id);

    await db
      .update(organizationsTable)
      .set({ organizationIntelligenceSummary: summary, updatedAt: new Date() })
      .where(eq(organizationsTable.id, org.id));

    return res.json({ summary });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /organizations/:id/intelligence-summary
// Returns cached summary; computes on-demand if null.
// ---------------------------------------------------------------------------
router.get("/intelligence-summary", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await getOrgInWorkspace(req.params.id, workspace.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    if (org.organizationIntelligenceSummary) {
      return res.json({ summary: org.organizationIntelligenceSummary, cached: true });
    }

    // Compute on demand and store
    const summary = await computeIntelligenceSummary(org, workspace.id);
    await db
      .update(organizationsTable)
      .set({ organizationIntelligenceSummary: summary, updatedAt: new Date() })
      .where(eq(organizationsTable.id, org.id));

    return res.json({ summary, cached: false });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

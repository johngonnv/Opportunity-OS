import { Router } from "express";
import { db } from "@workspace/db";
import {
  tasksTable,
  opportunitiesTable,
  pipelinesTable,
  pipelineStagesTable,
  workspaceIntelligenceTable,
  clientOnboardingSessionsTable,
  contactsTable,
  activitiesTable,
} from "@workspace/db";
import { eq, and, asc, count as sqlCount, sql } from "drizzle-orm";

const router = Router();

// ─── Warning → Next-Step Mapping ─────────────────────────────────────────────

interface WarningAction {
  label: string;
  nextStep: string;
  route: string;
  severity: "high" | "medium" | "low";
}

const WARNING_ACTION_MAP: Record<string, WarningAction> = {
  no_contacts: {
    label: "No Contacts Added",
    nextStep: "Add at least 3 key decision-maker contacts from your target facility list.",
    route: "/contacts",
    severity: "high",
  },
  no_activity: {
    label: "No Recent Activity",
    nextStep: "Log your first call or facility visit to activate engagement tracking.",
    route: "/contacts",
    severity: "high",
  },
  missing_buyer_roles: {
    label: "Missing Buyer Roles",
    nextStep: "Identify and map buyer roles (Case Manager, Director of Nursing) at each facility.",
    route: "/contacts",
    severity: "medium",
  },
  competitor_risk: {
    label: "Competitor Risk Detected",
    nextStep: "Document your competitive positioning and prepare objection-handling scripts.",
    route: "/organizations",
    severity: "high",
  },
  stalled_pipeline: {
    label: "Pipeline Stalled",
    nextStep: "Review deals in Discovery stage older than 14 days and schedule follow-up calls.",
    route: "/opportunities",
    severity: "medium",
  },
  low_confidence: {
    label: "Low AI Confidence",
    nextStep: "Review and validate the AI-suggested account classifications in your settings.",
    route: "/organizations",
    severity: "low",
  },
  govcon_gaps: {
    label: "GovCon Compliance Gaps",
    nextStep: "Complete your GovCon compliance checklist and verify contract vehicle eligibility.",
    route: "/organizations",
    severity: "medium",
  },
  no_pipeline: {
    label: "No Opportunities in Pipeline",
    nextStep: "Create your first opportunity from a target account to activate pipeline reporting.",
    route: "/opportunities",
    severity: "high",
  },
};

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(17, 0, 0, 0);
  return d;
}

function getPrimaryAction(appliedConfig: Record<string, unknown>): {
  title: string;
  why: string;
  expectedImpact: string;
  actionLabel: string;
  route: string;
} {
  const targetFacilities = Array.isArray(appliedConfig.targetFacilities)
    ? (appliedConfig.targetFacilities as string[])
    : [];
  const primaryFacility = targetFacilities[0] ?? "target facilities";

  return {
    title: `Book discovery calls at your top ${primaryFacility} accounts`,
    why: `${primaryFacility} accounts are your highest-probability referral sources. Early relationship-building with case managers and clinical directors shortens your sales cycle by 40%.`,
    expectedImpact: "2–4 new opportunities in first 30 days",
    actionLabel: "Add First Contact",
    route: "/contacts",
  };
}

// ─── POST /:workspaceId/day1-init ─────────────────────────────────────────────

router.post("/:workspaceId/day1-init", async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // Check idempotency marker
    const marker = await db.query.workspaceIntelligenceTable.findFirst({
      where: and(
        eq(workspaceIntelligenceTable.workspaceId, workspaceId),
        eq(workspaceIntelligenceTable.kind, "alert"),
        eq(workspaceIntelligenceTable.key, "day1_initialized")
      ),
    });

    if (marker) {
      const [allTasks, allViews, allOpps, pipelines] = await Promise.all([
        db.select({ count: sqlCount() }).from(tasksTable).where(eq(tasksTable.workspaceId, workspaceId)),
        db.select({ count: sqlCount() }).from(workspaceIntelligenceTable).where(
          and(eq(workspaceIntelligenceTable.workspaceId, workspaceId), eq(workspaceIntelligenceTable.kind, "saved_view"))
        ),
        db.select({ count: sqlCount() }).from(opportunitiesTable).where(eq(opportunitiesTable.workspaceId, workspaceId)),
        db.select({ count: sqlCount() }).from(pipelinesTable).where(eq(pipelinesTable.workspaceId, workspaceId)),
      ]);
      return res.json({
        initialized: true,
        alreadyDone: true,
        summary: {
          pipelines: Number(pipelines[0]?.count ?? 0),
          savedViews: Number(allViews[0]?.count ?? 0),
          tasks: Number(allTasks[0]?.count ?? 0),
          opportunities: Number(allOpps[0]?.count ?? 0),
          intelligenceInitialized: true,
        },
      });
    }

    // Fetch onboarding session for this workspace to get applied config
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.createdWorkspaceId, workspaceId),
    });

    const appliedConfig = (session?.appliedConfig ?? {}) as Record<string, unknown>;
    const targetFacilities = Array.isArray(appliedConfig.targetFacilities)
      ? (appliedConfig.targetFacilities as string[])
      : ["Hospital", "SNF"];

    // ── 1. Create 6 Day 1 tasks ───────────────────────────────────────────────
    const taskDefs = [
      {
        title: "Map your top 5 target facilities",
        description: "Review the AI-suggested target list and confirm your priority accounts. Update any incorrect facility types or contact information.",
        priority: "HIGH" as const,
        dueDate: daysFromNow(2),
      },
      {
        title: "Add your first contact from a target facility",
        description: `Add a decision-maker (Case Manager, Director of Nursing, or Medical Director) from your top ${targetFacilities[0] ?? "target"} account. Include email and phone.`,
        priority: "HIGH" as const,
        dueDate: daysFromNow(3),
      },
      {
        title: "Schedule 3 discovery calls this week",
        description: "Reach out to case managers or clinical directors at your top target facilities to book initial introductory calls.",
        priority: "HIGH" as const,
        dueDate: daysFromNow(4),
      },
      {
        title: "Complete your profile and territory settings",
        description: "Set your geographic territory, service radius, and notification preferences so the system can surface relevant opportunities.",
        priority: "MEDIUM" as const,
        dueDate: daysFromNow(2),
      },
      {
        title: "Review and score your AI-generated account list",
        description: "Go through each opportunity seed and qualify it: adjust scores, add notes, and flag accounts that are not relevant to your territory.",
        priority: "MEDIUM" as const,
        dueDate: daysFromNow(5),
      },
      {
        title: "Log your first real opportunity in the pipeline",
        description: "Create an opportunity with a target facility, expected close date, and value estimate. This activates your pipeline reporting and forecasting.",
        priority: "HIGH" as const,
        dueDate: daysFromNow(7),
      },
    ];

    const createdTasks = await db
      .insert(tasksTable)
      .values(taskDefs.map(t => ({ workspaceId, ...t, status: "OPEN" as const })))
      .returning();

    // ── 2. Create opportunity seed ────────────────────────────────────────────
    let opportunitiesCreated = 0;
    const pipeline = await db.query.pipelinesTable.findFirst({
      where: eq(pipelinesTable.workspaceId, workspaceId),
    });

    if (pipeline) {
      const firstStage = await db.query.pipelineStagesTable.findFirst({
        where: eq(pipelineStagesTable.pipelineId, pipeline.id),
        orderBy: [asc(pipelineStagesTable.sortOrder)],
      });

      if (firstStage) {
        const primaryFacility = targetFacilities[0] ?? "Target Facility";
        await db.insert(opportunitiesTable).values({
          workspaceId,
          pipelineId: pipeline.id,
          pipelineStageId: firstStage.id,
          title: `${primaryFacility} — Discovery`,
          description: "Starter opportunity seeded from Day 1 setup. Update with actual contact, facility details, and estimated value.",
          vertical: "HEALTHCARE",
          status: "OPEN",
          source: "day1_seed",
          stageEnteredAt: new Date(),
        });
        opportunitiesCreated = 1;
      }
    }

    // ── 3. Ensure 7 specific saved views ─────────────────────────────────────
    interface ViewDef { key: string; label: string; filters: Record<string, unknown> }
    const viewsToEnsure: ViewDef[] = [
      { key: "day1_hospitals",          label: "Hospitals",             filters: { facilityType: "Hospital" } },
      { key: "day1_snfs",               label: "SNFs",                  filters: { facilityType: "SNF" } },
      { key: "day1_event_venues",       label: "Event Venues",          filters: { facilityType: "Event Venue" } },
      { key: "high_priority_targets",   label: "High Priority Targets", filters: { priority: "high", stage: "prospecting" } },
      { key: "missing_buyer_roles",     label: "Missing Buyer Roles",   filters: { missingBuyerRoles: true } },
      { key: "govcon_ready",            label: "GovCon Ready",          filters: { govconReady: true } },
    ];

    let viewsEnsured = 0;
    for (const view of viewsToEnsure) {
      const existing = await db.query.workspaceIntelligenceTable.findFirst({
        where: and(
          eq(workspaceIntelligenceTable.workspaceId, workspaceId),
          eq(workspaceIntelligenceTable.kind, "saved_view"),
          eq(workspaceIntelligenceTable.key, view.key)
        ),
      });
      if (!existing) {
        await db.insert(workspaceIntelligenceTable).values({
          id: crypto.randomUUID(),
          workspaceId,
          kind: "saved_view",
          key: view.key,
          label: view.label,
          data: { filters: view.filters },
          source: "day1",
          isActive: true,
        });
        viewsEnsured++;
      }
    }

    // ── 4. Mark day1 initialized ──────────────────────────────────────────────
    await db.insert(workspaceIntelligenceTable).values({
      id: crypto.randomUUID(),
      workspaceId,
      kind: "alert",
      key: "day1_initialized",
      label: "Day 1 Experience Initialized",
      data: {
        initializedAt: new Date().toISOString(),
        tasksCreated: createdTasks.length,
        viewsEnsured,
        opportunitiesCreated,
      },
      source: "day1",
      isActive: true,
    });

    // ── 5. Return summary ─────────────────────────────────────────────────────
    const [allViews, allPipelines] = await Promise.all([
      db.select({ count: sqlCount() }).from(workspaceIntelligenceTable).where(
        and(eq(workspaceIntelligenceTable.workspaceId, workspaceId), eq(workspaceIntelligenceTable.kind, "saved_view"))
      ),
      db.select({ count: sqlCount() }).from(pipelinesTable).where(eq(pipelinesTable.workspaceId, workspaceId)),
    ]);

    return res.json({
      initialized: true,
      alreadyDone: false,
      summary: {
        pipelines: Number(allPipelines[0]?.count ?? 0),
        savedViews: Number(allViews[0]?.count ?? 0),
        tasks: createdTasks.length,
        opportunities: opportunitiesCreated,
        intelligenceInitialized: true,
      },
    });
  } catch (err: unknown) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /:workspaceId/day1-summary ──────────────────────────────────────────

router.get("/:workspaceId/day1-summary", async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // Fetch onboarding session
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.createdWorkspaceId, workspaceId),
    });

    const appliedConfig = (session?.appliedConfig ?? {}) as Record<string, unknown>;

    // Intelligence extraction
    const competitors = Array.isArray(appliedConfig.competitors)
      ? (appliedConfig.competitors as string[])
      : typeof appliedConfig.competitorAwareness === "string"
        ? [appliedConfig.competitorAwareness]
        : [];

    const rawPainPoints = Array.isArray(appliedConfig.painPoints)
      ? (appliedConfig.painPoints as string[])
      : [];

    const rawWarningFlags = Array.isArray(appliedConfig.warningFlags)
      ? (appliedConfig.warningFlags as Array<string | Record<string, unknown>>)
      : [];

    // Map warning flags to actions
    const warningActions = rawWarningFlags.map((flag) => {
      const key = typeof flag === "string" ? flag : String((flag as Record<string, unknown>).key ?? "");
      const mapped = WARNING_ACTION_MAP[key];
      return mapped ?? {
        label: key.replace(/_/g, " "),
        nextStep: "Review and address this risk factor in your workspace settings.",
        route: "/settings",
        severity: "medium" as const,
      };
    });

    // Always include engagement-gating warnings for empty workspace
    const [contactCount, activityCount, oppCount, taskCount] = await Promise.all([
      db.select({ count: sqlCount() }).from(contactsTable).where(eq(contactsTable.workspaceId, workspaceId)),
      db.select({ count: sqlCount() }).from(activitiesTable).where(eq(activitiesTable.workspaceId, workspaceId)),
      db.select({ count: sqlCount() }).from(opportunitiesTable).where(
        and(eq(opportunitiesTable.workspaceId, workspaceId), eq(opportunitiesTable.status, "OPEN"))
      ),
      db.select({ count: sqlCount() }).from(tasksTable).where(
        and(eq(tasksTable.workspaceId, workspaceId), eq(tasksTable.status, "COMPLETED"))
      ),
    ]);

    const contacts = Number(contactCount[0]?.count ?? 0);
    const activities = Number(activityCount[0]?.count ?? 0);
    const openOpportunities = Number(oppCount[0]?.count ?? 0);
    const completedTasks = Number(taskCount[0]?.count ?? 0);

    const systemWarnings: WarningAction[] = [];
    if (contacts === 0) systemWarnings.push(WARNING_ACTION_MAP.no_contacts);
    if (activities === 0) systemWarnings.push(WARNING_ACTION_MAP.no_activity);
    if (openOpportunities === 0) systemWarnings.push(WARNING_ACTION_MAP.no_pipeline);

    // Day 1 tasks
    const day1Tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.workspaceId, workspaceId))
      .orderBy(asc(tasksTable.dueDate))
      .limit(10);

    // Saved views
    const savedViews = await db.query.workspaceIntelligenceTable.findMany({
      where: and(
        eq(workspaceIntelligenceTable.workspaceId, workspaceId),
        eq(workspaceIntelligenceTable.kind, "saved_view")
      ),
    });

    // Total task count for engagement
    const totalTasksResult = await db.select({ count: sqlCount() })
      .from(tasksTable)
      .where(eq(tasksTable.workspaceId, workspaceId));
    const totalTasks = Number(totalTasksResult[0]?.count ?? 0);

    // Vertical / positioning
    const vertical = typeof appliedConfig.vertical === "string"
      ? appliedConfig.vertical
      : typeof (appliedConfig.vertical as Record<string, unknown> | null)?.label === "string"
        ? String((appliedConfig.vertical as Record<string, unknown>).label)
        : "Healthcare";

    const positioning = typeof appliedConfig.competitiveAdvantage === "string"
      ? appliedConfig.competitiveAdvantage
      : `Your ${vertical} CRM is pre-loaded with vertical-specific pipelines, buyer role maps, and territory intelligence. Use these to outpace competitors who rely on generic tools.`;

    return res.json({
      engagement: {
        tasksCompleted: completedTasks,
        totalTasks,
        contactsAdded: contacts,
        activitiesLogged: activities,
        opportunitiesCreated: openOpportunities,
      },
      primaryAction: getPrimaryAction(appliedConfig),
      intelligence: {
        competitors,
        painPoints: rawPainPoints,
        positioning,
      },
      warnings: [...systemWarnings, ...warningActions],
      day1Tasks,
      savedViews: savedViews.map((v: { key: string; label: string | null; data: unknown }) => ({
        key: v.key,
        label: v.label,
        filters: (v.data as Record<string, unknown>)?.filters ?? {},
      })),
    });
  } catch (err: unknown) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import {
  opportunityEmsInterfacilityProfilesTable,
  organizationEmsProfilesTable,
  opportunitiesTable,
  organizationsTable,
  pipelineStagesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

function computeDiscoveryComplete(profile: any): boolean {
  return (
    profile.currentProviderName != null &&
    profile.estimatedMonthlyTransports != null &&
    (
      profile.payerMixMedicarePercent != null ||
      profile.payerMixMedicaidPercent != null ||
      profile.payerMixPrivatePercent != null ||
      profile.payerMixOtherPercent != null
    ) &&
    profile.primaryPainPoints != null
  );
}

function computeActiveAccountEligible(profile: any): boolean {
  if (!profile.protocolGoLiveDate) return false;
  const avgOk = profile.avgQualifiedTransportsPerWeek != null && Number(profile.avgQualifiedTransportsPerWeek) >= 1;
  const thirtyDayOk = profile.qualifiedTransportsLast30Days != null && profile.qualifiedTransportsLast30Days >= 4;
  return avgOk || thirtyDayOk;
}

function getAutomationSuggestions(stageName: string | null | undefined, discoveryComplete: boolean): string[] {
  if (!stageName) return [];
  switch (stageName) {
    case "Target Identified":
      return ["Research facility transport volume and reach out to scheduling contact."];
    case "Facility Engaged":
      return ["Schedule follow-up call within 3 business days to qualify transport mix and volume."];
    case "Director Engaged":
      return ["Prepare meeting agenda and director brief before next engagement."];
    case "Discovery":
      if (!discoveryComplete) {
        return ["Complete discovery fields: current provider, monthly transport estimate, payer mix, and primary pain points."];
      }
      return ["Discovery complete — review findings with clinical team before Agreement Alignment."];
    case "Agreement Alignment":
      return ["Confirm protocol alignment and schedule agreement review with operations lead."];
    case "Go-Live":
      return ["Schedule a 2-week post go-live usage check to confirm transport activity."];
    case "Active Account":
      return ["Schedule monthly expansion review to identify growth opportunities."];
    case "Expansion":
      return ["Review account for additional service lines or territory expansion."];
    default:
      return [];
  }
}

router.get("/opportunities/:id/ems-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [opp] = await db.select({ id: opportunitiesTable.id, pipelineStageId: opportunitiesTable.pipelineStageId })
      .from(opportunitiesTable)
      .where(and(eq(opportunitiesTable.id, req.params.id), eq(opportunitiesTable.workspaceId, workspace.id)))
      .limit(1);
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });

    const [profile] = await db.select()
      .from(opportunityEmsInterfacilityProfilesTable)
      .where(eq(opportunityEmsInterfacilityProfilesTable.opportunityId, req.params.id))
      .limit(1);

    if (!profile) return res.json(null);

    const [stage] = await db.select({ name: pipelineStagesTable.name })
      .from(pipelineStagesTable)
      .where(eq(pipelineStagesTable.id, opp.pipelineStageId))
      .limit(1);

    const discoveryComplete = computeDiscoveryComplete(profile);
    const activeAccountEligible = computeActiveAccountEligible(profile);
    const stageName = stage?.name ?? null;

    res.json({
      ...profile,
      discoveryComplete,
      activeAccountEligible,
      automationSuggestions: getAutomationSuggestions(stageName, discoveryComplete),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/opportunities/:id/ems-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [opp] = await db.select({ id: opportunitiesTable.id, pipelineStageId: opportunitiesTable.pipelineStageId })
      .from(opportunitiesTable)
      .where(and(eq(opportunitiesTable.id, req.params.id), eq(opportunitiesTable.workspaceId, workspace.id)))
      .limit(1);
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });

    const existing = await db.select({ id: opportunityEmsInterfacilityProfilesTable.id })
      .from(opportunityEmsInterfacilityProfilesTable)
      .where(eq(opportunityEmsInterfacilityProfilesTable.opportunityId, req.params.id))
      .limit(1);

    let profile: any;
    if (existing.length > 0) {
      [profile] = await db.update(opportunityEmsInterfacilityProfilesTable)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(opportunityEmsInterfacilityProfilesTable.id, existing[0].id))
        .returning();
    } else {
      [profile] = await db.insert(opportunityEmsInterfacilityProfilesTable)
        .values({ ...req.body, opportunityId: req.params.id, workspaceId: workspace.id })
        .returning();
    }

    const [stage] = await db.select({ name: pipelineStagesTable.name })
      .from(pipelineStagesTable)
      .where(eq(pipelineStagesTable.id, opp.pipelineStageId))
      .limit(1);

    const discoveryComplete = computeDiscoveryComplete(profile);
    const activeAccountEligible = computeActiveAccountEligible(profile);
    const stageName = stage?.name ?? null;

    const status = existing.length > 0 ? 200 : 201;
    return res.status(status).json({
      ...profile,
      discoveryComplete,
      activeAccountEligible,
      automationSuggestions: getAutomationSuggestions(stageName, discoveryComplete),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/opportunities/:id/ems-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [opp] = await db.select({ id: opportunitiesTable.id, pipelineStageId: opportunitiesTable.pipelineStageId })
      .from(opportunitiesTable)
      .where(and(eq(opportunitiesTable.id, req.params.id), eq(opportunitiesTable.workspaceId, workspace.id)))
      .limit(1);
    if (!opp) return res.status(404).json({ error: "Opportunity not found" });

    const existing = await db.select({ id: opportunityEmsInterfacilityProfilesTable.id })
      .from(opportunityEmsInterfacilityProfilesTable)
      .where(eq(opportunityEmsInterfacilityProfilesTable.opportunityId, req.params.id))
      .limit(1);

    let profile: any;
    let status: number;
    if (existing.length === 0) {
      [profile] = await db.insert(opportunityEmsInterfacilityProfilesTable)
        .values({ ...req.body, opportunityId: req.params.id, workspaceId: workspace.id })
        .returning();
      status = 201;
    } else {
      [profile] = await db.update(opportunityEmsInterfacilityProfilesTable)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(opportunityEmsInterfacilityProfilesTable.id, existing[0].id))
        .returning();
      status = 200;
    }

    const [stage] = await db.select({ name: pipelineStagesTable.name })
      .from(pipelineStagesTable)
      .where(eq(pipelineStagesTable.id, opp.pipelineStageId))
      .limit(1);

    const discoveryComplete = computeDiscoveryComplete(profile);
    const activeAccountEligible = computeActiveAccountEligible(profile);
    const stageName = stage?.name ?? null;

    res.status(status).json({
      ...profile,
      discoveryComplete,
      activeAccountEligible,
      automationSuggestions: getAutomationSuggestions(stageName, discoveryComplete),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/organizations/:id/ems-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await db.select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, req.params.id), eq(organizationsTable.workspaceId, workspace.id)))
      .limit(1);
    if (org.length === 0) return res.status(404).json({ error: "Organization not found" });

    const [profile] = await db.select()
      .from(organizationEmsProfilesTable)
      .where(and(
        eq(organizationEmsProfilesTable.organizationId, req.params.id),
        eq(organizationEmsProfilesTable.workspaceId, workspace.id),
      ))
      .limit(1);

    res.json(profile ?? null);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/organizations/:id/ems-profile", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const org = await db.select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, req.params.id), eq(organizationsTable.workspaceId, workspace.id)))
      .limit(1);
    if (org.length === 0) return res.status(404).json({ error: "Organization not found" });

    const existing = await db.select({ id: organizationEmsProfilesTable.id })
      .from(organizationEmsProfilesTable)
      .where(and(
        eq(organizationEmsProfilesTable.organizationId, req.params.id),
        eq(organizationEmsProfilesTable.workspaceId, workspace.id),
      ))
      .limit(1);

    if (existing.length === 0) {
      const [profile] = await db.insert(organizationEmsProfilesTable)
        .values({ ...req.body, organizationId: req.params.id, workspaceId: workspace.id })
        .returning();
      return res.status(201).json(profile);
    }

    const [updated] = await db.update(organizationEmsProfilesTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(organizationEmsProfilesTable.id, existing[0].id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

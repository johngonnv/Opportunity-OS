import { Router } from "express";
import { db } from "@workspace/db";
import {
  opportunitiesTable, organizationsTable, contactsTable, pipelinesTable, pipelineStagesTable,
  activitiesTable, tasksTable, notesTable, opportunityContactsTable,
  opportunityEmsInterfacilityProfilesTable,
} from "@workspace/db";
import { eq, and, ilike, desc, sql, isNull } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    // P2.2: Added businessModel filter support (RECURRING | PROJECT_BASED | HYBRID | ONE_TIME)
    // Enables mobile UI filtering + saved views for industrial_services recurring programs vs pilots.
    const { status, pipelineId, pipelineStageId, search, emsView, businessModel, page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof eq>[] = [eq(opportunitiesTable.workspaceId, workspace.id)];
    if (status) conditions.push(eq(opportunitiesTable.status, status as any));
    if (pipelineId) conditions.push(eq(opportunitiesTable.pipelineId, pipelineId));
    if (pipelineStageId) conditions.push(eq(opportunitiesTable.pipelineStageId, pipelineStageId));
    if (search) conditions.push(ilike(opportunitiesTable.title, `%${search}%`));
    // P2.2: direct filter for business model (ties to onboarding data for industrial clients)
    if (businessModel) conditions.push(eq(opportunitiesTable.businessModel, businessModel as any));

    const emsConditions: ReturnType<typeof sql>[] = [];
    if (emsView === "inJurisdiction") {
      emsConditions.push(sql`EXISTS (
        SELECT 1 FROM opportunity_ems_interfacility_profiles ep
        WHERE ep.opportunity_id = ${opportunitiesTable.id}
          AND ep.jurisdiction_eligibility = 'Eligible'
      )`);
    } else if (emsView === "directorEngaged") {
      emsConditions.push(sql`EXISTS (
        SELECT 1 FROM pipeline_stages ps
        WHERE ps.id = ${opportunitiesTable.pipelineStageId}
          AND ps.name = 'Director Engaged'
      )`);
    } else if (emsView === "discoveryIncomplete") {
      emsConditions.push(sql`(
        EXISTS (
          SELECT 1 FROM pipeline_stages ps
          WHERE ps.id = ${opportunitiesTable.pipelineStageId}
            AND ps.name IN ('Discovery', 'Target Identified', 'Facility Engaged', 'Director Engaged')
        )
        AND NOT EXISTS (
          SELECT 1 FROM opportunity_ems_interfacility_profiles ep
          WHERE ep.opportunity_id = ${opportunitiesTable.id}
            AND ep.current_provider_name IS NOT NULL
            AND ep.estimated_monthly_transports IS NOT NULL
            AND (
              ep.payer_mix_medicare_percent IS NOT NULL OR
              ep.payer_mix_medicaid_percent IS NOT NULL OR
              ep.payer_mix_private_percent IS NOT NULL OR
              ep.payer_mix_other_percent IS NOT NULL
            )
            AND ep.primary_pain_points IS NOT NULL
        )
      )`);
    } else if (emsView === "agreementAlignment") {
      emsConditions.push(sql`EXISTS (
        SELECT 1 FROM pipeline_stages ps
        WHERE ps.id = ${opportunitiesTable.pipelineStageId}
          AND ps.name = 'Agreement Alignment'
      )`);
    } else if (emsView === "goLive") {
      emsConditions.push(sql`EXISTS (
        SELECT 1 FROM pipeline_stages ps
        WHERE ps.id = ${opportunitiesTable.pipelineStageId}
          AND ps.name = 'Go-Live'
      )`);
    } else if (emsView === "activeAccounts") {
      emsConditions.push(sql`EXISTS (
        SELECT 1 FROM pipeline_stages ps
        WHERE ps.id = ${opportunitiesTable.pipelineStageId}
          AND ps.name = 'Active Account'
      )`);
    } else if (emsView === "outOfTerritory") {
      emsConditions.push(sql`EXISTS (
        SELECT 1 FROM opportunity_ems_interfacility_profiles ep
        WHERE ep.opportunity_id = ${opportunitiesTable.id}
          AND ep.jurisdiction_eligibility = 'Out of Territory'
      )`);
    }

    const [opps, totalResult] = await Promise.all([
      db.select().from(opportunitiesTable)
        .leftJoin(organizationsTable, and(eq(opportunitiesTable.organizationId, organizationsTable.id), isNull(organizationsTable.deletedAt)))
        .leftJoin(contactsTable, and(eq(opportunitiesTable.primaryContactId, contactsTable.id), isNull(contactsTable.deletedAt)))
        .leftJoin(pipelinesTable, eq(opportunitiesTable.pipelineId, pipelinesTable.id))
        .leftJoin(pipelineStagesTable, eq(opportunitiesTable.pipelineStageId, pipelineStagesTable.id))
        .where(and(...conditions, ...emsConditions))
        .orderBy(desc(opportunitiesTable.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(opportunitiesTable).where(and(...conditions, ...emsConditions)),
    ]);

    const result = opps.map(o => ({
      ...o.opportunities,
      organization: o.organizations ? { id: o.organizations.id, name: o.organizations.name, organizationType: o.organizations.organizationType, industry: o.organizations.industry } : null,
      primaryContact: o.contacts,
      pipeline: o.pipelines ? { id: o.pipelines.id, name: o.pipelines.name, category: o.pipelines.category } : null,
      pipelineStage: o.pipeline_stages ? { id: o.pipeline_stages.id, name: o.pipeline_stages.name, stageOrder: o.pipeline_stages.stageOrder } : null,
    }));

    res.json({ opportunities: result, total: Number(totalResult[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    // P2.2: businessModel and renewalDate are now accepted (spread + new columns).
    // Creation flows (mobile, capture, plays) can pass them for model-aware opps.
    const [opp] = await db.insert(opportunitiesTable).values({ ...req.body, workspaceId: workspace.id, ownerUserId: user.id }).returning();
    res.status(201).json(opp);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [row] = await db.select().from(opportunitiesTable)
      .leftJoin(organizationsTable, and(eq(opportunitiesTable.organizationId, organizationsTable.id), isNull(organizationsTable.deletedAt)))
      .leftJoin(contactsTable, and(eq(opportunitiesTable.primaryContactId, contactsTable.id), isNull(contactsTable.deletedAt)))
      .leftJoin(pipelinesTable, eq(opportunitiesTable.pipelineId, pipelinesTable.id))
      .leftJoin(pipelineStagesTable, eq(opportunitiesTable.pipelineStageId, pipelineStagesTable.id))
      .where(and(eq(opportunitiesTable.id, req.params.id), eq(opportunitiesTable.workspaceId, workspace.id)));
    if (!row) return res.status(404).json({ error: "Not found" });

    const [activities, tasks, notes, emsProfileRows] = await Promise.all([
      db.select().from(activitiesTable).where(eq(activitiesTable.opportunityId, row.opportunities.id)).orderBy(desc(activitiesTable.occurredAt)).limit(20),
      db.select().from(tasksTable).where(eq(tasksTable.opportunityId, row.opportunities.id)).orderBy(desc(tasksTable.createdAt)).limit(20),
      db.select().from(notesTable).where(eq(notesTable.opportunityId, row.opportunities.id)).orderBy(desc(notesTable.createdAt)).limit(20),
      db.select().from(opportunityEmsInterfacilityProfilesTable).where(eq(opportunityEmsInterfacilityProfilesTable.opportunityId, row.opportunities.id)).limit(1),
    ]);

    res.json({
      ...row.opportunities,
      organization: row.organizations ? { id: row.organizations.id, name: row.organizations.name, organizationType: row.organizations.organizationType, industry: row.organizations.industry } : null,
      primaryContact: row.contacts,
      pipeline: row.pipelines ? { id: row.pipelines.id, name: row.pipelines.name, category: row.pipelines.category } : null,
      pipelineStage: row.pipeline_stages ? { id: row.pipeline_stages.id, name: row.pipeline_stages.name, stageOrder: row.pipeline_stages.stageOrder } : null,
      activities, tasks, notes,
      emsProfile: emsProfileRows[0] ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    // P2.2: supports updating businessModel / renewalDate (e.g. after pilot converts to recurring contract)
    const [opp] = await db.update(opportunitiesTable).set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(opportunitiesTable.id, req.params.id), eq(opportunitiesTable.workspaceId, workspace.id))).returning();
    if (!opp) return res.status(404).json({ error: "Not found" });
    res.json(opp);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    await db.delete(opportunitiesTable).where(and(eq(opportunitiesTable.id, req.params.id), eq(opportunitiesTable.workspaceId, workspace.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

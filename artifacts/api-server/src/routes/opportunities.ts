import { Router } from "express";
import { db } from "@workspace/db";
import {
  opportunitiesTable, organizationsTable, contactsTable, pipelinesTable, pipelineStagesTable,
  activitiesTable, tasksTable, notesTable, opportunityContactsTable
} from "@workspace/db";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { status, pipelineId, pipelineStageId, search, page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(opportunitiesTable.workspaceId, workspace.id)];
    if (status) conditions.push(eq(opportunitiesTable.status, status as any));
    if (pipelineId) conditions.push(eq(opportunitiesTable.pipelineId, pipelineId));
    if (pipelineStageId) conditions.push(eq(opportunitiesTable.pipelineStageId, pipelineStageId));
    if (search) conditions.push(ilike(opportunitiesTable.title, `%${search}%`));

    const [opps, totalResult] = await Promise.all([
      db.select().from(opportunitiesTable)
        .leftJoin(organizationsTable, eq(opportunitiesTable.organizationId, organizationsTable.id))
        .leftJoin(contactsTable, eq(opportunitiesTable.primaryContactId, contactsTable.id))
        .leftJoin(pipelinesTable, eq(opportunitiesTable.pipelineId, pipelinesTable.id))
        .leftJoin(pipelineStagesTable, eq(opportunitiesTable.pipelineStageId, pipelineStagesTable.id))
        .where(and(...conditions))
        .orderBy(desc(opportunitiesTable.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(opportunitiesTable).where(and(...conditions)),
    ]);

    const result = opps.map(o => ({
      ...o.opportunities,
      organization: o.organizations ? { id: o.organizations.id, name: o.organizations.name, organizationType: o.organizations.organizationType, industry: o.organizations.industry } : null,
      primaryContact: o.contacts,
      pipeline: o.pipelines ? { id: o.pipelines.id, name: o.pipelines.name } : null,
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
      .leftJoin(organizationsTable, eq(opportunitiesTable.organizationId, organizationsTable.id))
      .leftJoin(contactsTable, eq(opportunitiesTable.primaryContactId, contactsTable.id))
      .leftJoin(pipelinesTable, eq(opportunitiesTable.pipelineId, pipelinesTable.id))
      .leftJoin(pipelineStagesTable, eq(opportunitiesTable.pipelineStageId, pipelineStagesTable.id))
      .where(and(eq(opportunitiesTable.id, req.params.id), eq(opportunitiesTable.workspaceId, workspace.id)));
    if (!row) return res.status(404).json({ error: "Not found" });

    const [activities, tasks, notes] = await Promise.all([
      db.select().from(activitiesTable).where(eq(activitiesTable.opportunityId, row.opportunities.id)).orderBy(desc(activitiesTable.occurredAt)).limit(20),
      db.select().from(tasksTable).where(eq(tasksTable.opportunityId, row.opportunities.id)).orderBy(desc(tasksTable.createdAt)).limit(20),
      db.select().from(notesTable).where(eq(notesTable.opportunityId, row.opportunities.id)).orderBy(desc(notesTable.createdAt)).limit(20),
    ]);

    res.json({
      ...row.opportunities,
      organization: row.organizations ? { id: row.organizations.id, name: row.organizations.name, organizationType: row.organizations.organizationType, industry: row.organizations.industry } : null,
      primaryContact: row.contacts,
      pipeline: row.pipelines ? { id: row.pipelines.id, name: row.pipelines.name } : null,
      pipelineStage: row.pipeline_stages ? { id: row.pipeline_stages.id, name: row.pipeline_stages.name, stageOrder: row.pipeline_stages.stageOrder } : null,
      activities, tasks, notes,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
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

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { eq, and } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const TARGET_WORKSPACE_ID = "e7a4042c-9839-4faa-a1c2-b534f4ee89a8";
const EMS_PIPELINE_NAME = "Interfacility Transport";
const TEMPLATE_KEY = "ems_interfacility_transport_v1";

async function findWorkspace(): Promise<string> {
  const rows = await db.select({ id: schema.workspacesTable.id })
    .from(schema.workspacesTable)
    .where(eq(schema.workspacesTable.id, TARGET_WORKSPACE_ID))
    .limit(1);
  if (rows.length > 0) return rows[0].id;
  const allRows = await db.select({ id: schema.workspacesTable.id })
    .from(schema.workspacesTable)
    .limit(1);
  if (allRows.length === 0) throw new Error("No workspace found");
  console.warn(`Target workspace ${TARGET_WORKSPACE_ID} not found; falling back to first workspace`);
  return allRows[0].id;
}

const stageDefinitions = [
  { name: "Target Identified", stageOrder: 1, probabilityPercent: 5 },
  { name: "Facility Engaged", stageOrder: 2, probabilityPercent: 15 },
  { name: "Director Engaged", stageOrder: 3, probabilityPercent: 30 },
  { name: "Discovery", stageOrder: 4, probabilityPercent: 45 },
  { name: "Agreement Alignment", stageOrder: 5, probabilityPercent: 60 },
  { name: "Go-Live", stageOrder: 6, probabilityPercent: 75 },
  { name: "Active Account", stageOrder: 7, probabilityPercent: 90 },
  { name: "Expansion", stageOrder: 8, probabilityPercent: 100 },
];

const savedViews = [
  {
    name: "All Active Opportunities",
    filters: { stages: ["Target Identified", "Facility Engaged", "Director Engaged", "Discovery", "Agreement Alignment", "Go-Live", "Active Account", "Expansion"] },
  },
  {
    name: "Early Stage",
    filters: { stages: ["Target Identified", "Facility Engaged"] },
  },
  {
    name: "Mid Pipeline",
    filters: { stages: ["Director Engaged", "Discovery", "Agreement Alignment"] },
  },
  {
    name: "Near Close",
    filters: { stages: ["Go-Live"] },
  },
  {
    name: "Active Accounts",
    filters: { stages: ["Active Account"] },
  },
  {
    name: "Expansion Opportunities",
    filters: { stages: ["Expansion"] },
  },
  {
    name: "Stalled (No Activity 30 Days)",
    filters: { noActivityDays: 30, stages: ["Target Identified", "Facility Engaged", "Director Engaged", "Discovery", "Agreement Alignment"] },
  },
];

const templateConfigJson = {
  stages: stageDefinitions,
  savedViews,
  requiredFields: [
    "facility_name",
    "current_provider_name",
    "estimated_monthly_transports",
    "primary_pain_points",
  ],
  automationHints: {
    activeAccountRule: {
      description: "Active = at least 1 qualified transport request per week for 4 consecutive weeks, or 4+ qualified transports in a rolling 30-day period",
      weeklyThreshold: 1,
      consecutiveWeeks: 4,
      rollingDays: 30,
      rollingThreshold: 4,
    },
  },
};

async function main() {
  const workspaceId = await findWorkspace();
  console.log("Using workspaceId:", workspaceId);

  const existing = await db.select({ id: schema.pipelinesTable.id })
    .from(schema.pipelinesTable)
    .where(and(
      eq(schema.pipelinesTable.workspaceId, workspaceId),
      eq(schema.pipelinesTable.name, EMS_PIPELINE_NAME),
    ))
    .limit(1);

  let pipelineId: string;

  if (existing.length > 0) {
    pipelineId = existing[0].id;
    console.log("EMS pipeline already exists, id:", pipelineId);
  } else {
    const [pipeline] = await db.insert(schema.pipelinesTable)
      .values({ workspaceId, name: EMS_PIPELINE_NAME, category: "EMS" })
      .returning();
    pipelineId = pipeline.id;
    console.log("Created EMS pipeline, id:", pipelineId);
  }

  console.log("Deleting old stages for this pipeline...");
  await db.delete(schema.pipelineStagesTable)
    .where(eq(schema.pipelineStagesTable.pipelineId, pipelineId));

  for (const stage of stageDefinitions) {
    await db.insert(schema.pipelineStagesTable)
      .values({ pipelineId, ...stage });
    console.log(`  Created stage: ${stage.name} (${stage.probabilityPercent}%)`);
  }

  const existingTemplate = await db.select({ id: schema.pipelineViewTemplatesTable.id })
    .from(schema.pipelineViewTemplatesTable)
    .where(eq(schema.pipelineViewTemplatesTable.key, TEMPLATE_KEY))
    .limit(1);

  let templateId: string;

  if (existingTemplate.length > 0) {
    templateId = existingTemplate[0].id;
    console.log("Pipeline view template already exists, id:", templateId);
  } else {
    const [template] = await db.insert(schema.pipelineViewTemplatesTable)
      .values({
        key: TEMPLATE_KEY,
        name: "Interfacility Transport",
        vertical: "Healthcare",
        subVertical: "EMS",
        status: "active",
        isLocked: true,
        isClientEditable: false,
        configJson: templateConfigJson,
      })
      .returning();
    templateId = template.id;
    console.log("Created pipeline view template, id:", templateId);
  }

  const existingView = await db.select({ id: schema.workspacePipelineViewsTable.id })
    .from(schema.workspacePipelineViewsTable)
    .where(and(
      eq(schema.workspacePipelineViewsTable.templateId, templateId),
      eq(schema.workspacePipelineViewsTable.workspaceId, workspaceId),
    ))
    .limit(1);

  let workspacePipelineViewId: string;

  if (existingView.length > 0) {
    workspacePipelineViewId = existingView[0].id;
    await db.update(schema.workspacePipelineViewsTable)
      .set({ pipelineId, updatedAt: new Date() })
      .where(eq(schema.workspacePipelineViewsTable.id, workspacePipelineViewId));
    console.log("Workspace pipeline view already exists, id:", workspacePipelineViewId);
  } else {
    const [wpv] = await db.insert(schema.workspacePipelineViewsTable)
      .values({
        templateId,
        workspaceId,
        pipelineId,
        isEnabled: true,
        isDefault: true,
        sortOrder: 0,
        visibilityScope: "all",
        settingsJson: {},
      })
      .returning();
    workspacePipelineViewId = wpv.id;
    console.log("Created workspace pipeline view, id:", workspacePipelineViewId);
  }

  console.log("\n--- Seed Summary ---");
  console.log("template id:", templateId);
  console.log("workspace_pipeline_views id:", workspacePipelineViewId);
  console.log("pipeline id:", pipelineId);
  console.log("EMS seed complete.");
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

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

  const stageDefinitions = [
    { name: "Prospect / Lead", stageOrder: 1, probabilityPercent: 5 },
    { name: "Discovery", stageOrder: 2, probabilityPercent: 15 },
    { name: "Director Engaged", stageOrder: 3, probabilityPercent: 30 },
    { name: "Agreement Alignment", stageOrder: 4, probabilityPercent: 50 },
    { name: "Contract Review", stageOrder: 5, probabilityPercent: 65 },
    { name: "Pending Go-Live", stageOrder: 6, probabilityPercent: 80 },
    { name: "Active Account", stageOrder: 7, probabilityPercent: 95 },
    { name: "Closed / Won", stageOrder: 8, probabilityPercent: 100 },
  ];

  const existingStages = await db.select({ stageOrder: schema.pipelineStagesTable.stageOrder })
    .from(schema.pipelineStagesTable)
    .where(eq(schema.pipelineStagesTable.pipelineId, pipelineId));

  const existingOrders = new Set(existingStages.map(s => s.stageOrder));

  for (const stage of stageDefinitions) {
    if (!existingOrders.has(stage.stageOrder)) {
      await db.insert(schema.pipelineStagesTable)
        .values({ pipelineId, ...stage });
      console.log(`  Created stage: ${stage.name}`);
    } else {
      console.log(`  Stage already exists: ${stage.name}`);
    }
  }

  console.log("EMS seed complete.");
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

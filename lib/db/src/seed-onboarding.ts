import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { eq } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function upsertVertical(key: string, label: string, description: string, sortOrder: number) {
  const existing = await db.query.verticalsTable.findFirst({
    where: eq(schema.verticalsTable.key, key),
  });
  if (existing) {
    console.log(`  vertical '${key}' already exists, skipping`);
    return existing;
  }
  const [row] = await db.insert(schema.verticalsTable).values({
    key, label, description, sortOrder, isActive: true,
  }).returning();
  console.log(`  created vertical '${key}'`);
  return row;
}

async function upsertSubVertical(verticalId: string, key: string, label: string, description: string, sortOrder: number) {
  const existing = await db.query.subVerticalsTable.findFirst({
    where: eq(schema.subVerticalsTable.key, key),
  });
  if (existing) {
    console.log(`  sub_vertical '${key}' already exists, skipping`);
    return existing;
  }
  const [row] = await db.insert(schema.subVerticalsTable).values({
    verticalId, key, label, description, sortOrder, isActive: true,
  }).returning();
  console.log(`  created sub_vertical '${key}'`);
  return row;
}

async function upsertServiceLine(
  verticalId: string,
  subVerticalId: string | null,
  key: string,
  label: string,
  description: string,
  sortOrder: number,
  defaultPipelineTemplateKey?: string
) {
  const existing = await db.query.serviceLinesTable.findFirst({
    where: eq(schema.serviceLinesTable.key, key),
  });
  if (existing) {
    console.log(`  service_line '${key}' already exists, skipping`);
    return existing;
  }
  const [row] = await db.insert(schema.serviceLinesTable).values({
    verticalId,
    subVerticalId,
    key,
    label,
    description,
    defaultPipelineTemplateKey: defaultPipelineTemplateKey ?? null,
    sortOrder,
    isActive: true,
  }).returning();
  console.log(`  created service_line '${key}'`);
  return row;
}

async function upsertAddOnType(
  key: string,
  label: string,
  description: string,
  configSchema: Record<string, unknown>
) {
  const existing = await db.query.addOnTypesTable.findFirst({
    where: eq(schema.addOnTypesTable.key, key),
  });
  if (existing) {
    await db.update(schema.addOnTypesTable)
      .set({ description, configSchema, updatedAt: new Date() })
      .where(eq(schema.addOnTypesTable.id, existing.id));
    console.log(`  add_on_type '${key}' updated config_schema`);
    return existing;
  }
  const [row] = await db.insert(schema.addOnTypesTable).values({
    key,
    label,
    description,
    configSchema,
    isActive: true,
  }).returning();
  console.log(`  created add_on_type '${key}'`);
  return row;
}

async function main() {
  console.log("Seeding onboarding configuration tables...\n");

  console.log("Verticals:");
  const healthcareVertical = await upsertVertical(
    "healthcare",
    "Healthcare",
    "Healthcare organizations including EMS, ambulatory surgery, and health systems",
    1
  );

  const govconVertical = await upsertVertical(
    "govcon",
    "Government Contracting",
    "Government contractors providing services to federal, state, and local agencies",
    2
  );

  const generalBusinessVertical = await upsertVertical(
    "general_business",
    "General Business",
    "General business verticals and catch-all for organizations not in a specialized sector",
    99
  );

  console.log("\nSub-Verticals:");
  const emsSubVertical = await upsertSubVertical(
    healthcareVertical.id,
    "ems",
    "Emergency Medical Services",
    "EMS providers including ground ambulance, air medical, and interfacility transport",
    1
  );

  await upsertSubVertical(
    healthcareVertical.id,
    "ambulatory_surgery",
    "Ambulatory Surgery Centers",
    "Outpatient surgical facilities and surgery center management organizations",
    2
  );

  await upsertSubVertical(
    healthcareVertical.id,
    "health_system",
    "Health Systems",
    "Multi-facility hospital systems and integrated health networks",
    3
  );

  console.log("\nService Lines:");
  await upsertServiceLine(
    healthcareVertical.id,
    emsSubVertical.id,
    "bls",
    "Basic Life Support (BLS)",
    "Ground ambulance BLS transport services",
    1,
    "ems_interfacility_transport_v1"
  );

  await upsertServiceLine(
    healthcareVertical.id,
    emsSubVertical.id,
    "als",
    "Advanced Life Support (ALS)",
    "Ground ambulance ALS transport services with paramedic-level care",
    2,
    "ems_interfacility_transport_v1"
  );

  await upsertServiceLine(
    healthcareVertical.id,
    emsSubVertical.id,
    "cct",
    "Critical Care Transport (CCT)",
    "Ground or air critical care transport with advanced provider team",
    3,
    "ems_interfacility_transport_v1"
  );

  console.log("\nAdd-On Types:");
  await upsertAddOnType(
    "govcon",
    "Government Contracting",
    "Government contracting module: SAM.gov integration, contract tracking, GSA schedule support, and compliance reporting",
    {
      agencyAlignment: {
        type: "multiselect",
        label: "Target Agency Types",
        options: ["Federal", "State", "Local", "DoD", "Civilian"],
        required: false,
      },
      contractTypes: {
        type: "multiselect",
        label: "Contract Types",
        options: ["IDIQ", "GWAC", "BPA", "FFP", "T&M", "Cost-Plus"],
        required: false,
      },
      ueiRequired: {
        type: "boolean",
        label: "SAM.gov UEI required",
        default: true,
      },
      naicsCodes: {
        type: "text_array",
        label: "Primary NAICS Codes",
        required: false,
      },
      primeOrSub: {
        type: "select",
        label: "Prime or Subcontractor",
        options: ["prime", "sub", "both"],
        required: false,
      },
    }
  );

  await upsertAddOnType(
    "hipaa_compliance",
    "HIPAA Compliance",
    "HIPAA compliance tracking, BAA management, and audit log exports",
    {
      baaTracking: {
        type: "boolean",
        label: "Enable BAA tracking",
        default: true,
      },
      auditLogRetentionDays: {
        type: "integer",
        label: "Audit log retention (days)",
        default: 365,
      },
    }
  );

  console.log("\nOnboarding configuration seed complete.");
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

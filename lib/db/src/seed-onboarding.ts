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

async function upsertVertical(
  key: string,
  label: string,
  description: string,
  sortOrder: number,
  naicsCodes: string[] = [],
  pscCodes: string[] = [],
  icon?: string,
  color?: string
) {
  const existing = await db.query.verticalsTable.findFirst({
    where: eq(schema.verticalsTable.key, key),
  });
  if (existing) {
    console.log(`  vertical '${key}' already exists, skipping`);
    return existing;
  }
  const [row] = await db.insert(schema.verticalsTable).values({
    key, label, description, sortOrder, isActive: true,
    naicsCodes, pscCodes, icon, color,
  }).returning();
  console.log(`  created vertical '${key}'`);
  return row;
}

async function upsertSubVertical(
  verticalId: string,
  key: string,
  label: string,
  description: string,
  sortOrder: number,
  naicsCodes: string[] = [],
  pscCodes: string[] = [],
  icon?: string,
  color?: string
) {
  const existing = await db.query.subVerticalsTable.findFirst({
    where: eq(schema.subVerticalsTable.key, key),
  });
  if (existing) {
    console.log(`  sub_vertical '${key}' already exists, skipping`);
    return existing;
  }
  const [row] = await db.insert(schema.subVerticalsTable).values({
    verticalId, key, label, description, sortOrder, isActive: true,
    naicsCodes, pscCodes, icon, color,
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
  naicsCodes: string[] = [],
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
    naicsCodes,
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
    1,
    [], // naicsCodes
    [], // pscCodes
    "activity",
    "#10b981"
  );

  const govconVertical = await upsertVertical(
    "govcon",
    "Government Contracting",
    "Government contractors providing services to federal, state, and local agencies",
    2,
    [],
    [],
    "briefcase",
    "#6366f1"
  );

  const generalBusinessVertical = await upsertVertical(
    "general_business",
    "General Business",
    "General business verticals and catch-all for organizations not in a specialized sector",
    99,
    [],
    [],
    "briefcase",
    "#64748b"
  );

  console.log("\nSub-Verticals:");
  const emsSubVertical = await upsertSubVertical(
    healthcareVertical.id,
    "ems",
    "Emergency Medical Services",
    "EMS providers including ground ambulance, air medical, and interfacility transport",
    1,
    [],
    [],
    "truck",
    "#10b981"
  );

  await upsertSubVertical(
    healthcareVertical.id,
    "ambulatory_surgery",
    "Ambulatory Surgery Centers",
    "Outpatient surgical facilities and surgery center management organizations",
    2,
    [],
    [],
    "scissors",
    "#10b981"
  );

  await upsertSubVertical(
    healthcareVertical.id,
    "health_system",
    "Health Systems",
    "Multi-facility hospital systems and integrated health networks",
    3,
    [],
    [],
    "building",
    "#10b981"
  );

  console.log("\nService Lines:");
  await upsertServiceLine(
    healthcareVertical.id,
    emsSubVertical.id,
    "bls",
    "Basic Life Support (BLS)",
    "Ground ambulance BLS transport services",
    1,
    [],
    "ems_interfacility_transport_v1"
  );

  await upsertServiceLine(
    healthcareVertical.id,
    emsSubVertical.id,
    "als",
    "Advanced Life Support (ALS)",
    "Ground ambulance ALS transport services with paramedic-level care",
    2,
    [],
    "ems_interfacility_transport_v1"
  );

  await upsertServiceLine(
    healthcareVertical.id,
    emsSubVertical.id,
    "cct",
    "Critical Care Transport (CCT)",
    "Ground or air critical care transport with advanced provider team",
    3,
    [],
    "ems_interfacility_transport_v1"
  );

  console.log("\nIndustrial Services (Apex-style example):");
  const industrialVertical = await upsertVertical(
    "industrial_services",
    "Industrial Services",
    "Water treatment, process chemistry, environmental services, and industrial optimization",
    3,
    ["221310", "325180", "541620"], // example NAICS
    [],
    "droplet",
    "#0ea5e9"
  );

  const waterTreatmentSub = await upsertSubVertical(
    industrialVertical.id,
    "water_treatment",
    "Water Treatment & Purification",
    "Recurring programs for industrial, municipal, and high-purity water systems",
    1,
    ["221310", "333318"],
    [],
    "droplet",
    "#0ea5e9"
  );

  await upsertServiceLine(
    industrialVertical.id,
    waterTreatmentSub.id,
    "water_treatment_recurring_program",
    "Recurring Water Treatment Program",
    "Full-service recurring optimization and monitoring contracts",
    1,
    ["221310"],
    "water_treatment_recurring_v1"
  );

  await upsertServiceLine(
    industrialVertical.id,
    waterTreatmentSub.id,
    "remote_monitoring_optimization",
    "Remote Monitoring & Optimization",
    "IoT-based monitoring + optimization as a service",
    2,
    ["221310", "541620"],
    "water_treatment_recurring_v1"
  );

  await upsertServiceLine(
    industrialVertical.id,
    waterTreatmentSub.id,
    "technical_assessment_pilot",
    "Technical Assessment & Pilot",
    "Site surveys, water analysis, and proof-of-concept pilots",
    3,
    ["541620"]
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

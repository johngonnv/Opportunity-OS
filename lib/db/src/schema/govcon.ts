import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  date,
  numeric,
  unique,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { workspacesTable } from "./workspaces";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const classificationSourceEnum = pgEnum("classification_source", [
  "GROK",
  "USER",
  "IMPORT",
  "RULE",
]);

export const govconRoleTypeEnum = pgEnum("govcon_role_type", [
  "PRIME",
  "SUB",
  "BOTH",
]);

export const primeFitEnum = pgEnum("prime_sub_fit", [
  "PRIME",
  "SUB",
  "BOTH",
  "UNKNOWN",
]);

// ---------------------------------------------------------------------------
// naics_master
// Source of truth for valid 2022 NAICS codes (all levels).
// Only 6-digit codes may be assigned to organizations.
// ---------------------------------------------------------------------------

export const naicsMasterTable = pgTable("naics_master", {
  code: text("code").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  parentCode: text("parent_code"),
  level: integer("level"),
  sectorCode: text("sector_code"),
  sourceFile: text("source_file"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type NaicsMaster = typeof naicsMasterTable.$inferSelect;

// ---------------------------------------------------------------------------
// naics_keyword_map
// Maps index keywords to NAICS codes for classification.
// ---------------------------------------------------------------------------

export const naicsKeywordMapTable = pgTable("naics_keyword_map", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  keyword: text("keyword").notNull(),
  naicsCode: text("naics_code").notNull().references(() => naicsMasterTable.code, { onDelete: "cascade" }),
  weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("1.0"),
  sourceFile: text("source_file"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type NaicsKeywordMap = typeof naicsKeywordMapTable.$inferSelect;

// ---------------------------------------------------------------------------
// psc_master
// Product and Service Codes — what the government buys.
// Source: PSC April 2025 xlsx, sheet "PSC for 042025"
// ---------------------------------------------------------------------------

export const pscMasterTable = pgTable("psc_master", {
  code: text("code").primaryKey(),
  name: text("name"),
  fullDescription: text("full_description"),
  includesText: text("includes_text"),
  excludesText: text("excludes_text"),
  notesText: text("notes_text"),
  parentPscCode: text("parent_psc_code"),
  serviceOrProduct: text("service_or_product"),
  level1CategoryCode: text("level_1_category_code"),
  level1Category: text("level_1_category"),
  level2CategoryCode: text("level_2_category_code"),
  level2Category: text("level_2_category"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  sourceFile: text("source_file"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PscMaster = typeof pscMasterTable.$inferSelect;

// ---------------------------------------------------------------------------
// workspace_target_naics
// NAICS codes the workspace actively targets for GovCon pursuits.
// ---------------------------------------------------------------------------

export const workspaceTargetNaicsTable = pgTable(
  "workspace_target_naics",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
    naicsCode: text("naics_code").notNull().references(() => naicsMasterTable.code, { onDelete: "cascade" }),
    priorityWeight: integer("priority_weight").notNull().default(5),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.workspaceId, t.naicsCode)]
);

export type WorkspaceTargetNaics = typeof workspaceTargetNaicsTable.$inferSelect;

// ---------------------------------------------------------------------------
// workspace_target_psc
// PSC codes the workspace actively targets.
// ---------------------------------------------------------------------------

export const workspaceTargetPscTable = pgTable(
  "workspace_target_psc",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
    pscCode: text("psc_code").notNull().references(() => pscMasterTable.code, { onDelete: "cascade" }),
    priorityWeight: integer("priority_weight").notNull().default(5),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.workspaceId, t.pscCode)]
);

export type WorkspaceTargetPsc = typeof workspaceTargetPscTable.$inferSelect;

// ---------------------------------------------------------------------------
// workspace_govcon_profile
// One-to-one with workspace. Core GovCon activation state.
// ---------------------------------------------------------------------------

export const workspaceGovconProfileTable = pgTable("workspace_govcon_profile", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().unique().references(() => workspacesTable.id, { onDelete: "cascade" }),
  roleType: govconRoleTypeEnum("role_type").notNull().default("BOTH"),
  region: text("region"),
  teamingNotes: text("teaming_notes"),
  gagcActivatedAt: timestamp("gagc_activated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WorkspaceGovconProfile = typeof workspaceGovconProfileTable.$inferSelect;

// ---------------------------------------------------------------------------
// workspace_target_agencies
// Government agencies the workspace actively pursues.
// ---------------------------------------------------------------------------

export const workspaceTargetAgenciesTable = pgTable("workspace_target_agencies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  agencyName: text("agency_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WorkspaceTargetAgency = typeof workspaceTargetAgenciesTable.$inferSelect;

// ---------------------------------------------------------------------------
// organization_naics
// NAICS classifications for workspace organizations.
// Only 6-digit NAICS codes may be used.
// Only one primary NAICS per organization (enforced via unique partial index or app logic).
// ---------------------------------------------------------------------------

export const organizationNaicsTable = pgTable(
  "organization_naics",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    naicsCode: text("naics_code").notNull().references(() => naicsMasterTable.code, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull().default("0"),
    source: classificationSourceEnum("source").notNull().default("RULE"),
    rationale: text("rationale"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique().on(t.organizationId, t.naicsCode)]
);

export type OrganizationNaics = typeof organizationNaicsTable.$inferSelect;

// ---------------------------------------------------------------------------
// organization_psc
// PSC classifications for workspace organizations.
// Only one primary PSC per organization.
// ---------------------------------------------------------------------------

export const organizationPscTable = pgTable(
  "organization_psc",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    pscCode: text("psc_code").notNull().references(() => pscMasterTable.code, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull().default("0"),
    source: classificationSourceEnum("source").notNull().default("RULE"),
    rationale: text("rationale"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique().on(t.organizationId, t.pscCode)]
);

export type OrganizationPsc = typeof organizationPscTable.$inferSelect;

// ---------------------------------------------------------------------------
// govcon_opportunities
// GovCon radar: contract opportunities scored against workspace targets.
// ---------------------------------------------------------------------------

export const govconOpportunitiesTable = pgTable("govcon_opportunities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  naicsCode: text("naics_code"),
  pscCode: text("psc_code"),
  agency: text("agency"),
  region: text("region"),
  primeOrSubFit: primeFitEnum("prime_or_sub_fit").default("UNKNOWN"),
  summary: text("summary"),
  source: text("source"),
  solicitationNumber: text("solicitation_number"),
  estimatedValue: text("estimated_value"),
  responseDeadline: date("response_deadline"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type GovconOpportunity = typeof govconOpportunitiesTable.$inferSelect;

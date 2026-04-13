import { pgTable, text, timestamp, pgEnum, integer, doublePrecision, jsonb } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { workspacesTable } from "./workspaces";
import { verticalsTable, subVerticalsTable } from "./onboarding";

export const hierarchySourceTypeEnum = pgEnum("hierarchy_source_type", [
  "MASTER_DATABASE", "EXTERNAL_ENRICHMENT", "LLM_SYNTHESIS", "HUMAN_CONFIRMED"
]);

export const organizationTypeEnum = pgEnum("organization_type", [
  "HOSPITAL", "HEALTH_SYSTEM", "HOSPICE", "HOME_HEALTH",
  "GOVERNMENT_AGENCY", "PRIME_CONTRACTOR", "SUBCONTRACTOR",
  "CONSULTANT", "VENDOR", "OTHER"
]);

export const organizationLevelEnum = pgEnum("organization_level", [
  "enterprise", "group", "facility"
]);

export const accountStructureTypeEnum = pgEnum("account_structure_type", [
  "enterprise", "parent", "regional", "local_entity", "facility"
]);

export const orgVerticalEnum = pgEnum("org_vertical", [
  "healthcare", "govcon", "general_business", "government", "nonprofit", "vendor", "other"
]);

export const primaryDecisionLevelEnum = pgEnum("primary_decision_level", [
  "enterprise", "parent", "regional", "local"
]);

export const organizationsTable = pgTable("organizations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  parentOrganizationId: text("parent_organization_id").references((): AnyPgColumn => organizationsTable.id, { onDelete: "set null" }),
  ultimateParentOrganizationId: text("ultimate_parent_organization_id").references((): AnyPgColumn => organizationsTable.id, { onDelete: "set null" }),
  organizationLevel: organizationLevelEnum("organization_level").default("facility"),
  accountStructureType: accountStructureTypeEnum("account_structure_type"),
  vertical: orgVerticalEnum("vertical"),
  primaryDecisionLevel: primaryDecisionLevelEnum("primary_decision_level"),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  website: text("website"),
  phone: text("phone"),
  email: text("email"),
  organizationType: organizationTypeEnum("organization_type").notNull().default("OTHER"),
  industry: text("industry"),
  subIndustry: text("sub_industry"),
  subVertical: text("sub_vertical"),
  regionName: text("region_name"),
  msaStatus: text("msa_status"),
  systemPriorityTier: text("system_priority_tier"),
  expansionStrategy: text("expansion_strategy"),
  expansionMaturity: text("expansion_maturity"),
  strategicTier: text("strategic_tier"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  country: text("country"),
  notesText: text("notes_text"),
  ownerUserId: text("owner_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  outreachOwnerUserId: text("outreach_owner_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  googlePlaceId: text("google_place_id"),
  formattedAddress: text("formatted_address"),
  websiteDomain: text("website_domain"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  placeCategory: text("place_category"),
  lastEnrichedAt: timestamp("last_enriched_at"),
  enrichmentSource: text("enrichment_source"),
  masterOrganizationId: text("master_organization_id"),
  hierarchyConfidenceScore: doublePrecision("hierarchy_confidence_score"),
  hierarchyLastScannedAt: timestamp("hierarchy_last_scanned_at"),
  hierarchyLastReviewedAt: timestamp("hierarchy_last_reviewed_at"),
  hierarchySourceType: hierarchySourceTypeEnum("hierarchy_source_type"),
  suggestedParentName: text("suggested_parent_name"),
  suggestedUltimateParentName: text("suggested_ultimate_parent_name"),
  onboardingVerticalId: text("onboarding_vertical_id").references(() => verticalsTable.id, { onDelete: "set null" }),
  onboardingSubVerticalId: text("onboarding_sub_vertical_id").references(() => subVerticalsTable.id, { onDelete: "set null" }),
  // Cached intelligence summary — computed by POST /organizations/:id/compute-intelligence-summary.
  // Shape: { topPainPoints[], topCompetitors[], buyerPatterns[], entryStrategy, primaryAction, impactStatement, computedAt }
  organizationIntelligenceSummary: jsonb("organization_intelligence_summary"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const organizationEmsProfilesTable = pgTable("organization_ems_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),

  primaryTransportNeed: text("primary_transport_need"),
  incumbentProvider: text("incumbent_provider"),
  estimatedMonthlyTransports: integer("estimated_monthly_transports"),
  payerMixSummary: text("payer_mix_summary"),
  lasVegasJurisdictionEligibility: text("las_vegas_jurisdiction_eligibility"),
  dischargeWorkflowNotes: text("discharge_workflow_notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;
export type OrganizationEmsProfile = typeof organizationEmsProfilesTable.$inferSelect;

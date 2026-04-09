import { pgTable, text, timestamp, pgEnum, jsonb, doublePrecision, boolean, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { workspacesTable } from "./workspaces";

export const masterRelationshipTypeEnum = pgEnum("master_relationship_type", [
  "SUBSIDIARY", "REGIONAL", "DBA", "AFFILIATED"
]);

export const masterRelationshipReviewStatusEnum = pgEnum("master_relationship_review_status", [
  "PENDING_REVIEW", "APPROVED", "REJECTED"
]);

export const masterOrgIndustryEnum = pgEnum("master_org_industry", [
  "HEALTHCARE", "GOVCON", "GENERAL_BUSINESS"
]);

export const masterAccountStructureTypeEnum = pgEnum("master_account_structure_type", [
  "ENTERPRISE", "REGIONAL", "FACILITY", "SUB_FACILITY", "GENERAL_ORG"
]);

export const masterValidationStatusEnum = pgEnum("master_validation_status", [
  "UNVALIDATED", "PARTIALLY_VALIDATED", "VALIDATED", "REQUIRES_REVIEW"
]);

export const masterAliasTypeEnum = pgEnum("master_alias_type", [
  "DBA", "ACQUIRED_BRAND", "ABBREVIATION", "FORMER_NAME", "VARIANT"
]);

export const masterOrganizationsTable = pgTable("master_organizations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  canonicalName: text("canonical_name").notNull(),
  displayName: text("display_name"),
  normalizedName: text("normalized_name").notNull(),
  websiteDomain: text("website_domain"),
  industry: masterOrgIndustryEnum("industry"),
  subVertical: text("sub_vertical"),
  accountStructureType: masterAccountStructureTypeEnum("account_structure_type"),
  isStandalone: boolean("is_standalone").notNull().default(false),
  confidenceScore: doublePrecision("confidence_score").notNull().default(0.5),
  sourceType: text("source_type").notNull().default("MANUAL"),
  sourceConfidence: doublePrecision("source_confidence").notNull().default(1.0),
  validationStatus: masterValidationStatusEnum("validation_status").notNull().default("UNVALIDATED"),
  headquartersAddress: text("headquarters_address"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  notes: text("notes"),
  placeIds: jsonb("place_ids").$type<string[]>().default([]),
  aliases: jsonb("aliases").$type<string[]>().default([]),
  adminFlags: jsonb("admin_flags").$type<string[]>().default([]),
  structureLastScannedAt: timestamp("structure_last_scanned_at"),
  structureLastReviewedAt: timestamp("structure_last_reviewed_at"),
  sourceWorkspaceId: text("source_workspace_id").references(() => workspacesTable.id, { onDelete: "set null" }),
  sourceOrganizationId: text("source_organization_id"),
  promotedByAdminUserId: text("promoted_by_admin_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  promotedAt: timestamp("promoted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const masterOrganizationAliasesTable = pgTable("master_organization_aliases", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  masterOrganizationId: text("master_organization_id").notNull().references(() => masterOrganizationsTable.id, { onDelete: "cascade" }),
  aliasName: text("alias_name").notNull(),
  normalizedAliasName: text("normalized_alias_name").notNull(),
  aliasType: masterAliasTypeEnum("alias_type").notNull().default("VARIANT"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const masterOrganizationRelationshipsTable = pgTable("master_organization_relationships", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentMasterOrganizationId: text("parent_master_organization_id").notNull().references(() => masterOrganizationsTable.id, { onDelete: "cascade" }),
  childMasterOrganizationId: text("child_master_organization_id").notNull().references(() => masterOrganizationsTable.id, { onDelete: "cascade" }),
  relationshipType: masterRelationshipTypeEnum("relationship_type").notNull().default("SUBSIDIARY"),
  confidenceScore: doublePrecision("confidence_score").notNull().default(1.0),
  evidenceSummary: text("evidence_summary"),
  sourcePayload: jsonb("source_payload"),
  approvedByUserId: text("approved_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  reviewStatus: masterRelationshipReviewStatusEnum("review_status").notNull().default("APPROVED"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const masterOrgHealthcareOverlayTable = pgTable("master_org_healthcare_overlays", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  masterOrganizationId: text("master_organization_id").notNull().unique().references(() => masterOrganizationsTable.id, { onDelete: "cascade" }),
  facilityType: text("facility_type"),
  licensedBeds: integer("licensed_beds"),
  traumaLevel: text("trauma_level"),
  systemType: text("system_type"),
  ownershipModel: text("ownership_model"),
  careSetting: text("care_setting"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const masterOrgGovconOverlayTable = pgTable("master_org_govcon_overlays", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  masterOrganizationId: text("master_organization_id").notNull().unique().references(() => masterOrganizationsTable.id, { onDelete: "cascade" }),
  uei: text("uei"),
  cageCode: text("cage_code"),
  naicsCodes: jsonb("naics_codes").$type<string[]>().default([]),
  primeOrSub: text("prime_or_sub"),
  contractVehicles: jsonb("contract_vehicles").$type<string[]>().default([]),
  agencyAlignment: text("agency_alignment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const masterOrgAiSuggestionStatusEnum = pgEnum("master_org_ai_suggestion_status", [
  "PENDING", "APPROVED", "REJECTED"
]);

export const masterOrgAiSuggestionsTable = pgTable("master_org_ai_suggestions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  masterOrganizationId: text("master_organization_id").notNull().references(() => masterOrganizationsTable.id, { onDelete: "cascade" }),
  field: text("field").notNull(),
  currentValue: text("current_value"),
  suggestedValue: text("suggested_value").notNull(),
  rationale: text("rationale"),
  status: masterOrgAiSuggestionStatusEnum("status").notNull().default("PENDING"),
  reviewedByUserId: text("reviewed_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MasterOrganization = typeof masterOrganizationsTable.$inferSelect;
export type MasterOrganizationAlias = typeof masterOrganizationAliasesTable.$inferSelect;
export type MasterOrganizationRelationship = typeof masterOrganizationRelationshipsTable.$inferSelect;
export type MasterOrgHealthcareOverlay = typeof masterOrgHealthcareOverlayTable.$inferSelect;
export type MasterOrgGovconOverlay = typeof masterOrgGovconOverlayTable.$inferSelect;
export type MasterOrgAiSuggestion = typeof masterOrgAiSuggestionsTable.$inferSelect;

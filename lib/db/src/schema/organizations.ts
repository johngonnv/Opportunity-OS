import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { workspacesTable } from "./workspaces";

export const organizationTypeEnum = pgEnum("organization_type", [
  "HOSPITAL", "HEALTH_SYSTEM", "HOSPICE", "HOME_HEALTH",
  "GOVERNMENT_AGENCY", "PRIME_CONTRACTOR", "SUBCONTRACTOR",
  "CONSULTANT", "VENDOR", "OTHER"
]);

export const organizationLevelEnum = pgEnum("organization_level", [
  "enterprise", "group", "facility"
]);

export const accountStructureTypeEnum = pgEnum("account_structure_type", [
  "enterprise", "parent", "regional", "local_entity"
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;

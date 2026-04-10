import { pgTable, text, timestamp, pgEnum, doublePrecision, integer, unique, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { workspacesTable } from "./workspaces";
import { organizationsTable } from "./organizations";
import { contactsTable } from "./contacts";
import { pipelinesTable, pipelineStagesTable } from "./pipelines";
import { serviceLinesTable } from "./onboarding";

export const opportunityStatusEnum = pgEnum("opportunity_status", ["OPEN", "WON", "LOST", "ON_HOLD"]);
export const opportunityVerticalEnum = pgEnum("opportunity_vertical", ["HEALTHCARE", "GOVCON", "CONSULTING", "PARTNERSHIP"]);

export const opportunitiesTable = pgTable("opportunities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  pipelineId: text("pipeline_id").notNull().references(() => pipelinesTable.id, { onDelete: "cascade" }),
  pipelineStageId: text("pipeline_stage_id").notNull().references(() => pipelineStagesTable.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  primaryContactId: text("primary_contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  vertical: opportunityVerticalEnum("vertical").notNull().default("CONSULTING"),
  valueEstimate: doublePrecision("value_estimate"),
  closeDateEstimate: timestamp("close_date_estimate"),
  status: opportunityStatusEnum("status").notNull().default("OPEN"),
  score: integer("score"),
  source: text("source"),
  ownerUserId: text("owner_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  stageEnteredAt: timestamp("stage_entered_at"),
  serviceLineId: text("service_line_id").references(() => serviceLinesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const opportunityContactsTable = pgTable("opportunity_contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  opportunityId: text("opportunity_id").notNull().references(() => opportunitiesTable.id, { onDelete: "cascade" }),
  contactId: text("contact_id").notNull().references(() => contactsTable.id, { onDelete: "cascade" }),
  relationshipRole: text("relationship_role"),
}, (t) => [unique().on(t.opportunityId, t.contactId)]);

export const opportunityEmsInterfacilityProfilesTable = pgTable("opportunity_ems_interfacility_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  opportunityId: text("opportunity_id").notNull().references(() => opportunitiesTable.id, { onDelete: "cascade" }),

  serviceMixBls: boolean("service_mix_bls").notNull().default(false),
  serviceMixAls: boolean("service_mix_als").notNull().default(false),
  serviceMixCct: boolean("service_mix_cct").notNull().default(false),

  currentProviderName: text("current_provider_name"),
  estimatedMonthlyTransports: integer("estimated_monthly_transports"),

  payerMixMedicarePercent: integer("payer_mix_medicare_percent"),
  payerMixMedicaidPercent: integer("payer_mix_medicaid_percent"),
  payerMixPrivatePercent: integer("payer_mix_private_percent"),
  payerMixOtherPercent: integer("payer_mix_other_percent"),

  primaryPainPoints: text("primary_pain_points"),

  agreementStatus: text("agreement_status"),
  protocolGoLiveDate: timestamp("protocol_go_live_date"),

  activeConsistencyStartDate: timestamp("active_consistency_start_date"),
  activeLastQualifiedTransportAt: timestamp("active_last_qualified_transport_at"),
  qualifiedTransportsLast30Days: integer("qualified_transports_last_30_days"),
  avgQualifiedTransportsPerWeek: numeric("avg_qualified_transports_per_week"),

  jurisdictionEligibility: text("jurisdiction_eligibility"),
  jurisdictionNotes: text("jurisdiction_notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.opportunityId)]);

export const insertOpportunitySchema = createInsertSchema(opportunitiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type Opportunity = typeof opportunitiesTable.$inferSelect;
export type OpportunityContact = typeof opportunityContactsTable.$inferSelect;
export type OpportunityEmsInterfacilityProfile = typeof opportunityEmsInterfacilityProfilesTable.$inferSelect;

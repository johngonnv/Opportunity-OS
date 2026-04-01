import { pgTable, text, timestamp, pgEnum, doublePrecision, integer, unique, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { workspacesTable } from "./workspaces";
import { organizationsTable } from "./organizations";
import { contactsTable } from "./contacts";
import { pipelinesTable, pipelineStagesTable } from "./pipelines";

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
  opportunityId: text("opportunity_id").notNull().references(() => opportunitiesTable.id, { onDelete: "cascade" }),

  jurisdictionName: text("jurisdiction_name"),
  isInJurisdiction: boolean("is_in_jurisdiction").default(false),
  jurisdictionNotes: text("jurisdiction_notes"),

  directorEngaged: boolean("director_engaged").default(false),
  directorName: text("director_name"),
  directorContactDate: timestamp("director_contact_date"),

  hasAls: boolean("has_als").default(false),
  hasBls: boolean("has_bls").default(false),
  hasCriticalCare: boolean("has_critical_care").default(false),
  hasSct: boolean("has_sct").default(false),
  hasNeonatal: boolean("has_neonatal").default(false),
  hasPediatric: boolean("has_pediatric").default(false),
  hasBariatric: boolean("has_bariatric").default(false),

  monthlyTransportVolume: integer("monthly_transport_volume"),
  avgTransportMiles: doublePrecision("avg_transport_miles"),
  primarySendingFacility: text("primary_sending_facility"),
  primaryReceivingFacility: text("primary_receiving_facility"),

  payerMixMedicarePercent: doublePrecision("payer_mix_medicare_percent"),
  payerMixMedicaidPercent: doublePrecision("payer_mix_medicaid_percent"),
  payerMixPrivatePercent: doublePrecision("payer_mix_private_percent"),
  payerMixSelfPayPercent: doublePrecision("payer_mix_self_pay_percent"),

  agreementStatus: text("agreement_status"),
  agreementStartDate: timestamp("agreement_start_date"),
  agreementEndDate: timestamp("agreement_end_date"),
  rateSchedule: text("rate_schedule"),

  discoveryCompletedAt: timestamp("discovery_completed_at"),
  goLivePlannedDate: timestamp("go_live_planned_date"),
  goLiveActualDate: timestamp("go_live_actual_date"),

  internalNotes: text("internal_notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const organizationEmsProfilesTable = pgTable("organization_ems_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),

  emsType: text("ems_type"),
  licenseNumber: text("license_number"),
  licenseExpiresAt: timestamp("license_expires_at"),
  primaryJurisdiction: text("primary_jurisdiction"),
  serviceAreaNotes: text("service_area_notes"),
  fleetSize: integer("fleet_size"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOpportunitySchema = createInsertSchema(opportunitiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type Opportunity = typeof opportunitiesTable.$inferSelect;
export type OpportunityContact = typeof opportunityContactsTable.$inferSelect;
export type OpportunityEmsInterfacilityProfile = typeof opportunityEmsInterfacilityProfilesTable.$inferSelect;
export type OrganizationEmsProfile = typeof organizationEmsProfilesTable.$inferSelect;

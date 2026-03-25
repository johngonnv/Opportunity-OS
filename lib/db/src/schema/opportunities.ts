import { pgTable, text, timestamp, pgEnum, doublePrecision, integer, unique } from "drizzle-orm/pg-core";
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

export const insertOpportunitySchema = createInsertSchema(opportunitiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type Opportunity = typeof opportunitiesTable.$inferSelect;
export type OpportunityContact = typeof opportunityContactsTable.$inferSelect;

import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { workspacesTable } from "./workspaces";
import { contactsTable } from "./contacts";
import { organizationsTable } from "./organizations";

export const activityTypeEnum = pgEnum("activity_type", [
  "CALL", "EMAIL", "MEETING", "CARD_SCAN", "NOTE", "FOLLOW_UP", "EVENT", "INTRO",
  "LOGO_SCAN", "ORG_ENRICHMENT"
]);

export const activitiesTable = pgTable("activities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  contactId: text("contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  opportunityId: text("opportunity_id"),
  type: activityTypeEnum("type").notNull(),
  subject: text("subject").notNull(),
  description: text("description"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  createdByUserId: text("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activitiesTable).omit({ id: true, createdAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;

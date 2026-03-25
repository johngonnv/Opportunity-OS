import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { workspacesTable } from "./workspaces";
import { contactsTable } from "./contacts";
import { organizationsTable } from "./organizations";

export const taskPriorityEnum = pgEnum("task_priority", ["LOW", "MEDIUM", "HIGH"]);
export const taskStatusEnum = pgEnum("task_status", ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELED"]);

export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  contactId: text("contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  opportunityId: text("opportunity_id"),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  priority: taskPriorityEnum("priority").notNull().default("MEDIUM"),
  status: taskStatusEnum("status").notNull().default("OPEN"),
  assignedToUserId: text("assigned_to_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdByUserId: text("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;

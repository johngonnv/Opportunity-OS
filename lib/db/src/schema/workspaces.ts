import { pgTable, text, timestamp, pgEnum, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const workspaceRoleEnum = pgEnum("workspace_role", ["OWNER", "ADMIN", "MANAGER", "MEMBER"]);

export const workspacesTable = pgTable("workspaces", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  industryFocus: text("industry_focus"),
  ownerUserId: text("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const workspaceMembersTable = pgTable("workspace_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: workspaceRoleEnum("role").notNull().default("MEMBER"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workspaceAdminAuditLogTable = pgTable("workspace_admin_audit_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  changedByUserId: text("changed_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  platformSupportAction: boolean("platform_support_action").notNull().default(false),
  notes: text("notes"),
});

export const insertWorkspaceSchema = createInsertSchema(workspacesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspacesTable.$inferSelect;
export type WorkspaceMember = typeof workspaceMembersTable.$inferSelect;
export type WorkspaceAdminAuditLog = typeof workspaceAdminAuditLogTable.$inferSelect;

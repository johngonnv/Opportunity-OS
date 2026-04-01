import { pgTable, text, timestamp, integer, unique, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";
import { usersTable } from "./users";

export const pipelinesTable = pgTable("pipelines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pipelineStagesTable = pgTable("pipeline_stages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pipelineId: text("pipeline_id").notNull().references(() => pipelinesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  stageOrder: integer("stage_order").notNull(),
  probabilityPercent: integer("probability_percent").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique().on(t.pipelineId, t.stageOrder)]);

export const pipelineViewTemplateStatusEnum = pgEnum("pipeline_view_template_status", [
  "draft",
  "active",
  "inactive",
  "archived",
]);

export const pipelineViewTemplatesTable = pgTable("pipeline_view_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  vertical: text("vertical").notNull(),
  subVertical: text("sub_vertical"),
  status: pipelineViewTemplateStatusEnum("status").notNull().default("draft"),
  isLocked: boolean("is_locked").notNull().default(false),
  isClientEditable: boolean("is_client_editable").notNull().default(true),
  configJson: jsonb("config_json").notNull().default({}),
  createdByUserId: text("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  updatedByUserId: text("updated_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const workspacePipelineViewsTable = pgTable("workspace_pipeline_views", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  templateId: text("template_id").notNull().references(() => pipelineViewTemplatesTable.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  pipelineId: text("pipeline_id").references(() => pipelinesTable.id, { onDelete: "set null" }),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  visibilityScope: text("visibility_scope").notNull().default("all"),
  settingsJson: jsonb("settings_json").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.templateId, t.workspaceId)]);

export const workspacePipelineViewPermissionsTable = pgTable("workspace_pipeline_view_permissions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspacePipelineViewId: text("workspace_pipeline_view_id").notNull().references(() => workspacePipelineViewsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role"),
  permission: text("permission").notNull().default("view"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPipelineSchema = createInsertSchema(pipelinesTable).omit({ id: true, createdAt: true });
export const insertPipelineStageSchema = createInsertSchema(pipelineStagesTable).omit({ id: true, createdAt: true });
export type InsertPipeline = z.infer<typeof insertPipelineSchema>;
export type Pipeline = typeof pipelinesTable.$inferSelect;
export type PipelineStage = typeof pipelineStagesTable.$inferSelect;
export type PipelineViewTemplate = typeof pipelineViewTemplatesTable.$inferSelect;
export type WorkspacePipelineView = typeof workspacePipelineViewsTable.$inferSelect;
export type WorkspacePipelineViewPermission = typeof workspacePipelineViewPermissionsTable.$inferSelect;

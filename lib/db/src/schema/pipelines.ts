import { pgTable, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";

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

export const insertPipelineSchema = createInsertSchema(pipelinesTable).omit({ id: true, createdAt: true });
export const insertPipelineStageSchema = createInsertSchema(pipelineStagesTable).omit({ id: true, createdAt: true });
export type InsertPipeline = z.infer<typeof insertPipelineSchema>;
export type Pipeline = typeof pipelinesTable.$inferSelect;
export type PipelineStage = typeof pipelineStagesTable.$inferSelect;

import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const bulkImportSessionsTable = pgTable("bulk_import_sessions", {
  sessionToken: text("session_token").primaryKey(),
  workspaceId:  text("workspace_id"),
  importType:   text("import_type").notNull(),
  rows:         jsonb("rows").notNull(),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  expiresAt:    timestamp("expires_at").notNull(),
});

export type BulkImportSession = typeof bulkImportSessionsTable.$inferSelect;

import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workspacesTable } from "./workspaces";
import { contactsTable } from "./contacts";
import { organizationsTable } from "./organizations";

export const tagsTable = pgTable("tags", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
  category: text("category"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique().on(t.workspaceId, t.name)]);

export const contactTagsTable = pgTable("contact_tags", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  contactId: text("contact_id").notNull().references(() => contactsTable.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().references(() => tagsTable.id, { onDelete: "cascade" }),
}, (t) => [unique().on(t.contactId, t.tagId)]);

export const organizationTagsTable = pgTable("organization_tags", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().references(() => tagsTable.id, { onDelete: "cascade" }),
}, (t) => [unique().on(t.organizationId, t.tagId)]);

export const insertTagSchema = createInsertSchema(tagsTable).omit({ id: true, createdAt: true });
export type InsertTag = z.infer<typeof insertTagSchema>;
export type Tag = typeof tagsTable.$inferSelect;
export type ContactTag = typeof contactTagsTable.$inferSelect;
export type OrganizationTag = typeof organizationTagsTable.$inferSelect;

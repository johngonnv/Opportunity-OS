import { pgTable, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { workspacesTable } from "./workspaces";
import { contactsTable } from "./contacts";
import { organizationsTable } from "./organizations";

export const cardProcessingStatusEnum = pgEnum("card_processing_status", ["UPLOADED", "PARSING", "PARSED", "FAILED"]);
export const cardReviewStatusEnum = pgEnum("card_review_status", ["PENDING_REVIEW", "APPROVED", "REJECTED", "MERGED"]);

export const businessCardsTable = pgTable("business_cards", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  uploadedByUserId: text("uploaded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  imageUrlFront: text("image_url_front").notNull(),
  imageUrlBack: text("image_url_back"),
  rawOcrText: text("raw_ocr_text"),
  parsedJson: jsonb("parsed_json"),
  processingStatus: cardProcessingStatusEnum("processing_status").notNull().default("UPLOADED"),
  reviewStatus: cardReviewStatusEnum("review_status").notNull().default("PENDING_REVIEW"),
  linkedContactId: text("linked_contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  linkedOrganizationId: text("linked_organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBusinessCardSchema = createInsertSchema(businessCardsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBusinessCard = z.infer<typeof insertBusinessCardSchema>;
export type BusinessCard = typeof businessCardsTable.$inferSelect;

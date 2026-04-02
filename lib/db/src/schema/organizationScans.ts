import { pgTable, text, timestamp, pgEnum, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { workspacesTable } from "./workspaces";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";

export const orgScanProcessingStatusEnum = pgEnum("org_scan_processing_status", [
  "UPLOADED", "PARSING", "PARSED", "MATCHED", "FAILED"
]);

export const orgScanReviewStatusEnum = pgEnum("org_scan_review_status", [
  "PENDING_REVIEW", "APPROVED", "REJECTED"
]);

export const organizationScansTable = pgTable("organization_scans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  uploadedByUserId: text("uploaded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  imageUrl: text("image_url").notNull(),
  rawOcrText: text("raw_ocr_text"),
  parsedBusinessName: text("parsed_business_name"),
  confidenceScore: doublePrecision("confidence_score"),
  matchedPlaceJson: jsonb("matched_place_json"),
  selectedMatchJson: jsonb("selected_match_json"),
  processingStatus: orgScanProcessingStatusEnum("processing_status").notNull().default("UPLOADED"),
  reviewStatus: orgScanReviewStatusEnum("review_status").notNull().default("PENDING_REVIEW"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type OrganizationScan = typeof organizationScansTable.$inferSelect;

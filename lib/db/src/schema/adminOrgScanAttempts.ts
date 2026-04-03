import { pgTable, text, timestamp, pgEnum, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { masterOrganizationsTable } from "./masterOrganizations";

export const adminOrgScanProcessingStatusEnum = pgEnum("admin_org_scan_processing_status", [
  "UPLOADED", "PARSING", "PARSED", "MATCHED", "FAILED"
]);

export const adminOrgScanReviewStatusEnum = pgEnum("admin_org_scan_review_status", [
  "PENDING_REVIEW", "APPROVED", "REJECTED"
]);

export const adminOrgScanAttemptsTable = pgTable("admin_org_scan_attempts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  uploadedByAdminId: text("uploaded_by_admin_id").references(() => usersTable.id, { onDelete: "set null" }),
  imageUrl: text("image_url").notNull(),
  rawOcrText: text("raw_ocr_text"),
  parsedBusinessName: text("parsed_business_name"),
  confidenceScore: doublePrecision("confidence_score"),
  matchedPlaceJson: jsonb("matched_place_json"),
  selectedMatchJson: jsonb("selected_match_json"),
  processingStatus: adminOrgScanProcessingStatusEnum("processing_status").notNull().default("UPLOADED"),
  reviewStatus: adminOrgScanReviewStatusEnum("review_status").notNull().default("PENDING_REVIEW"),
  createdMasterOrgId: text("created_master_org_id").references(() => masterOrganizationsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AdminOrgScanAttempt = typeof adminOrgScanAttemptsTable.$inferSelect;

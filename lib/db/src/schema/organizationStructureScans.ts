import { pgTable, text, timestamp, pgEnum, jsonb, doublePrecision, boolean } from "drizzle-orm/pg-core";
import { workspacesTable } from "./workspaces";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";
import { masterOrganizationsTable } from "./masterOrganizations";

export const structureScanStatusEnum = pgEnum("structure_scan_status", [
  "PENDING", "MASTER_MATCHED", "EXTERNAL_SEARCHED", "LLM_REVIEWED", "COMPLETED", "FAILED"
]);

export const structureReviewStatusEnum = pgEnum("structure_review_status", [
  "PENDING_REVIEW", "APPROVED", "REJECTED"
]);

export const organizationStructureScansTable = pgTable("organization_structure_scans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  initiatedByUserId: text("initiated_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  scanStatus: structureScanStatusEnum("scan_status").notNull().default("PENDING"),
  reviewStatus: structureReviewStatusEnum("review_status").notNull().default("PENDING_REVIEW"),
  suggestedParentMasterOrganizationId: text("suggested_parent_master_organization_id").references(() => masterOrganizationsTable.id, { onDelete: "set null" }),
  suggestedParentName: text("suggested_parent_name"),
  suggestedUltimateParentName: text("suggested_ultimate_parent_name"),
  suggestedStructureType: text("suggested_structure_type"),
  confidenceScore: doublePrecision("confidence_score"),
  evidenceSummary: text("evidence_summary"),
  externalSourcePayload: jsonb("external_source_payload"),
  llmReasoningSummary: text("llm_reasoning_summary"),
  addToMasterGraph: boolean("add_to_master_graph").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type OrganizationStructureScan = typeof organizationStructureScansTable.$inferSelect;

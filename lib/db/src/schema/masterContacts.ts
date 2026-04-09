import { pgTable, text, timestamp, pgEnum, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { masterOrganizationsTable } from "./masterOrganizations";
import { workspacesTable } from "./workspaces";
import { usersTable } from "./users";

export const masterContactRoleEnum = pgEnum("master_contact_role", [
  "DECISION_MAKER", "INFLUENCER", "CHAMPION", "BLOCKER", "OTHER"
]);

export const masterContactInfluenceEnum = pgEnum("master_contact_influence", [
  "LOW", "MEDIUM", "HIGH"
]);

export const masterContactValidationStatusEnum = pgEnum("master_contact_validation_status", [
  "UNVALIDATED", "VALIDATED", "REQUIRES_REVIEW"
]);

export const masterContactsTable = pgTable("master_contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  masterOrganizationId: text("master_organization_id").notNull().references(() => masterOrganizationsTable.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  title: text("title"),
  department: text("department"),
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  linkedinUrl: text("linkedin_url"),
  stakeholderRole: masterContactRoleEnum("stakeholder_role"),
  influenceLevel: masterContactInfluenceEnum("influence_level"),
  confidenceScore: doublePrecision("confidence_score").notNull().default(0.5),
  validationStatus: masterContactValidationStatusEnum("validation_status").notNull().default("UNVALIDATED"),
  notes: text("notes"),
  sourceWorkspaceId: text("source_workspace_id").references(() => workspacesTable.id, { onDelete: "set null" }),
  sourceContactId: text("source_contact_id"),
  promotedByAdminUserId: text("promoted_by_admin_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  promotedAt: timestamp("promoted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const promotionEntityTypeEnum = pgEnum("promotion_entity_type", [
  "ORG", "CONTACT", "NOTE"
]);

export const promotionChangeTypeEnum = pgEnum("promotion_change_type", [
  "CREATED", "UPDATED", "NOTE_ADDED"
]);

export const promotionStatusEnum = pgEnum("promotion_status", [
  "PENDING", "APPROVED_NEW", "APPROVED_MERGE", "APPROVED_LINK", "REJECTED"
]);

export const masterPromotionQueueTable = pgTable("master_promotion_queue", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityType: promotionEntityTypeEnum("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  changeType: promotionChangeTypeEnum("change_type").notNull(),
  status: promotionStatusEnum("status").notNull().default("PENDING"),
  resolvedMasterId: text("resolved_master_id"),
  rejectionReason: text("rejection_reason"),
  sourceSnapshot: jsonb("source_snapshot").$type<Record<string, unknown>>(),
  resolvedByUserId: text("resolved_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MasterContact = typeof masterContactsTable.$inferSelect;
export type MasterPromotionQueueItem = typeof masterPromotionQueueTable.$inferSelect;

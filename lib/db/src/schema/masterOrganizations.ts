import { pgTable, text, timestamp, pgEnum, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const masterRelationshipTypeEnum = pgEnum("master_relationship_type", [
  "SUBSIDIARY", "REGIONAL", "DBA", "AFFILIATED"
]);

export const masterRelationshipReviewStatusEnum = pgEnum("master_relationship_review_status", [
  "PENDING_REVIEW", "APPROVED", "REJECTED"
]);

export const masterOrganizationsTable = pgTable("master_organizations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  canonicalName: text("canonical_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  websiteDomain: text("website_domain"),
  sourceType: text("source_type").notNull().default("MANUAL"),
  sourceConfidence: doublePrecision("source_confidence").notNull().default(1.0),
  placeIds: jsonb("place_ids").$type<string[]>().default([]),
  aliases: jsonb("aliases").$type<string[]>().default([]),
  headquartersAddress: text("headquarters_address"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const masterOrganizationRelationshipsTable = pgTable("master_organization_relationships", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentMasterOrganizationId: text("parent_master_organization_id").notNull().references(() => masterOrganizationsTable.id, { onDelete: "cascade" }),
  childMasterOrganizationId: text("child_master_organization_id").notNull().references(() => masterOrganizationsTable.id, { onDelete: "cascade" }),
  relationshipType: masterRelationshipTypeEnum("relationship_type").notNull().default("SUBSIDIARY"),
  confidenceScore: doublePrecision("confidence_score").notNull().default(1.0),
  evidenceSummary: text("evidence_summary"),
  sourcePayload: jsonb("source_payload"),
  approvedByUserId: text("approved_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  reviewStatus: masterRelationshipReviewStatusEnum("review_status").notNull().default("APPROVED"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MasterOrganization = typeof masterOrganizationsTable.$inferSelect;
export type MasterOrganizationRelationship = typeof masterOrganizationRelationshipsTable.$inferSelect;

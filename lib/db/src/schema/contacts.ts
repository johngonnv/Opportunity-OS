import { pgTable, text, timestamp, pgEnum, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { workspacesTable } from "./workspaces";
import { organizationsTable } from "./organizations";
import { masterContactsTable } from "./masterContacts";

export const contactStatusEnum = pgEnum("contact_status", ["NEW", "REVIEWED", "ACTIVE", "INACTIVE"]);

export const phoneTypeEnum = pgEnum("phone_type", ["work", "personal"]);

export const stakeholderRoleEnum = pgEnum("stakeholder_role", [
  "DECISION_MAKER",
  "INFLUENCER",
  "CHAMPION",
  "BLOCKER",
  "OTHER",
]);

export const influenceLevelEnum = pgEnum("influence_level", ["LOW", "MEDIUM", "HIGH"]);

export const relationshipStrengthLabelEnum = pgEnum("relationship_strength_label", [
  "COLD",
  "DEVELOPING",
  "STRONG",
  "STRATEGIC",
]);

export const contactsTable = pgTable("contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  firstName: text("first_name"),
  lastName: text("last_name"),
  fullName: text("full_name").notNull(),
  title: text("title"),
  department: text("department"),
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  linkedinUrl: text("linkedin_url"),
  source: text("source"),
  sourceDetail: text("source_detail"),
  status: contactStatusEnum("status").notNull().default("NEW"),
  notesText: text("notes_text"),
  ownerUserId: text("owner_user_id").references(() => usersTable.id, { onDelete: "set null" }),

  stakeholderRole: stakeholderRoleEnum("stakeholder_role"),
  influenceLevel: influenceLevelEnum("influence_level"),
  relationshipStrength: integer("relationship_strength"),
  relationshipStrengthLabel: relationshipStrengthLabelEnum("relationship_strength_label"),
  isPrimaryRelationship: boolean("is_primary_relationship").notNull().default(false),
  roleNotes: text("role_notes"),
  masterContactId: text("master_contact_id").references(() => masterContactsTable.id, { onDelete: "set null" }),

  phoneType: phoneTypeEnum("phone_type"),
  isIndependent: boolean("is_independent").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;

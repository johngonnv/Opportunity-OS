import {
  pgTable, text, timestamp, pgEnum, boolean, jsonb, integer, doublePrecision, unique
} from "drizzle-orm/pg-core";
import { workspacesTable } from "./workspaces";
import { usersTable } from "./users";

// ─── Global Configuration Tables ─────────────────────────────────────────────

export const verticalsTable = pgTable("verticals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const subVerticalsTable = pgTable("sub_verticals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  verticalId: text("vertical_id").notNull().references(() => verticalsTable.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.verticalId, t.key)]);

export const serviceLinesTable = pgTable("service_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  verticalId: text("vertical_id").notNull().references(() => verticalsTable.id, { onDelete: "cascade" }),
  subVerticalId: text("sub_vertical_id").references(() => subVerticalsTable.id, { onDelete: "set null" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  defaultPipelineTemplateKey: text("default_pipeline_template_key"),
  defaultConfig: jsonb("default_config").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.verticalId, t.key)]);

export const addOnTypesTable = pgTable("add_on_types", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  configSchema: jsonb("config_schema").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Workspace Configuration Tables ──────────────────────────────────────────

export const workspaceOnboardingConfigTable = pgTable("workspace_onboarding_config", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().unique().references(() => workspacesTable.id, { onDelete: "cascade" }),
  verticalId: text("vertical_id").references(() => verticalsTable.id, { onDelete: "set null" }),
  subVerticalId: text("sub_vertical_id").references(() => subVerticalsTable.id, { onDelete: "set null" }),
  defaultContactRoles: jsonb("default_contact_roles").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const workspaceServiceLinesTable = pgTable("workspace_service_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  serviceLineId: text("service_line_id").notNull().references(() => serviceLinesTable.id, { onDelete: "cascade" }),
  isEnabled: boolean("is_enabled").notNull().default(true),
  customLabel: text("custom_label"),
  customConfig: jsonb("custom_config"),
  enabledAt: timestamp("enabled_at").notNull().defaultNow(),
  enabledByAdminUserId: text("enabled_by_admin_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.workspaceId, t.serviceLineId)]);

export const workspaceAddOnStatusEnum = pgEnum("workspace_add_on_status", [
  "ACTIVE", "SUSPENDED", "PENDING_CONFIG"
]);

export const workspaceAddOnsTable = pgTable("workspace_add_ons", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  addOnTypeId: text("add_on_type_id").notNull().references(() => addOnTypesTable.id, { onDelete: "cascade" }),
  status: workspaceAddOnStatusEnum("status").notNull().default("ACTIVE"),
  config: jsonb("config").notNull().default({}),
  enabledAt: timestamp("enabled_at").notNull().defaultNow(),
  enabledByAdminUserId: text("enabled_by_admin_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.workspaceId, t.addOnTypeId)]);

// ─── Onboarding Session Tables ────────────────────────────────────────────────

export const onboardingSessionStatusEnum = pgEnum("onboarding_session_status", [
  "DRAFT", "INTAKE", "AWAITING_RECOMMENDATION", "NORMALIZING", "REVIEW",
  "LOCKED", "PROVISIONING", "PROVISIONED", "FAILED"
]);

export const onboardingClientTypeEnum = pgEnum("onboarding_client_type", [
  "SINGLE_USER", "SMALL_TEAM", "ENTERPRISE"
]);

export const clientOnboardingSessionsTable = pgTable("client_onboarding_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  status: onboardingSessionStatusEnum("status").notNull().default("DRAFT"),
  clientType: onboardingClientTypeEnum("client_type").notNull().default("SMALL_TEAM"),
  intakePayload: jsonb("intake_payload").notNull().default({}),
  grokRawPayload: jsonb("grok_raw_payload"),
  grokModelVersion: text("grok_model_version"),
  grokConfidence: doublePrecision("grok_confidence"),
  normalizedRecommendation: jsonb("normalized_recommendation"),
  adminDecisions: jsonb("admin_decisions").notNull().default({}),
  appliedConfig: jsonb("applied_config"),
  createdFromPresetId: text("created_from_preset_id"),
  createdWorkspaceId: text("created_workspace_id").references(() => workspacesTable.id, { onDelete: "set null" }),
  createdByAdminUserId: text("created_by_admin_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  normalizedAt: timestamp("normalized_at"),
  lockedAt: timestamp("locked_at"),
  provisionedAt: timestamp("provisioned_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const provisioningStepKeyEnum = pgEnum("provisioning_step_key", [
  "CREATE_WORKSPACE",
  "ASSIGN_PLAN",
  "CREATE_MEMBERSHIPS",
  "APPLY_VERTICAL_CONFIG",
  "ENABLE_SERVICE_LINES",
  "ENABLE_ADD_ONS",
  "PUBLISH_PIPELINE_TEMPLATES",
  "SEED_CONTACT_ROLES",
  "SEED_TAGS",
  "CREATE_LAUNCH_CHECKLIST",
  "SEND_INVITE_EMAILS",
  "RECORD_AUDIT_ENTRY",
  "SNAPSHOT_HEALTH_BASELINE",
]);

export const provisioningStepStatusEnum = pgEnum("provisioning_step_status", [
  "PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "SKIPPED"
]);

export const onboardingProvisioningStepsTable = pgTable("onboarding_provisioning_steps", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id").notNull().references(() => clientOnboardingSessionsTable.id, { onDelete: "cascade" }),
  stepKey: provisioningStepKeyEnum("step_key").notNull(),
  status: provisioningStepStatusEnum("status").notNull().default("PENDING"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  resultPayload: jsonb("result_payload"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.sessionId, t.stepKey)]);

// ─── Launch Checklist ─────────────────────────────────────────────────────────

export const launchChecklistItemStatusEnum = pgEnum("launch_checklist_item_status", [
  "PENDING", "COMPLETED", "SKIPPED"
]);

export const workspaceLaunchChecklistTable = pgTable("workspace_launch_checklist", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  itemKey: text("item_key").notNull(),
  label: text("label").notNull(),
  status: launchChecklistItemStatusEnum("status").notNull().default("PENDING"),
  requiredForClientTypes: jsonb("required_for_client_types").notNull().default(["SINGLE_USER", "SMALL_TEAM", "ENTERPRISE"]),
  completedAt: timestamp("completed_at"),
  completedByUserId: text("completed_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.workspaceId, t.itemKey)]);

// ─── Workspace Health Snapshots ───────────────────────────────────────────────

export const workspaceHealthSnapshotsTable = pgTable("workspace_health_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  snapshotDate: timestamp("snapshot_date").notNull().defaultNow(),
  setupCompletenessPct: integer("setup_completeness_pct").notNull().default(0),
  activeUserCount: integer("active_user_count").notNull().default(0),
  contactCount: integer("contact_count").notNull().default(0),
  orgCount: integer("org_count").notNull().default(0),
  opportunityCount: integer("opportunity_count").notNull().default(0),
  missingDataFlags: jsonb("missing_data_flags").notNull().default([]),
  grokImprovementSuggestions: jsonb("grok_improvement_suggestions").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Onboarding Presets ───────────────────────────────────────────────────────

export const onboardingPresetsTable = pgTable("onboarding_presets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  verticalId: text("vertical_id").references(() => verticalsTable.id, { onDelete: "set null" }),
  subVerticalId: text("sub_vertical_id").references(() => subVerticalsTable.id, { onDelete: "set null" }),
  isPublic: boolean("is_public").notNull().default(false),
  presetPayload: jsonb("preset_payload").notNull().default({}),
  usageCount: integer("usage_count").notNull().default(0),
  version: integer("version").notNull().default(1),
  createdFromSessionId: text("created_from_session_id").references(() => clientOnboardingSessionsTable.id, { onDelete: "set null" }),
  createdByAdminUserId: text("created_by_admin_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Vertical = typeof verticalsTable.$inferSelect;
export type SubVertical = typeof subVerticalsTable.$inferSelect;
export type ServiceLine = typeof serviceLinesTable.$inferSelect;
export type AddOnType = typeof addOnTypesTable.$inferSelect;
export type WorkspaceOnboardingConfig = typeof workspaceOnboardingConfigTable.$inferSelect;
export type WorkspaceServiceLine = typeof workspaceServiceLinesTable.$inferSelect;
export type WorkspaceAddOn = typeof workspaceAddOnsTable.$inferSelect;
export type ClientOnboardingSession = typeof clientOnboardingSessionsTable.$inferSelect;
export type OnboardingProvisioningStep = typeof onboardingProvisioningStepsTable.$inferSelect;
export type WorkspaceLaunchChecklist = typeof workspaceLaunchChecklistTable.$inferSelect;
export type WorkspaceHealthSnapshot = typeof workspaceHealthSnapshotsTable.$inferSelect;
export type OnboardingPreset = typeof onboardingPresetsTable.$inferSelect;

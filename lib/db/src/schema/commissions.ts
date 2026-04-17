import { pgTable, text, timestamp, pgEnum, doublePrecision, integer, unique, jsonb } from "drizzle-orm/pg-core";
import { workspacesTable } from "./workspaces";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";

export const commissionLineOfServiceEnum = pgEnum("commission_line_of_service", [
  "EMS_INTERFACILITY",
  "EVENT_STAFFING",
  "EMT_PROGRAM",
  "GOVERNMENT",
]);

export const commissionRuleRateTypeEnum = pgEnum("commission_rule_rate_type", [
  "PERCENT_OF_REVENUE",
  "FLAT",
  "PER_UNIT",
]);

export const commissionRecordStatusEnum = pgEnum("commission_record_status", [
  "DRAFT",
  "APPROVED",
  "LOCKED",
  "PAID",
  "ADJUSTED",
]);

export const commissionLedgerSourceEnum = pgEnum("commission_ledger_source", [
  "MANUAL",
  "CSV",
]);

export const commissionRevenueBasisEnum = pgEnum("commission_revenue_basis", [
  "NET_REVENUE",
  "CONTRACT_VALUE",
  "TUITION",
  "PER_STUDENT",
  "FLAT",
  "MILESTONE",
]);

// ─── Rules: per workspace + line + (optional facility) ─────────────────────────
// If organizationId is null → workspace-default rule for that line.
export const commissionRulesTable = pgTable("commission_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  lineOfService: commissionLineOfServiceEnum("line_of_service").notNull(),
  organizationId: text("organization_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  rateType: commissionRuleRateTypeEnum("rate_type").notNull(),
  rateValue: doublePrecision("rate_value").notNull(),
  revenueBasis: commissionRevenueBasisEnum("revenue_basis").notNull().default("NET_REVENUE"),
  effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
  effectiveTo: timestamp("effective_to"),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Periods: per workspace + line + month, lockable ───────────────────────────
// periodKey is YYYY-MM (e.g. "2026-04")
export const commissionPeriodsTable = pgTable("commission_periods", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  lineOfService: commissionLineOfServiceEnum("line_of_service").notNull(),
  periodKey: text("period_key").notNull(),
  isLocked: integer("is_locked").notNull().default(0),
  lockedAt: timestamp("locked_at"),
  lockedByUserId: text("locked_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.workspaceId, t.lineOfService, t.periodKey)]);

// ─── Facility Net Revenue Ledger ──────────────────────────────────────────────
export const facilityNetRevenueLedgerTable = pgTable("facility_net_revenue_ledger", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  periodKey: text("period_key").notNull(),
  netRevenue: doublePrecision("net_revenue").notNull(),
  source: commissionLedgerSourceEnum("source").notNull().default("MANUAL"),
  notes: text("notes"),
  enteredByUserId: text("entered_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.workspaceId, t.organizationId, t.periodKey)]);

// ─── Commission Records ───────────────────────────────────────────────────────
// One row per (line, period, facility, rep) for EMS_INTERFACILITY (auto-calc).
// One row per manually-entered event/enrollment/award for the other lines.
export const commissionRecordsTable = pgTable("commission_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  lineOfService: commissionLineOfServiceEnum("line_of_service").notNull(),
  periodKey: text("period_key").notNull(),
  organizationId: text("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  ownerRepUserId: text("owner_rep_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  ruleId: text("rule_id").references(() => commissionRulesTable.id, { onDelete: "set null" }),
  revenueBasis: commissionRevenueBasisEnum("revenue_basis").notNull(),
  basisAmount: doublePrecision("basis_amount").notNull().default(0),
  rateSnapshot: doublePrecision("rate_snapshot"),
  amount: doublePrecision("amount").notNull().default(0),
  status: commissionRecordStatusEnum("status").notNull().default("DRAFT"),
  description: text("description"),
  overrideNote: text("override_note"),
  calcMeta: jsonb("calc_meta"),
  calculatedAt: timestamp("calculated_at"),
  approvedAt: timestamp("approved_at"),
  approvedByUserId: text("approved_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  paidAt: timestamp("paid_at"),
  paidByUserId: text("paid_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  lastAdjustedAt: timestamp("last_adjusted_at"),
  lastAdjustedByUserId: text("last_adjusted_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  parentRecordId: text("parent_record_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Adjustments ──────────────────────────────────────────────────────────────
export const commissionAdjustmentsTable = pgTable("commission_adjustments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").notNull().references(() => workspacesTable.id, { onDelete: "cascade" }),
  parentRecordId: text("parent_record_id").notNull().references(() => commissionRecordsTable.id, { onDelete: "cascade" }),
  deltaAmount: doublePrecision("delta_amount").notNull(),
  reason: text("reason").notNull(),
  createdByUserId: text("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CommissionRule = typeof commissionRulesTable.$inferSelect;
export type CommissionPeriod = typeof commissionPeriodsTable.$inferSelect;
export type FacilityNetRevenueLedger = typeof facilityNetRevenueLedgerTable.$inferSelect;
export type CommissionRecord = typeof commissionRecordsTable.$inferSelect;
export type CommissionAdjustment = typeof commissionAdjustmentsTable.$inferSelect;

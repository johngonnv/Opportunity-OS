import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  date,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { workspacesTable } from "./workspaces";
import { usersTable } from "./users";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const cmsVerificationStatusEnum = pgEnum("cms_verification_status", [
  "MATCHED",
  "VERIFIED",
  "NEEDS_REVIEW",
  "REJECTED",
  "IMPORT_ERROR",
]);

export const painPointCategoryEnum = pgEnum("pain_point_category", [
  "ED_BOARDING",
  "DISCHARGE_BOTTLENECK",
  "CARE_TRANSITION_RISK",
  "STAFFING_PRESSURE",
  "CAPACITY_CONSTRAINT",
  "REVENUE_CYCLE",
  "DOCUMENTATION_BURDEN",
  "PATIENT_EXPERIENCE",
  "OTHER",
]);

export const painPointSeverityEnum = pgEnum("pain_point_severity", [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
]);

export const painPointFrequencyEnum = pgEnum("pain_point_frequency", [
  "CONSTANT",
  "FREQUENT",
  "OCCASIONAL",
  "RARE",
]);

export const painPointSourceTypeEnum = pgEnum("pain_point_source_type", [
  "CMS_SIGNAL",
  "USER_REPORTED",
  "ADMIN_CONFIRMED",
  "ONBOARDING_EXTRACTED",
  "CORROBORATING_SOURCE",
]);

export const evidenceTypeEnum = pgEnum("evidence_type", [
  "QUANTITATIVE",
  "QUALITATIVE",
  "ANECDOTAL",
  "INFERRED",
]);

export const painPointVerificationStatusEnum = pgEnum(
  "pain_point_verification_status",
  ["SUGGESTED", "PENDING_REVIEW", "VERIFIED", "REJECTED"]
);

export const competitorTypeEnum = pgEnum("competitor_type", [
  "INCUMBENT_VENDOR",
  "EMERGING_VENDOR",
  "INTERNAL_SOLUTION",
  "MANUAL_PROCESS",
  "NO_SOLUTION",
  "UNKNOWN",
]);

export const incumbentStatusEnum = pgEnum("incumbent_status", [
  "CONFIRMED_INCUMBENT",
  "SUSPECTED_INCUMBENT",
  "FORMER_INCUMBENT",
  "NOT_INCUMBENT",
]);

export const contractStatusEnum = pgEnum("contract_status", [
  "ACTIVE_CONTRACT",
  "MONTH_TO_MONTH",
  "EXPIRED",
  "UNKNOWN",
]);

export const displacementDifficultyEnum = pgEnum("displacement_difficulty", [
  "VERY_HIGH",
  "HIGH",
  "MEDIUM",
  "LOW",
]);

export const competitorPainPointRelationshipTypeEnum = pgEnum(
  "competitor_pain_point_relationship_type",
  ["CAUSED_BY", "EXACERBATED_BY", "MASKED_BY", "OPPORTUNITY_ANGLE"]
);

// ---------------------------------------------------------------------------
// organization_healthcare_profile
// One-to-one with organizations. Holds CMS data + traceability fields.
// ---------------------------------------------------------------------------

export const organizationHealthcareProfilesTable = pgTable(
  "organization_healthcare_profile",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspacesTable.id, { onDelete: "cascade" }),

    // Core CMS identifiers (cms_provider_type / cms_ownership_type are text;
    // enum normalization is explicitly deferred)
    cmsCcn: text("cms_ccn"),
    cmsProviderType: text("cms_provider_type"),
    cmsOwnershipType: text("cms_ownership_type"),

    // Facility characteristics
    cmsBedCount: integer("cms_bed_count"),
    cmsEmergencyServices: boolean("cms_emergency_services"),

    // Star ratings
    cmsOverallStarRating: integer("cms_overall_star_rating"),
    cmsPatientExperienceRating: integer("cms_patient_experience_rating"),

    // ED operational metrics
    cmsEdTotalTimeMinutes: integer("cms_ed_total_time_minutes"),
    cmsEdTimeToAdmitMinutes: integer("cms_ed_time_to_admit_minutes"),
    cmsEdBoardingTimeMinutes: integer("cms_ed_boarding_time_minutes"),
    // Stored as basis points: 450 = 4.50%
    cmsEdLwbsPercent: integer("cms_ed_lwbs_percent"),

    // Care transition / HCAHPS subscores
    cmsCareTransitionRating: integer("cms_care_transition_rating"),
    cmsPatientExperienceSubscoresJson: jsonb(
      "cms_patient_experience_subscores_json"
    ).$type<Record<string, number>>(),

    // Raw payload + source metadata
    cmsRawJson: jsonb("cms_raw_json"),
    cmsSource: text("cms_source"),
    cmsVerificationStatus: cmsVerificationStatusEnum("cms_verification_status"),
    cmsLastUpdatedAt: timestamp("cms_last_updated_at"),

    // Traceability fields
    cmsSourceUrl: text("cms_source_url"),
    cmsDatasetName: text("cms_dataset_name"),
    cmsDatasetVersion: text("cms_dataset_version"),
    cmsExtractedAt: timestamp("cms_extracted_at"),
    cmsEffectiveDate: date("cms_effective_date"),
    // e.g. "ccn_exact", "name_fuzzy", "manual"
    cmsMatchMethod: text("cms_match_method"),
    cmsMatchConfidenceScore: integer("cms_match_confidence_score"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  }
);

// ---------------------------------------------------------------------------
// organization_pain_points
// Suggested (CMS-derived) and verified pain points for an organization.
// CMS signals create SUGGESTED rows only; approval is the sole path to VERIFIED.
// ---------------------------------------------------------------------------

export const organizationPainPointsTable = pgTable("organization_pain_points", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspacesTable.id, { onDelete: "cascade" }),

  department: text("department"),
  painPointCategory: painPointCategoryEnum("pain_point_category").notNull(),
  painPointStatement: text("pain_point_statement"),
  severity: painPointSeverityEnum("severity").notNull().default("MEDIUM"),
  frequency: painPointFrequencyEnum("frequency"),
  sourceType: painPointSourceTypeEnum("source_type").notNull(),
  sourceReference: text("source_reference"),
  evidenceType: evidenceTypeEnum("evidence_type"),
  // The CMS column name that triggered this suggestion, e.g. "cms_ed_boarding_time_minutes"
  linkedCmsSignalKey: text("linked_cms_signal_key"),
  confidenceScore: integer("confidence_score").notNull().default(50),
  verificationStatus: painPointVerificationStatusEnum("verification_status")
    .notNull()
    .default("SUGGESTED"),
  isActive: boolean("is_active").notNull().default(true),

  // Review audit fields — written when an admin approves or rejects
  reviewedByUserId: text("reviewed_by_user_id").references(
    () => usersTable.id,
    { onDelete: "set null" }
  ),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// organization_competitors
// Competitor entries for an organization.
// IMPORTANT: pain_points_caused is a derived/cached field. The canonical
// source of truth for competitor↔pain-point relationships is the
// competitor_pain_point_links table. The API compute layer must re-aggregate
// pain_points_caused from active links whenever links change.
// ---------------------------------------------------------------------------

export const organizationCompetitorsTable = pgTable(
  "organization_competitors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspacesTable.id, { onDelete: "cascade" }),

    competitorName: text("competitor_name").notNull(),
    competitorType: competitorTypeEnum("competitor_type")
      .notNull()
      .default("UNKNOWN"),
    serviceLine: text("service_line"),
    incumbentStatus: incumbentStatusEnum("incumbent_status")
      .notNull()
      .default("NOT_INCUMBENT"),
    // 0–100; null means unknown
    shareOfWalletEstimate: integer("share_of_wallet_estimate"),
    contractStatus: contractStatusEnum("contract_status").default("UNKNOWN"),

    // Stored as JSONB text arrays
    strengths: jsonb("strengths").$type<string[]>().default([]),
    weaknesses: jsonb("weaknesses").$type<string[]>().default([]),
    // DERIVED/CACHED — populated by the API when competitor_pain_point_links change.
    // Do not write this field directly from user input.
    painPointsCaused: jsonb("pain_points_caused").$type<string[]>().default([]),

    displacementDifficulty: displacementDifficultyEnum(
      "displacement_difficulty"
    ).default("MEDIUM"),
    sourceType: painPointSourceTypeEnum("source_type"),
    sourceReference: text("source_reference"),
    confidenceScore: integer("confidence_score").notNull().default(50),
    verificationStatus: painPointVerificationStatusEnum(
      "verification_status"
    )
      .notNull()
      .default("SUGGESTED"),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  }
);

// ---------------------------------------------------------------------------
// competitor_pain_point_links
// SOURCE OF TRUTH for all competitor↔pain-point relationships.
// Cascade-deletes when either parent row is removed.
// ---------------------------------------------------------------------------

export const competitorPainPointLinksTable = pgTable(
  "competitor_pain_point_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationCompetitorId: text("organization_competitor_id")
      .notNull()
      .references(() => organizationCompetitorsTable.id, {
        onDelete: "cascade",
      }),
    organizationPainPointId: text("organization_pain_point_id")
      .notNull()
      .references(() => organizationPainPointsTable.id, {
        onDelete: "cascade",
      }),
    relationshipType: competitorPainPointRelationshipTypeEnum(
      "relationship_type"
    )
      .notNull()
      .default("CAUSED_BY"),
    confidenceScore: integer("confidence_score").notNull().default(50),
    notes: text("notes"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  }
);

// ---------------------------------------------------------------------------
// TypeScript types
// ---------------------------------------------------------------------------

export type OrganizationHealthcareProfile =
  typeof organizationHealthcareProfilesTable.$inferSelect;
export type InsertOrganizationHealthcareProfile =
  typeof organizationHealthcareProfilesTable.$inferInsert;

export type OrganizationPainPoint =
  typeof organizationPainPointsTable.$inferSelect;
export type InsertOrganizationPainPoint =
  typeof organizationPainPointsTable.$inferInsert;

export type OrganizationCompetitor =
  typeof organizationCompetitorsTable.$inferSelect;
export type InsertOrganizationCompetitor =
  typeof organizationCompetitorsTable.$inferInsert;

export type CompetitorPainPointLink =
  typeof competitorPainPointLinksTable.$inferSelect;
export type InsertCompetitorPainPointLink =
  typeof competitorPainPointLinksTable.$inferInsert;

// Shape of the cached intelligence summary stored in organizations.organization_intelligence_summary
export interface OrganizationIntelligenceSummary {
  topPainPoints: Array<{
    category: string;
    statement: string | null;
    severity: string;
    confidenceScore: number;
  }>;
  topCompetitors: Array<{
    competitorName: string;
    incumbentStatus: string;
    displacementDifficulty: string;
    topWeakness: string | null;
  }>;
  buyerPatterns: string[];
  entryStrategy: string;
  primaryAction: string;
  impactStatement: string;
  computedAt: string; // ISO timestamp
}

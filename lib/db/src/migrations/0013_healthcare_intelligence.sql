-- Migration 0013: Healthcare Intelligence Schema
-- Adds 4 new tables for CMS provider data, pain point tracking, competitor intelligence,
-- and competitor↔pain-point cross-links. Also adds organization_intelligence_summary
-- JSONB column to the organizations table.
--
-- NOTE: This migration is for documentation. The live schema was applied via direct SQL
-- (drizzle-kit push requires interactive prompts in this environment).

-- ---------------------------------------------------------------------------
-- New enum types
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE cms_verification_status_enum AS ENUM (
    'MATCHED', 'VERIFIED', 'NEEDS_REVIEW', 'REJECTED', 'IMPORT_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pain_point_category AS ENUM (
    'ED_BOARDING', 'DISCHARGE_BOTTLENECK', 'CARE_TRANSITION_RISK',
    'STAFFING_PRESSURE', 'CAPACITY_CONSTRAINT', 'REVENUE_CYCLE',
    'DOCUMENTATION_BURDEN', 'PATIENT_EXPERIENCE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pain_point_severity AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pain_point_frequency AS ENUM ('CONSTANT', 'FREQUENT', 'OCCASIONAL', 'RARE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pain_point_source_type AS ENUM (
    'CMS_SIGNAL', 'USER_REPORTED', 'ADMIN_CONFIRMED',
    'ONBOARDING_EXTRACTED', 'CORROBORATING_SOURCE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE evidence_type AS ENUM ('QUANTITATIVE', 'QUALITATIVE', 'ANECDOTAL', 'INFERRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pain_point_verification_status AS ENUM (
    'SUGGESTED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE competitor_type AS ENUM (
    'INCUMBENT_VENDOR', 'EMERGING_VENDOR', 'INTERNAL_SOLUTION',
    'MANUAL_PROCESS', 'NO_SOLUTION', 'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE incumbent_status AS ENUM (
    'CONFIRMED_INCUMBENT', 'SUSPECTED_INCUMBENT', 'FORMER_INCUMBENT', 'NOT_INCUMBENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contract_status AS ENUM (
    'ACTIVE_CONTRACT', 'MONTH_TO_MONTH', 'EXPIRED', 'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE displacement_difficulty AS ENUM ('VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE competitor_pain_point_relationship_type AS ENUM (
    'CAUSED_BY', 'EXACERBATED_BY', 'MASKED_BY', 'OPPORTUNITY_ANGLE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- organization_healthcare_profile
-- One-to-one with organizations. Holds CMS data + full traceability fields.
-- cms_provider_type and cms_ownership_type are text (enum normalization deferred).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_healthcare_profile (
  id                                    TEXT PRIMARY KEY,
  organization_id                       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id                          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  cms_ccn                               TEXT,
  cms_provider_type                     TEXT,
  cms_ownership_type                    TEXT,
  cms_bed_count                         INTEGER,
  cms_emergency_services                BOOLEAN,
  cms_overall_star_rating               INTEGER,
  cms_patient_experience_rating         INTEGER,
  cms_ed_total_time_minutes             INTEGER,
  cms_ed_time_to_admit_minutes          INTEGER,
  cms_ed_boarding_time_minutes          INTEGER,
  cms_ed_lwbs_percent                   INTEGER,   -- basis points: 450 = 4.50%
  cms_care_transition_rating            INTEGER,
  cms_patient_experience_subscores_json JSONB,
  cms_raw_json                          JSONB,
  cms_source                            TEXT,
  cms_verification_status               cms_verification_status_enum,
  cms_last_updated_at                   TIMESTAMPTZ,

  -- Traceability
  cms_source_url                        TEXT,
  cms_dataset_name                      TEXT,
  cms_dataset_version                   TEXT,
  cms_extracted_at                      TIMESTAMPTZ,
  cms_effective_date                    DATE,
  cms_match_method                      TEXT,
  cms_match_confidence_score            INTEGER,

  created_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Enforce one-to-one relationship with organizations
  CONSTRAINT organization_healthcare_profile_organization_id_unique UNIQUE (organization_id)
);

-- ---------------------------------------------------------------------------
-- organization_pain_points
-- CMS signals create SUGGESTED rows only. Admin approval required for VERIFIED.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_pain_points (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  department            TEXT,
  pain_point_category   pain_point_category NOT NULL,
  pain_point_statement  TEXT,
  severity              pain_point_severity NOT NULL DEFAULT 'MEDIUM',
  frequency             pain_point_frequency,
  source_type           pain_point_source_type NOT NULL,
  source_reference      TEXT,
  evidence_type         evidence_type,
  linked_cms_signal_key TEXT,
  confidence_score      INTEGER NOT NULL DEFAULT 50,
  verification_status   pain_point_verification_status NOT NULL DEFAULT 'SUGGESTED',
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,

  reviewed_by_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  review_note           TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- organization_competitors
-- pain_points_caused is DERIVED/CACHED from competitor_pain_point_links.
-- The API compute layer re-aggregates it on every link change.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_competitors (
  id                       TEXT PRIMARY KEY,
  organization_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id             TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  competitor_name          TEXT NOT NULL,
  competitor_type          competitor_type NOT NULL DEFAULT 'UNKNOWN',
  service_line             TEXT,
  incumbent_status         incumbent_status NOT NULL DEFAULT 'NOT_INCUMBENT',
  share_of_wallet_estimate INTEGER,
  contract_status          contract_status DEFAULT 'UNKNOWN',
  strengths                JSONB DEFAULT '[]',
  weaknesses               JSONB DEFAULT '[]',
  pain_points_caused       JSONB DEFAULT '[]', -- cached; do not write directly
  displacement_difficulty  displacement_difficulty DEFAULT 'MEDIUM',
  source_type              pain_point_source_type,
  source_reference         TEXT,
  confidence_score         INTEGER NOT NULL DEFAULT 50,
  verification_status      pain_point_verification_status NOT NULL DEFAULT 'SUGGESTED',
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- competitor_pain_point_links
-- SOURCE OF TRUTH for all competitor↔pain-point relationships.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS competitor_pain_point_links (
  id                         TEXT PRIMARY KEY,
  organization_competitor_id TEXT NOT NULL REFERENCES organization_competitors(id) ON DELETE CASCADE,
  organization_pain_point_id TEXT NOT NULL REFERENCES organization_pain_points(id) ON DELETE CASCADE,
  relationship_type          competitor_pain_point_relationship_type NOT NULL DEFAULT 'CAUSED_BY',
  confidence_score           INTEGER NOT NULL DEFAULT 50,
  notes                      TEXT,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Add intelligence summary column to organizations
-- Shape: { topPainPoints[], topCompetitors[], buyerPatterns[], entryStrategy,
--          primaryAction, impactStatement, computedAt }
-- ---------------------------------------------------------------------------

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS organization_intelligence_summary JSONB;

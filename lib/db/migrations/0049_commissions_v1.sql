-- Migration: Commissions v1 (Task #49)
-- Idempotent. Applied via executeSql at task execution time.
-- Canonical schema: lib/db/src/schema/commissions.ts

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE commission_line_of_service AS ENUM ('EMS_INTERFACILITY','EVENT_STAFFING','EMT_PROGRAM','GOVERNMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE commission_rule_rate_type AS ENUM ('PERCENT_OF_REVENUE','FLAT','PER_UNIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE commission_revenue_basis AS ENUM ('NET_REVENUE','CONTRACT_VALUE','TUITION','PER_STUDENT','FLAT','MILESTONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE commission_record_status AS ENUM ('DRAFT','APPROVED','LOCKED','PAID','ADJUSTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE commission_ledger_source AS ENUM ('MANUAL','CSV');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add MANAGER role to existing workspace_role enum
DO $$ BEGIN
  ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'MANAGER';
EXCEPTION WHEN others THEN NULL; END $$;

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commission_rules (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  line_of_service commission_line_of_service NOT NULL,
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  rate_type commission_rule_rate_type NOT NULL,
  rate_value double precision NOT NULL,
  revenue_basis commission_revenue_basis NOT NULL DEFAULT 'NET_REVENUE',
  effective_from timestamp NOT NULL DEFAULT now(),
  effective_to timestamp,
  notes text,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_rules_workspace_idx ON commission_rules(workspace_id);
CREATE INDEX IF NOT EXISTS commission_rules_line_idx ON commission_rules(line_of_service);

CREATE TABLE IF NOT EXISTS commission_periods (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  line_of_service commission_line_of_service NOT NULL,
  period_key text NOT NULL,
  is_locked integer NOT NULL DEFAULT 0,
  locked_at timestamp,
  locked_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commission_periods_unique
  ON commission_periods(workspace_id, line_of_service, period_key);

CREATE TABLE IF NOT EXISTS facility_net_revenue_ledger (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  net_revenue double precision NOT NULL,
  source commission_ledger_source NOT NULL DEFAULT 'MANUAL',
  notes text,
  entered_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS facility_net_revenue_unique
  ON facility_net_revenue_ledger(workspace_id, organization_id, period_key);

CREATE TABLE IF NOT EXISTS commission_records (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  line_of_service commission_line_of_service NOT NULL,
  period_key text NOT NULL,
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  owner_rep_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rule_id text REFERENCES commission_rules(id) ON DELETE SET NULL,
  revenue_basis commission_revenue_basis NOT NULL,
  basis_amount double precision NOT NULL DEFAULT 0,
  rate_snapshot double precision,
  amount double precision NOT NULL DEFAULT 0,
  status commission_record_status NOT NULL DEFAULT 'DRAFT',
  description text,
  override_note text,
  calc_meta jsonb,
  calculated_at timestamp,
  approved_at timestamp,
  approved_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  paid_at timestamp,
  paid_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  last_adjusted_at timestamp,
  last_adjusted_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  parent_record_id varchar REFERENCES commission_records(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_records_workspace_idx ON commission_records(workspace_id);
CREATE INDEX IF NOT EXISTS commission_records_period_idx ON commission_records(period_key);
CREATE INDEX IF NOT EXISTS commission_records_owner_idx ON commission_records(owner_rep_user_id);
CREATE INDEX IF NOT EXISTS commission_records_org_idx ON commission_records(organization_id);
CREATE INDEX IF NOT EXISTS commission_records_status_idx ON commission_records(status);
CREATE INDEX IF NOT EXISTS commission_records_parent_idx ON commission_records(parent_record_id);

CREATE TABLE IF NOT EXISTS commission_adjustments (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_record_id text NOT NULL REFERENCES commission_records(id) ON DELETE CASCADE,
  delta_amount double precision NOT NULL,
  reason text NOT NULL,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_adjustments_parent_idx ON commission_adjustments(parent_record_id);
CREATE INDEX IF NOT EXISTS commission_adjustments_workspace_idx ON commission_adjustments(workspace_id);

-- ─── Lifecycle ────────────────────────────────────────────────────────────────
-- Adjustments are recorded as a NEW commission_record (status=ADJUSTED) linked
-- to the original via parent_record_id, plus an entry in commission_adjustments
-- for history. The original record is preserved for audit.

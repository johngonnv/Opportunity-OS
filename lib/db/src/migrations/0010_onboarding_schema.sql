-- Migration: Admin Onboarding Schema (Task #32)
-- Applied via direct SQL (Drizzle push blocked by schema drift)
-- Safe to run multiple times (all CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

-- ─── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE workspace_add_on_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE onboarding_session_status AS ENUM (
    'INTAKE', 'AWAITING_RECOMMENDATION', 'NORMALIZING', 'REVIEW', 'LOCKED',
    'PROVISIONING', 'PROVISIONED', 'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE onboarding_client_type AS ENUM ('SINGLE_USER', 'SMALL_TEAM', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE provisioning_step_key AS ENUM (
    'CREATE_WORKSPACE', 'ASSIGN_PLAN', 'CREATE_MEMBERSHIPS', 'APPLY_VERTICAL_CONFIG',
    'ENABLE_SERVICE_LINES', 'ENABLE_ADD_ONS', 'PUBLISH_PIPELINE_TEMPLATES',
    'SEED_CONTACT_ROLES', 'SEED_TAGS', 'CREATE_LAUNCH_CHECKLIST',
    'SEND_INVITE_EMAILS', 'RECORD_AUDIT_ENTRY', 'SNAPSHOT_HEALTH_BASELINE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE provisioning_step_status AS ENUM (
    'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE launch_checklist_item_status AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Core Config Tables ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verticals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sub_verticals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  vertical_id TEXT NOT NULL REFERENCES verticals(id) ON DELETE CASCADE,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_lines (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  vertical_id TEXT NOT NULL REFERENCES verticals(id) ON DELETE CASCADE,
  sub_vertical_id TEXT REFERENCES sub_verticals(id) ON DELETE SET NULL,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  default_pipeline_template_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS add_on_types (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  config_schema JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Workspace Onboarding Config ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_onboarding_config (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT UNIQUE NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  vertical_id TEXT REFERENCES verticals(id) ON DELETE SET NULL,
  sub_vertical_id TEXT REFERENCES sub_verticals(id) ON DELETE SET NULL,
  default_contact_roles JSONB NOT NULL DEFAULT '[]',
  custom_config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_service_lines (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  service_line_id TEXT NOT NULL REFERENCES service_lines(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_by_admin_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, service_line_id)
);

CREATE TABLE IF NOT EXISTS workspace_add_ons (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  add_on_type_id TEXT NOT NULL REFERENCES add_on_types(id) ON DELETE CASCADE,
  status workspace_add_on_status NOT NULL DEFAULT 'ACTIVE',
  config JSONB NOT NULL DEFAULT '{}',
  enabled_by_admin_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, add_on_type_id)
);

-- ─── Onboarding Sessions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_onboarding_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  status onboarding_session_status NOT NULL DEFAULT 'INTAKE',
  client_type onboarding_client_type NOT NULL DEFAULT 'SMALL_TEAM',
  intake_payload JSONB NOT NULL DEFAULT '{}',
  grok_raw_payload JSONB,
  grok_model_version TEXT,
  grok_confidence DOUBLE PRECISION,
  normalized_recommendation JSONB,
  admin_decisions JSONB NOT NULL DEFAULT '{}',
  applied_config JSONB,
  created_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  created_by_admin_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_from_preset_id TEXT,
  notes TEXT,
  normalized_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  provisioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_provisioning_steps (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id TEXT NOT NULL REFERENCES client_onboarding_sessions(id) ON DELETE CASCADE,
  step_key provisioning_step_key NOT NULL,
  status provisioning_step_status NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  result_payload JSONB,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, step_key)
);

-- ─── Launch Checklist & Health Snapshots ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_launch_checklist (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  status launch_checklist_item_status NOT NULL DEFAULT 'PENDING',
  required_for_client_types JSONB NOT NULL DEFAULT '["SINGLE_USER","SMALL_TEAM","ENTERPRISE"]',
  completed_at TIMESTAMPTZ,
  completed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, item_key)
);

CREATE TABLE IF NOT EXISTS workspace_health_snapshots (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  snapshot_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  setup_completeness_pct INTEGER NOT NULL DEFAULT 0,
  active_user_count INTEGER NOT NULL DEFAULT 0,
  contact_count INTEGER NOT NULL DEFAULT 0,
  org_count INTEGER NOT NULL DEFAULT 0,
  opportunity_count INTEGER NOT NULL DEFAULT 0,
  missing_data_flags JSONB NOT NULL DEFAULT '[]',
  grok_improvement_suggestions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Presets ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_presets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  vertical_id TEXT REFERENCES verticals(id) ON DELETE SET NULL,
  sub_vertical_id TEXT REFERENCES sub_verticals(id) ON DELETE SET NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  preset_payload JSONB NOT NULL DEFAULT '{}',
  usage_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_from_session_id TEXT REFERENCES client_onboarding_sessions(id) ON DELETE SET NULL,
  created_from_preset_id TEXT REFERENCES onboarding_presets(id) ON DELETE SET NULL,
  created_by_admin_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Additive FK columns on existing tables ───────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_vertical_id TEXT REFERENCES verticals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_sub_vertical_id TEXT REFERENCES sub_verticals(id) ON DELETE SET NULL;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS service_line_id TEXT REFERENCES service_lines(id) ON DELETE SET NULL;

-- ─── Seed: Core verticals, sub-verticals, service lines, add-on types ─────────
INSERT INTO verticals (key, label, description, sort_order) VALUES
  ('healthcare', 'Healthcare', 'Healthcare organizations including EMS, ambulatory surgery, and health systems', 1),
  ('govcon', 'Government Contracting', 'Government contractors providing services to federal, state, and local agencies', 2),
  ('general_business', 'General Business', 'General business verticals and catch-all for organizations not in a specialized sector', 99)
ON CONFLICT (key) DO NOTHING;

INSERT INTO sub_verticals (vertical_id, key, label, description, sort_order)
SELECT v.id, 'ems', 'Emergency Medical Services', 'EMS providers including ground ambulance, air medical, and interfacility transport', 1
FROM verticals v WHERE v.key = 'healthcare'
ON CONFLICT (key) DO NOTHING;

INSERT INTO sub_verticals (vertical_id, key, label, description, sort_order)
SELECT v.id, 'ambulatory_surgery', 'Ambulatory Surgery Centers', 'Outpatient surgical facilities and surgery center management', 2
FROM verticals v WHERE v.key = 'healthcare'
ON CONFLICT (key) DO NOTHING;

INSERT INTO sub_verticals (vertical_id, key, label, description, sort_order)
SELECT v.id, 'health_system', 'Health Systems', 'Multi-facility hospital systems and integrated health networks', 3
FROM verticals v WHERE v.key = 'healthcare'
ON CONFLICT (key) DO NOTHING;

INSERT INTO service_lines (vertical_id, sub_vertical_id, key, label, description, default_pipeline_template_key, sort_order)
SELECT v.id, sv.id, 'bls', 'Basic Life Support (BLS)', 'Ground ambulance BLS transport services', 'ems_interfacility_transport_v1', 1
FROM verticals v JOIN sub_verticals sv ON sv.key = 'ems' AND sv.vertical_id = v.id WHERE v.key = 'healthcare'
ON CONFLICT (key) DO NOTHING;

INSERT INTO service_lines (vertical_id, sub_vertical_id, key, label, description, default_pipeline_template_key, sort_order)
SELECT v.id, sv.id, 'als', 'Advanced Life Support (ALS)', 'Ground ambulance ALS transport services', 'ems_interfacility_transport_v1', 2
FROM verticals v JOIN sub_verticals sv ON sv.key = 'ems' AND sv.vertical_id = v.id WHERE v.key = 'healthcare'
ON CONFLICT (key) DO NOTHING;

INSERT INTO service_lines (vertical_id, sub_vertical_id, key, label, description, default_pipeline_template_key, sort_order)
SELECT v.id, sv.id, 'cct', 'Critical Care Transport (CCT)', 'Ground or air critical care transport', 'ems_interfacility_transport_v1', 3
FROM verticals v JOIN sub_verticals sv ON sv.key = 'ems' AND sv.vertical_id = v.id WHERE v.key = 'healthcare'
ON CONFLICT (key) DO NOTHING;

INSERT INTO add_on_types (key, label, description, config_schema) VALUES
  ('govcon', 'Government Contracting',
   'SAM.gov integration, contract tracking, GSA schedule support, compliance reporting',
   '{"agencyAlignment":{"type":"multiselect","label":"Target Agency Types","options":["Federal","State","Local","DoD","Civilian"],"required":false},"contractTypes":{"type":"multiselect","label":"Contract Types","options":["IDIQ","GWAC","BPA","FFP","T&M","Cost-Plus"],"required":false},"ueiRequired":{"type":"boolean","label":"SAM.gov UEI required","default":true},"naicsCodes":{"type":"text_array","label":"Primary NAICS Codes","required":false},"primeOrSub":{"type":"select","label":"Prime or Subcontractor","options":["prime","sub","both"],"required":false}}'::jsonb
  )
ON CONFLICT (key) DO UPDATE SET
  config_schema = EXCLUDED.config_schema,
  description = EXCLUDED.description;

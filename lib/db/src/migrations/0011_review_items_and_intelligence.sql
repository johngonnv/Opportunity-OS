-- Migration: Onboarding Review Items + Workspace Intelligence (Task #34)
-- Applied via direct SQL (Drizzle push blocked by schema drift)
-- Safe to run multiple times (all CREATE IF NOT EXISTS / ALTER ... IF NOT EXISTS)

-- ─── Review Item Enums ────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE onboarding_review_item_status AS ENUM ('PENDING', 'APPROVED', 'EDITED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ai_confidence_band AS ENUM ('HIGH', 'MEDIUM', 'LOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Provisioning Step Key: Add new values ────────────────────────────────────

ALTER TYPE provisioning_step_key ADD VALUE IF NOT EXISTS 'SEED_SAVED_VIEWS' AFTER 'SEED_TAGS';
ALTER TYPE provisioning_step_key ADD VALUE IF NOT EXISTS 'SEED_DEFAULT_TASKS' AFTER 'SEED_SAVED_VIEWS';
ALTER TYPE provisioning_step_key ADD VALUE IF NOT EXISTS 'SEED_ALERTS' AFTER 'SEED_DEFAULT_TASKS';

-- ─── onboarding_review_items ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS onboarding_review_items (
  id                   TEXT        PRIMARY KEY,
  session_id           TEXT        NOT NULL REFERENCES client_onboarding_sessions(id) ON DELETE CASCADE,
  group_key            TEXT        NOT NULL,
  item_key             TEXT        NOT NULL,
  label                TEXT        NOT NULL,
  suggested_value_json JSONB,
  final_value_json     JSONB,
  source_json          JSONB,
  confidence_band      ai_confidence_band NOT NULL DEFAULT 'MEDIUM',
  confidence_score     NUMERIC,
  status               onboarding_review_item_status NOT NULL DEFAULT 'PENDING',
  rejection_reason     TEXT,
  is_required          BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order           INTEGER     NOT NULL DEFAULT 0,
  reviewed_by_user_id  TEXT        REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_review_items_session_item_key
  ON onboarding_review_items (session_id, group_key, item_key);

-- ─── onboarding_review_item_audit_log ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS onboarding_review_item_audit_log (
  id                    TEXT        PRIMARY KEY,
  session_id            TEXT        NOT NULL,
  item_id               TEXT        NOT NULL,
  old_status            TEXT,
  new_status            TEXT        NOT NULL,
  old_final_value_json  JSONB,
  new_final_value_json  JSONB,
  action_type           TEXT        NOT NULL,
  acted_by_user_id      TEXT        NOT NULL,
  acted_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_review_item_audit_log_item_id
  ON onboarding_review_item_audit_log (item_id);

CREATE INDEX IF NOT EXISTS onboarding_review_item_audit_log_session_id
  ON onboarding_review_item_audit_log (session_id);

-- ─── workspace_intelligence ───────────────────────────────────────────────────
-- Stores seeded intelligence from reviewed onboarding outputs:
-- saved views, default tasks, and alert configurations per workspace.

CREATE TABLE IF NOT EXISTS workspace_intelligence (
  id           TEXT        PRIMARY KEY,
  workspace_id TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind         TEXT        NOT NULL, -- 'saved_view' | 'default_task' | 'alert'
  key          TEXT        NOT NULL,
  label        TEXT        NOT NULL,
  severity     TEXT,                 -- for alerts: 'HIGH' | 'MEDIUM' | 'LOW'
  data         JSONB       NOT NULL DEFAULT '{}',
  source       TEXT        NOT NULL DEFAULT 'onboarding', -- origin of the seed
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_intelligence_workspace_kind_key
  ON workspace_intelligence (workspace_id, kind, key);

CREATE INDEX IF NOT EXISTS workspace_intelligence_workspace_id
  ON workspace_intelligence (workspace_id);

CREATE INDEX IF NOT EXISTS workspace_intelligence_kind
  ON workspace_intelligence (workspace_id, kind);

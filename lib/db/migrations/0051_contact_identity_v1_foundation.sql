-- Contact Identity v1 Foundation
-- Idempotent: safe to re-apply.
-- See .local/tasks/contact-identity-v1-decisions.md and
-- .local/tasks/contact-identity-v1-foundation.md for full context.

-- ─── 1. Soft-delete columns on the four primary identity tables ──────────────
ALTER TABLE contacts              ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE master_contacts       ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE organizations         ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE master_organizations  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ─── 2. Normalized phone + identity fingerprint ──────────────────────────────
ALTER TABLE contacts              ADD COLUMN IF NOT EXISTS normalized_phone text;
ALTER TABLE master_contacts       ADD COLUMN IF NOT EXISTS normalized_phone text;
ALTER TABLE master_contacts       ADD COLUMN IF NOT EXISTS identity_fingerprint text;

-- ─── 3. New enums for channels / merge / employment ──────────────────────────
DO $$ BEGIN
  CREATE TYPE contact_channel_kind AS ENUM ('EMAIL', 'PHONE', 'SOCIAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contact_channel_label AS ENUM ('WORK', 'PERSONAL', 'MOBILE', 'HOME');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE master_merge_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE master_merge_entity_type AS ENUM ('CONTACT', 'ORG');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 4. contact_channels ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_channels (
  id                  text PRIMARY KEY,
  contact_id          text REFERENCES contacts(id) ON DELETE CASCADE,
  master_contact_id   text REFERENCES master_contacts(id) ON DELETE CASCADE,
  kind                contact_channel_kind NOT NULL,
  label               contact_channel_label NOT NULL,
  value               text NOT NULL,
  normalized_value    text NOT NULL,
  is_primary          boolean NOT NULL DEFAULT false,
  verified_at         timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_channels_owner_chk CHECK (
    (contact_id IS NOT NULL AND master_contact_id IS NULL)
    OR (contact_id IS NULL AND master_contact_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS contact_channels_contact_idx
  ON contact_channels (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_channels_master_idx
  ON contact_channels (master_contact_id) WHERE master_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_channels_norm_idx
  ON contact_channels (kind, normalized_value);

-- ─── 5. master_contact_employment_log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_contact_employment_log (
  id                            text PRIMARY KEY,
  master_contact_id             text NOT NULL REFERENCES master_contacts(id) ON DELETE CASCADE,
  previous_master_organization_id text REFERENCES master_organizations(id) ON DELETE SET NULL,
  new_master_organization_id    text REFERENCES master_organizations(id) ON DELETE SET NULL,
  previous_title                text,
  new_title                     text,
  previous_department           text,
  new_department                text,
  changed_by_user_id            text REFERENCES users(id) ON DELETE SET NULL,
  change_source                 text NOT NULL DEFAULT 'ADMIN_UPDATE',
  notes                         text,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS master_contact_employment_log_master_idx
  ON master_contact_employment_log (master_contact_id, created_at DESC);

-- ─── 6. master_merge_queue ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_merge_queue (
  id                  text PRIMARY KEY,
  entity_type         master_merge_entity_type NOT NULL,
  primary_id          text NOT NULL,
  duplicate_id        text NOT NULL,
  match_signal        text NOT NULL,
  confidence_score    double precision NOT NULL DEFAULT 0.5,
  status              master_merge_status NOT NULL DEFAULT 'PENDING',
  detected_by         text NOT NULL DEFAULT 'SYSTEM',
  resolved_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  resolved_at         timestamptz,
  rejection_reason    text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS master_merge_queue_status_idx ON master_merge_queue (status, created_at DESC);
CREATE INDEX IF NOT EXISTS master_merge_queue_pair_idx ON master_merge_queue (entity_type, primary_id, duplicate_id);

-- ─── 7. Backfill normalized_phone (use the same regex as phoneNormalization) ─
-- Strip non-digits; if exactly 10 digits → +1XXXXXXXXXX; if 11 digits starting with 1 → +1XXXXXXXXXX; else +<digits>.
UPDATE contacts SET normalized_phone = (
  WITH d AS (SELECT regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') AS digits)
  SELECT CASE
    WHEN d.digits = '' THEN NULL
    WHEN length(d.digits) = 10 THEN '+1' || d.digits
    WHEN length(d.digits) = 11 AND substring(d.digits, 1, 1) = '1' THEN '+' || d.digits
    ELSE '+' || d.digits END FROM d
) WHERE normalized_phone IS NULL AND phone IS NOT NULL;

UPDATE master_contacts SET normalized_phone = (
  WITH d AS (SELECT regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') AS digits)
  SELECT CASE
    WHEN d.digits = '' THEN NULL
    WHEN length(d.digits) = 10 THEN '+1' || d.digits
    WHEN length(d.digits) = 11 AND substring(d.digits, 1, 1) = '1' THEN '+' || d.digits
    ELSE '+' || d.digits END FROM d
) WHERE normalized_phone IS NULL AND phone IS NOT NULL;

-- ─── 8. Backfill identity_fingerprint on master_contacts ─────────────────────
-- Requires pgcrypto for digest(). Most Replit Postgres instances have it; create extension if needed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE master_contacts SET identity_fingerprint = encode(
  digest(
    coalesce(lower(email), '') || ':' ||
    coalesce(normalized_phone, '') || ':' ||
    coalesce(master_organization_id, ''),
    'sha256'
  ),
  'hex'
) WHERE identity_fingerprint IS NULL;

CREATE INDEX IF NOT EXISTS master_contacts_fingerprint_idx
  ON master_contacts (identity_fingerprint) WHERE deleted_at IS NULL;

-- ─── 9. Backfill contact_channels from existing flat email/phone ─────────────
-- Workspace contacts: WORK label by default. Skip if a row already exists for (contact_id, kind, normalized_value).
INSERT INTO contact_channels (id, contact_id, kind, label, value, normalized_value, is_primary, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  c.id,
  'EMAIL'::contact_channel_kind,
  'WORK'::contact_channel_label,
  c.email,
  lower(c.email),
  true,
  now(),
  now()
FROM contacts c
WHERE c.email IS NOT NULL AND c.email <> ''
  AND NOT EXISTS (
    SELECT 1 FROM contact_channels cc
    WHERE cc.contact_id = c.id AND cc.kind = 'EMAIL' AND cc.normalized_value = lower(c.email)
  );

INSERT INTO contact_channels (id, contact_id, kind, label, value, normalized_value, is_primary, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  c.id,
  'PHONE'::contact_channel_kind,
  'WORK'::contact_channel_label,
  c.phone,
  c.normalized_phone,
  true,
  now(),
  now()
FROM contacts c
WHERE c.phone IS NOT NULL AND c.phone <> '' AND c.normalized_phone IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contact_channels cc
    WHERE cc.contact_id = c.id AND cc.kind = 'PHONE' AND cc.normalized_value = c.normalized_phone
  );

INSERT INTO contact_channels (id, contact_id, kind, label, value, normalized_value, is_primary, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  c.id,
  'PHONE'::contact_channel_kind,
  'MOBILE'::contact_channel_label,
  c.mobile,
  (WITH d AS (SELECT regexp_replace(c.mobile, '[^0-9]', '', 'g') AS digits)
   SELECT CASE
     WHEN d.digits = '' THEN NULL
     WHEN length(d.digits) = 10 THEN '+1' || d.digits
     WHEN length(d.digits) = 11 AND substring(d.digits, 1, 1) = '1' THEN '+' || d.digits
     ELSE '+' || d.digits END FROM d),
  false,
  now(),
  now()
FROM contacts c
WHERE c.mobile IS NOT NULL AND c.mobile <> ''
  AND NOT EXISTS (
    SELECT 1 FROM contact_channels cc
    WHERE cc.contact_id = c.id AND cc.kind = 'PHONE' AND cc.label = 'MOBILE'
  );

-- Master contacts: WORK channels (only WORK flows up).
INSERT INTO contact_channels (id, master_contact_id, kind, label, value, normalized_value, is_primary, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  mc.id,
  'EMAIL'::contact_channel_kind,
  'WORK'::contact_channel_label,
  mc.email,
  lower(mc.email),
  true,
  now(),
  now()
FROM master_contacts mc
WHERE mc.email IS NOT NULL AND mc.email <> ''
  AND NOT EXISTS (
    SELECT 1 FROM contact_channels cc
    WHERE cc.master_contact_id = mc.id AND cc.kind = 'EMAIL' AND cc.normalized_value = lower(mc.email)
  );

INSERT INTO contact_channels (id, master_contact_id, kind, label, value, normalized_value, is_primary, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  mc.id,
  'PHONE'::contact_channel_kind,
  'WORK'::contact_channel_label,
  mc.phone,
  mc.normalized_phone,
  true,
  now(),
  now()
FROM master_contacts mc
WHERE mc.phone IS NOT NULL AND mc.phone <> '' AND mc.normalized_phone IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contact_channels cc
    WHERE cc.master_contact_id = mc.id AND cc.kind = 'PHONE' AND cc.normalized_value = mc.normalized_phone
  );

-- ─── 10. Partial unique indexes (decisions §6) ───────────────────────────────
-- Pre-validation: before creating the unique indexes, scan for would-be
-- violators and ABORT the entire migration with a structured message that
-- lists the conflicting IDs. This guarantees we never silently fail at
-- CREATE UNIQUE INDEX time and gives operators an explicit list of rows to
-- merge or soft-delete before re-running this migration.
DO $$
DECLARE
  v_email_dups text;
  v_master_email_dups text;
  v_master_org_dups text;
BEGIN
  SELECT string_agg(format('workspace=%s email=%s ids=%s', workspace_id, lower(email), array_to_string(ids, ',')), '; ')
    INTO v_email_dups
  FROM (
    SELECT workspace_id, lower(email) AS email, array_agg(id ORDER BY created_at) AS ids
    FROM contacts
    WHERE deleted_at IS NULL AND email IS NOT NULL AND email <> ''
    GROUP BY workspace_id, lower(email)
    HAVING count(*) > 1
  ) t;
  IF v_email_dups IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 0051 prevalidation FAILED: contacts(workspace_id, lower(email)) duplicates exist. Resolve before re-running. Violators: %', v_email_dups;
  END IF;

  SELECT string_agg(format('master_org=%s email=%s ids=%s', master_organization_id, lower(email), array_to_string(ids, ',')), '; ')
    INTO v_master_email_dups
  FROM (
    SELECT master_organization_id, lower(email) AS email, array_agg(id ORDER BY created_at) AS ids
    FROM master_contacts
    WHERE deleted_at IS NULL AND email IS NOT NULL AND email <> '' AND master_organization_id IS NOT NULL
    GROUP BY master_organization_id, lower(email)
    HAVING count(*) > 1
  ) t;
  IF v_master_email_dups IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 0051 prevalidation FAILED: master_contacts(master_organization_id, lower(email)) duplicates exist. Violators: %', v_master_email_dups;
  END IF;

  SELECT string_agg(format('normalized_name=%s domain=%s ids=%s', normalized_name, domain_key, array_to_string(ids, ',')), '; ')
    INTO v_master_org_dups
  FROM (
    SELECT normalized_name, coalesce(website_domain, '') AS domain_key, array_agg(id ORDER BY created_at) AS ids
    FROM master_organizations
    WHERE deleted_at IS NULL
    GROUP BY normalized_name, coalesce(website_domain, '')
    HAVING count(*) > 1
  ) t;
  IF v_master_org_dups IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 0051 prevalidation FAILED: master_organizations(normalized_name, coalesce(website_domain, "")) duplicates exist. Violators: %', v_master_org_dups;
  END IF;
END $$;

-- The CREATE UNIQUE INDEX statements below are still gated on deleted_at IS
-- NULL so soft-deleted rows are not constrained.

CREATE UNIQUE INDEX IF NOT EXISTS contacts_workspace_email_uniq
  ON contacts (workspace_id, lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL AND email <> '';

-- DRIFT (decisions §6): phone is NOT unique per workspace because legitimate
-- shared-office-phone cases exist (e.g. multiple doctors at one front desk,
-- EMS dispatchers on one line). Decisions §2 already routes phone-only
-- matches to the admin review queue. We replace the unique with a lookup
-- index used by the duplicate detector that enqueues to master_merge_queue.
CREATE INDEX IF NOT EXISTS contacts_workspace_phone_idx
  ON contacts (workspace_id, normalized_phone)
  WHERE deleted_at IS NULL AND normalized_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS master_contacts_org_email_uniq
  ON master_contacts (master_organization_id, lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS master_organizations_name_domain_uniq
  ON master_organizations (normalized_name, coalesce(website_domain, ''))
  WHERE deleted_at IS NULL;

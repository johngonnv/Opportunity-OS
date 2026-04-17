-- Commissions v1 add-ons: revenue mode, source type, rep snapshot, split percent
-- All idempotent so it can be re-applied safely.

-- 1. New enums
DO $$ BEGIN
  CREATE TYPE commission_revenue_mode AS ENUM ('ACTUAL', 'MODELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE commission_source_type AS ENUM ('EMS_AUTO', 'MANUAL_EVENT', 'MANUAL_EDU', 'MANUAL_GOV');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ledger: revenue mode, gross, cost
ALTER TABLE facility_net_revenue_ledger
  ADD COLUMN IF NOT EXISTS gross_revenue double precision,
  ADD COLUMN IF NOT EXISTS cost_amount double precision,
  ADD COLUMN IF NOT EXISTS revenue_mode commission_revenue_mode NOT NULL DEFAULT 'ACTUAL';

-- 3. Commission records: rep snapshot, split percent, source type
ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS owner_rep_snapshot_name text,
  ADD COLUMN IF NOT EXISTS commission_split_percent double precision NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS source_type commission_source_type;

-- 4. Backfill source_type for any existing rows based on line of service
UPDATE commission_records
SET source_type = CASE line_of_service
  WHEN 'EMS_INTERFACILITY' THEN 'EMS_AUTO'::commission_source_type
  WHEN 'EVENT_STAFFING'    THEN 'MANUAL_EVENT'::commission_source_type
  WHEN 'EMT_PROGRAM'       THEN 'MANUAL_EDU'::commission_source_type
  WHEN 'GOVERNMENT'        THEN 'MANUAL_GOV'::commission_source_type
END
WHERE source_type IS NULL;

-- 5. Backfill owner_rep_snapshot_name from users table (best effort)
UPDATE commission_records cr
SET owner_rep_snapshot_name = TRIM(BOTH ' ' FROM COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))
FROM users u
WHERE cr.owner_rep_user_id = u.id
  AND (cr.owner_rep_snapshot_name IS NULL OR cr.owner_rep_snapshot_name = '');

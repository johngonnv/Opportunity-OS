-- Migration: Commissions v1 (Task #49)
-- Applied via executeSql at task execution time. Idempotent.

-- See lib/db/src/schema/commissions.ts for the canonical schema.
-- Tables: commission_rules, commission_periods, facility_net_revenue_ledger,
--         commission_records, commission_adjustments
-- Enums:  commission_line_of_service, commission_rate_type, commission_revenue_basis,
--         commission_status, commission_period_status
-- Also adds MANAGER value to existing workspace_role enum.

-- Adjustment lifecycle: adjustments are recorded as a NEW commission_record
-- (status=ADJUSTED) linked to the original via parent_record_id, plus an entry
-- in commission_adjustments for history. The original PAID record is preserved
-- for audit.
ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS parent_record_id varchar
  REFERENCES commission_records(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS commission_records_parent_idx
  ON commission_records(parent_record_id);

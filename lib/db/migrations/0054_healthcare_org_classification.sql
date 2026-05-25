-- Adds healthcare-specific clinical classification fields to organizations.
-- These columns are populated by the Grok facility-type classifier on:
--   1. Bulk import (analyze step, surfaced in the review table)
--   2. Single org creation (POST /organizations, fire-and-forget after insert)
--
-- All columns are nullable except the three boolean flags (default false) and
-- special_services (default empty array). classification_confidence is a
-- numeric decimal in the range 0.00–1.00.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS facility_type text,
  ADD COLUMN IF NOT EXISTS naics_code text,
  ADD COLUMN IF NOT EXISTS cms_designation text,
  ADD COLUMN IF NOT EXISTS cms_provider_number text,
  ADD COLUMN IF NOT EXISTS trauma_level text,
  ADD COLUMN IF NOT EXISTS teaching_hospital boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS medicare_certified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS medicaid_certified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bed_count integer,
  ADD COLUMN IF NOT EXISTS sub_type text,
  ADD COLUMN IF NOT EXISTS special_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS classification_confidence numeric;

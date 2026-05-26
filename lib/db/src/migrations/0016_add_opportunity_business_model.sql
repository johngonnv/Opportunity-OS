-- P2.2: Add better support for recurring vs project-based business models in the opportunity model.
-- Focus on industrial_services clients (e.g., water treatment recurring optimization contracts
-- vs one-time technical assessments/pilots/implementations).
-- Also adds renewal_date for recurring revenue tracking and renewal reminders (Apex-style).
--
-- Ties back to onboarding businessModel (recurring_services | project_based | hybrid | one_time)
-- so new industrial clients get appropriate defaults during provisioning.

-- Create the enum type (mirrors opportunity_business_model in opportunities schema)
DO $$ BEGIN
  CREATE TYPE opportunity_business_model AS ENUM ('RECURRING', 'PROJECT_BASED', 'HYBRID', 'ONE_TIME');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add columns to opportunities (nullable for backward compat; existing opps remain null/undifferentiated)
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS business_model opportunity_business_model;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS renewal_date timestamptz;

-- Optional: backfill examples for industrial (commented; run manually or via script if needed)
-- UPDATE opportunities o
-- JOIN organizations org ON o.organization_id = org.id
-- SET business_model = 'RECURRING'
-- WHERE o.business_model IS NULL
--   AND org.vertical = 'industrial_services'
--   AND (org.service_line_tags @> ARRAY['water_treatment_recurring']::text[] OR o.service_line_id IN (SELECT id FROM service_lines WHERE key LIKE '%recurring%'));

-- Index for common filters (list by business model, esp. for industrial dashboards)
CREATE INDEX IF NOT EXISTS idx_opportunities_business_model ON opportunities (business_model) WHERE business_model IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_renewal_date ON opportunities (renewal_date) WHERE renewal_date IS NOT NULL;

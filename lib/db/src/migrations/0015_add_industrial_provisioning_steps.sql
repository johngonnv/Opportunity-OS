-- Add new provisioning step keys for industrial_services vertical and service-line-driven pipeline configuration.
-- These steps enable non-healthcare (esp. water treatment / industrial) clients to receive
-- relevant default pipelines, saved views, and starter tasks during onboarding provisioning.

ALTER TYPE provisioning_step_key ADD VALUE IF NOT EXISTS 'APPLY_INDUSTRIAL_SERVICE_CONFIG' AFTER 'ENABLE_SERVICE_LINES';
ALTER TYPE provisioning_step_key ADD VALUE IF NOT EXISTS 'CONFIGURE_SERVICE_LINE_PIPELINES' AFTER 'APPLY_INDUSTRIAL_SERVICE_CONFIG';

-- Migration 0012: Add archived_at column to client_onboarding_sessions
-- Enables soft-archive (reversible hide) of onboarding sessions.
-- Hard delete is handled at the API layer (blocked if createdWorkspaceId is set).

ALTER TABLE client_onboarding_sessions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

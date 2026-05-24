CREATE TABLE IF NOT EXISTS "bulk_import_sessions" (
  "session_token" text PRIMARY KEY,
  "workspace_id"  text,
  "import_type"   text NOT NULL,
  "rows"          jsonb NOT NULL,
  "created_at"    timestamp NOT NULL DEFAULT now(),
  "expires_at"    timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "bulk_import_sessions_expires_at_idx" ON "bulk_import_sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "bulk_import_sessions_workspace_id_idx" ON "bulk_import_sessions" ("workspace_id");

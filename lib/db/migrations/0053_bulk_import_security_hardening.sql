-- Adds analyzed_at and seo_enriched_cache to bulk_import_sessions.
-- analyzed_at: set when /analyze runs for the first time; repeat calls return
--              the cached rows column instead of making a new AI request.
-- seo_enriched_cache: stores SEO enrichment results after the first /enrich?seo
--                     call; repeat calls return the cache without a new AI call.

ALTER TABLE "bulk_import_sessions"
  ADD COLUMN IF NOT EXISTS "analyzed_at"        timestamp,
  ADD COLUMN IF NOT EXISTS "seo_enriched_cache" jsonb;

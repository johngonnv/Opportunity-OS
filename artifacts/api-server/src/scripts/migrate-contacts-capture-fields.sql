-- Migration: Add phone_type enum and capture fields to contacts table
-- Applied: Task #45 - Unified Capture Pipeline
-- Idempotent: safe to run multiple times

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'phone_type_enum') THEN
    CREATE TYPE phone_type_enum AS ENUM ('work', 'personal');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'phone_type'
  ) THEN
    ALTER TABLE contacts ADD COLUMN phone_type phone_type_enum;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'is_independent'
  ) THEN
    ALTER TABLE contacts ADD COLUMN is_independent boolean NOT NULL DEFAULT false;
  END IF;
END $$;

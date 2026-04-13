/**
 * Create GovCon DB constraints not expressible in Drizzle table definitions.
 *
 * Run once after initial schema creation (or repeatedly — all statements are idempotent):
 *   pnpm --filter @workspace/db run setup:govcon-indexes
 *
 * Creates:
 *   1. uniq_org_primary_naics — partial unique index enforcing exactly one
 *      primary NAICS code per organization (is_primary = true)
 *   2. uniq_org_primary_psc — same for PSC
 *   3. uniq_naics_keyword — unique constraint on naics_keyword_map(keyword, naics_code)
 *      enabling idempotent upsert of keyword-to-code mappings
 */

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
  {
    name: "uniq_org_primary_naics (partial unique index)",
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_primary_naics
        ON organization_naics (organization_id)
        WHERE is_primary = true;
    `,
  },
  {
    name: "uniq_org_primary_psc (partial unique index)",
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_primary_psc
        ON organization_psc (organization_id)
        WHERE is_primary = true;
    `,
  },
  {
    name: "uniq_naics_keyword (unique constraint on keyword + naics_code)",
    sql: `
      DO $$ BEGIN
        ALTER TABLE naics_keyword_map
          ADD CONSTRAINT uniq_naics_keyword UNIQUE (keyword, naics_code);
      EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
      END $$;
    `,
  },
];

for (const stmt of statements) {
  process.stdout.write(`Creating ${stmt.name}... `);
  await pool.query(stmt.sql);
  console.log("done.");
}

console.log("All GovCon indexes/constraints applied.");
await pool.end();

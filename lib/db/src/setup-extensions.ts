/**
 * DB extension setup — run once before first use or as part of schema init.
 * Enables pg_trgm for fuzzy org-name similarity search in the structure scan pipeline.
 *
 * Usage:
 *   DATABASE_URL=<url> npx tsx lib/db/src/setup-extensions.ts
 */
import { db, pool } from "./index";
import { sql } from "drizzle-orm";

async function setup() {
  console.log("[SETUP] Enabling pg_trgm extension...");
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  console.log("[SETUP] pg_trgm enabled.");
  await pool.end();
}

setup().catch((err) => {
  console.error("[SETUP] Fatal:", err);
  process.exit(1);
});

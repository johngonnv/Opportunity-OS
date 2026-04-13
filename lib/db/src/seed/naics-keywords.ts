/**
 * Seed NAICS Keyword Map from 2022 NAICS Index File xlsx.
 *
 * Source:
 *   attached_assets/2022_NAICS_Index_File_*.xlsx
 *   Sheet: 2022NAICS
 *   Columns: NAICS22 (code), INDEX ITEM DESCRIPTION (keyword phrase)
 *
 * Usage: pnpm --filter @workspace/db run seed:naics-keywords
 *
 * NOTE: Run seed:naics first so naics_master is populated (FK validation).
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql, inArray } from "drizzle-orm";
import * as schema from "../schema/index.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const XLSX = (await import("xlsx")).default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "../../../../attached_assets");
const SOURCE_FILE = "2022_NAICS_Index_File_xlsx";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findAsset(prefix: string): string {
  const files = fs.readdirSync(ASSETS_DIR).filter(f => f.startsWith(prefix) && f.endsWith(".xlsx"));
  if (files.length === 0) throw new Error(`No file found with prefix: ${prefix}`);
  return path.join(ASSETS_DIR, files[0]);
}

// ---------------------------------------------------------------------------
// Load index file
// ---------------------------------------------------------------------------

const indexPath = findAsset("2022_NAICS_Index_File");
const wb = XLSX.readFile(indexPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];

console.log(`Loaded ${rows.length - 1} keyword rows from ${indexPath}`);

// Build raw keyword list: { keyword, naicsCode }
interface KwRow { keyword: string; naicsCode: string }
const rawRows: KwRow[] = [];

for (let i = 1; i < rows.length; i++) {
  const row = rows[i] as unknown[];
  const rawCode = row[0];
  const rawKeyword = row[1];
  if (!rawCode || !rawKeyword) continue;

  const code = String(rawCode).trim();
  if (isNaN(Number(code))) continue;

  const keyword = String(rawKeyword).toLowerCase().trim();
  if (!keyword) continue;

  rawRows.push({ keyword, naicsCode: code });
}

console.log(`  Parsed ${rawRows.length} keyword entries`);

// ---------------------------------------------------------------------------
// Validate codes against naics_master (only insert rows with valid codes)
// ---------------------------------------------------------------------------

const uniqueCodes = [...new Set(rawRows.map(r => r.naicsCode))];
console.log(`  Found ${uniqueCodes.length} unique NAICS codes in index file`);

// Load valid codes in batches
const validCodes = new Set<string>();
const CODE_BATCH = 500;
for (let i = 0; i < uniqueCodes.length; i += CODE_BATCH) {
  const batch = uniqueCodes.slice(i, i + CODE_BATCH);
  const found = await db
    .select({ code: schema.naicsMasterTable.code })
    .from(schema.naicsMasterTable)
    .where(inArray(schema.naicsMasterTable.code, batch));
  found.forEach(r => validCodes.add(r.code));
}
console.log(`  ${validCodes.size}/${uniqueCodes.length} codes found in naics_master`);

// Filter to only rows with valid codes
const validRows = rawRows.filter(r => validCodes.has(r.naicsCode));
console.log(`  ${validRows.length} keyword rows will be inserted`);

// Deduplicate by (keyword, naicsCode) pair
const deduped = new Map<string, KwRow>();
for (const r of validRows) {
  const key = `${r.naicsCode}|${r.keyword}`;
  if (!deduped.has(key)) deduped.set(key, r);
}
const finalRows = [...deduped.values()];
console.log(`  After dedup: ${finalRows.length} rows`);

// ---------------------------------------------------------------------------
// Batch upsert (keyed on keyword + naics_code — no natural PK, use id)
// ---------------------------------------------------------------------------

const BATCH = 300;
let inserted = 0;

for (let i = 0; i < finalRows.length; i += BATCH) {
  const batch = finalRows.slice(i, i + BATCH).map(r => ({
    id: crypto.randomUUID(),
    keyword: r.keyword,
    naicsCode: r.naicsCode,
    weight: "1.0",
    sourceFile: SOURCE_FILE,
  }));

  await db
    .insert(schema.naicsKeywordMapTable)
    .values(batch)
    .onConflictDoUpdate({
      target: [schema.naicsKeywordMapTable.keyword, schema.naicsKeywordMapTable.naicsCode],
      set: {
        weight: sql`excluded.weight`,
        sourceFile: sql`excluded.source_file`,
      },
    });
  inserted += batch.length;
  process.stdout.write(`\r  Upserted ${inserted}/${finalRows.length}...`);
}

console.log(`\nDone — naics_keyword_map has ${finalRows.length} rows.`);

await pool.end();

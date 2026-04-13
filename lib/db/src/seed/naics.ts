/**
 * Seed NAICS Master table from 2022 NAICS Excel source files.
 *
 * NAICS SCOPE:
 *   naics_master stores the FULL 2022 NAICS hierarchy — levels 2 through 6.
 *   This is required so that parent-child traversal (sector → subsector → industry group
 *   → industry → national industry) works via the `parent_code` chain.
 *
 *   Only 6-digit codes (level = 6) may be *assigned* to organizations via
 *   organization_naics. The `level` column identifies assignable codes:
 *     level 2 = Sector (e.g., "11")
 *     level 3 = Subsector (e.g., "111")
 *     level 4 = Industry Group (e.g., "1111")
 *     level 5 = NAICS Industry (e.g., "11111")
 *     level 6 = National Industry — the only codes assignable to orgs (e.g., "111110")
 *
 * Sources:
 *   attached_assets/6-digit_2022_Codes_*.xlsx   — 1,012 valid 6-digit leaf codes
 *   attached_assets/2022_NAICS_Structure_*.xlsx  — full hierarchy (2-6 digit codes, 2,122 rows)
 *   attached_assets/2022_NAICS_Descriptions_*.xlsx — descriptions by code
 *
 * Usage: pnpm --filter @workspace/db run seed:naics
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import * as schema from "../schema/index.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const XLSX = (await import("xlsx")).default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "../../../../attached_assets");
const SOURCE_FILE = "2022_NAICS_xlsx";

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

function normalizeCode(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/T+$/, "").trim();
  return s.length > 0 ? s : null;
}

function normalizeTitle(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim().replace(/T+\s*$/, "").trim();
}

function codeLevel(code: string): number {
  return code.length;
}

function parentCode(code: string): string | null {
  if (code.length <= 2) return null;
  return code.slice(0, code.length - 1);
}

function sectorCode(code: string): string {
  return code.slice(0, 2);
}

// ---------------------------------------------------------------------------
// Load data from xlsx files
// ---------------------------------------------------------------------------

console.log("Loading NAICS data from xlsx files...");

// 1. Load 6-digit codes (the valid assignable set)
const sixDigitPath = findAsset("6-digit_2022_Codes");
const wb6 = XLSX.readFile(sixDigitPath);
const ws6 = wb6.Sheets[wb6.SheetNames[0]];
const rows6 = XLSX.utils.sheet_to_json<unknown[]>(ws6, { header: 1 }) as unknown[][];
const validSixDigitCodes = new Set<string>();
for (let i = 1; i < rows6.length; i++) {
  const row = rows6[i] as unknown[];
  const code = normalizeCode(row[0]);
  if (code && code.length === 6 && !isNaN(Number(code))) {
    validSixDigitCodes.add(code);
  }
}
console.log(`  Found ${validSixDigitCodes.size} valid 6-digit NAICS codes`);

// 2. Load structure (all levels 2–6) for hierarchy
const structurePath = findAsset("2022_NAICS_Structure");
const wbStr = XLSX.readFile(structurePath);
const wsStr = wbStr.Sheets[wbStr.SheetNames[0]];
const rowsStr = XLSX.utils.sheet_to_json<unknown[]>(wsStr, { header: 1 }) as unknown[][];

// Structure rows: row[0]=change indicator, row[1]=code, row[2]=title  (header at row index 2)
const structureMap = new Map<string, { title: string }>();
for (let i = 3; i < rowsStr.length; i++) {
  const row = rowsStr[i] as unknown[];
  const code = normalizeCode(row[1]);
  if (!code || isNaN(Number(code))) continue;
  const title = normalizeTitle(row[2]);
  if (title) {
    structureMap.set(code, { title });
  }
}
console.log(`  Loaded ${structureMap.size} codes from structure file`);

// 3. Load descriptions
const descPath = findAsset("2022_NAICS_Descriptions");
const wbDesc = XLSX.readFile(descPath);
const wsDesc = wbDesc.Sheets[wbDesc.SheetNames[0]];
const rowsDesc = XLSX.utils.sheet_to_json<unknown[]>(wsDesc, { header: 1 }) as unknown[][];

const descMap = new Map<string, string>();
for (let i = 1; i < rowsDesc.length; i++) {
  const row = rowsDesc[i] as unknown[];
  const code = normalizeCode(row[0]);
  const desc = row[2] ? String(row[2]).trim() : null;
  if (code && desc) {
    descMap.set(code, desc);
  }
}
console.log(`  Loaded ${descMap.size} descriptions`);

// ---------------------------------------------------------------------------
// Build the upsert dataset — all codes from structure (2–6 digit)
// ---------------------------------------------------------------------------

interface NaicsRow {
  code: string;
  title: string;
  description: string | null;
  parentCode: string | null;
  level: number;
  sectorCode: string;
  sourceFile: string;
}

const rows: NaicsRow[] = [];
const seen = new Set<string>();

for (const [code, { title }] of structureMap) {
  if (seen.has(code)) continue;
  seen.add(code);
  rows.push({
    code,
    title,
    description: descMap.get(code) ?? null,
    parentCode: parentCode(code),
    level: codeLevel(code),
    sectorCode: sectorCode(code),
    sourceFile: SOURCE_FILE,
  });
}

console.log(`  Total rows to upsert: ${rows.length} (${validSixDigitCodes.size} are valid 6-digit assignable codes)`);

// ---------------------------------------------------------------------------
// Batch upsert
// ---------------------------------------------------------------------------

const BATCH = 200;
let inserted = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  await db
    .insert(schema.naicsMasterTable)
    .values(batch)
    .onConflictDoUpdate({
      target: schema.naicsMasterTable.code,
      set: {
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        parentCode: sql`excluded.parent_code`,
        level: sql`excluded.level`,
        sectorCode: sql`excluded.sector_code`,
        sourceFile: sql`excluded.source_file`,
        updatedAt: new Date(),
      },
    });
  inserted += batch.length;
  process.stdout.write(`\r  Upserted ${inserted}/${rows.length}...`);
}
console.log(`\nDone — naics_master has ${rows.length} rows.`);

await pool.end();

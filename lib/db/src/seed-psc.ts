/**
 * Seed PSC Master table from PSC April 2025 xlsx file.
 *
 * Source:
 *   attached_assets/PSC_April_2025_*.xlsx
 *   Sheet: "PSC for 042025"
 *
 * Columns mapped:
 *   PSC CODE → code
 *   PRODUCT AND SERVICE CODE NAME → name
 *   START DATE → start_date (Excel serial date)
 *   END DATE → end_date (Excel serial date)
 *   PRODUCT AND SERVICE CODE FULL NAME (DESCRIPTION) → full_description
 *   PRODUCT AND SERVICE CODE INCLUDES → includes_text
 *   PRODUCT AND SERVICE CODE EXCLUDES → excludes_text
 *   PRODUCT AND SERVICE CODE NOTES → notes_text
 *   Parent PSC Code → parent_psc_code
 *   PSC Category: Service (S)/Product (P) → service_or_product
 *   Level 1 Category Code → level_1_category_code
 *   Level 1 Category → level_1_category
 *   Level 2 Category Code → level_2_category_code
 *   Level 2 Category → level_2_category
 *
 * is_active = false when end_date is set and already expired.
 *
 * Usage: pnpm --filter @workspace/db run seed:psc
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const XLSX = (await import("xlsx")).default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "../../../attached_assets");
const SOURCE_FILE = "PSC_April_2025_xlsx";
const TARGET_SHEET = "PSC for 042025";

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

function toText(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  return String(val).trim() || null;
}

/**
 * Excel stores dates as numeric serial numbers (days since 1900-01-01).
 * Convert to ISO date string (YYYY-MM-DD).
 */
function excelDateToIso(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  if (isNaN(num)) return null;
  // XLSX.SSF.parse_date_code works well for this
  try {
    const d = XLSX.SSF.parse_date_code(num);
    const month = String(d.m).padStart(2, "0");
    const day = String(d.d).padStart(2, "0");
    return `${d.y}-${month}-${day}`;
  } catch {
    return null;
  }
}

const TODAY = new Date();

// ---------------------------------------------------------------------------
// Load PSC file
// ---------------------------------------------------------------------------

const pscPath = findAsset("PSC_April_2025");
const wb = XLSX.readFile(pscPath);

if (!wb.SheetNames.includes(TARGET_SHEET)) {
  throw new Error(`Sheet "${TARGET_SHEET}" not found. Available sheets: ${wb.SheetNames.join(", ")}`);
}

const ws = wb.Sheets[TARGET_SHEET];
const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];

console.log(`Loaded ${rows.length - 1} data rows from "${TARGET_SHEET}" sheet`);

// Column order (from header row):
// 0: PSC CODE
// 1: PRODUCT AND SERVICE CODE NAME
// 2: START DATE
// 3: END DATE
// 4: PRODUCT AND SERVICE CODE FULL NAME (DESCRIPTION)
// 5: PRODUCT AND SERVICE CODE INCLUDES
// 6: PRODUCT AND SERVICE CODE EXCLUDES
// 7: PRODUCT AND SERVICE CODE NOTES
// 8: Parent PSC Code
// 9: PSC Category: Service (S)/Product (P)
// 10: Level 1 Category Code
// 11: Level 1 Category
// 12: Level 2 Category Code
// 13: Level 2 Category

const headerRow = rows[0] as unknown[];
console.log("Header:", headerRow);

interface PscRow {
  code: string;
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  fullDescription: string | null;
  includesText: string | null;
  excludesText: string | null;
  notesText: string | null;
  parentPscCode: string | null;
  serviceOrProduct: string | null;
  level1CategoryCode: string | null;
  level1Category: string | null;
  level2CategoryCode: string | null;
  level2Category: string | null;
  isActive: boolean;
  sourceFile: string;
}

const parsedRows: PscRow[] = [];
const seenCodes = new Set<string>();

for (let i = 1; i < rows.length; i++) {
  const row = rows[i] as unknown[];
  const code = toText(row[0]);
  if (!code) continue;
  if (seenCodes.has(code)) continue;
  seenCodes.add(code);

  const endDate = excelDateToIso(row[3]);
  const isActive = !endDate || new Date(endDate) >= TODAY;

  parsedRows.push({
    code,
    name: toText(row[1]),
    startDate: excelDateToIso(row[2]),
    endDate,
    fullDescription: toText(row[4]),
    includesText: toText(row[5]),
    excludesText: toText(row[6]),
    notesText: toText(row[7]),
    parentPscCode: toText(row[8]),
    serviceOrProduct: toText(row[9]),
    level1CategoryCode: toText(row[10]),
    level1Category: toText(row[11]),
    level2CategoryCode: toText(row[12]),
    level2Category: toText(row[13]),
    isActive,
    sourceFile: SOURCE_FILE,
  });
}

console.log(`Parsed ${parsedRows.length} unique PSC codes`);
const inactiveCount = parsedRows.filter(r => !r.isActive).length;
console.log(`  ${inactiveCount} marked inactive (expired end_date)`);

// ---------------------------------------------------------------------------
// Batch upsert
// ---------------------------------------------------------------------------

const BATCH = 200;
let inserted = 0;

for (let i = 0; i < parsedRows.length; i += BATCH) {
  const batch = parsedRows.slice(i, i + BATCH);
  await db
    .insert(schema.pscMasterTable)
    .values(batch)
    .onConflictDoUpdate({
      target: schema.pscMasterTable.code,
      set: {
        name: schema.pscMasterTable.name,
        fullDescription: schema.pscMasterTable.fullDescription,
        includesText: schema.pscMasterTable.includesText,
        excludesText: schema.pscMasterTable.excludesText,
        notesText: schema.pscMasterTable.notesText,
        parentPscCode: schema.pscMasterTable.parentPscCode,
        serviceOrProduct: schema.pscMasterTable.serviceOrProduct,
        level1CategoryCode: schema.pscMasterTable.level1CategoryCode,
        level1Category: schema.pscMasterTable.level1Category,
        level2CategoryCode: schema.pscMasterTable.level2CategoryCode,
        level2Category: schema.pscMasterTable.level2Category,
        startDate: schema.pscMasterTable.startDate,
        endDate: schema.pscMasterTable.endDate,
        isActive: schema.pscMasterTable.isActive,
        updatedAt: new Date(),
      },
    });
  inserted += batch.length;
  process.stdout.write(`\r  Upserted ${inserted}/${parsedRows.length}...`);
}

console.log(`\nDone — psc_master has ${parsedRows.length} rows.`);

await pool.end();

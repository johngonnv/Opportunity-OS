import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { organizationsTable, contactsTable, bulkImportSessionsTable } from "@workspace/db";
import { and, eq, isNull, sql, lt } from "drizzle-orm";
import { getAiClient, GROK_DEFAULT_MODEL } from "../lib/aiProvider";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Scheduled cleanup: remove expired sessions every 5 minutes ────────────────

async function cleanExpiredSessions() {
  try {
    await db.delete(bulkImportSessionsTable).where(lt(bulkImportSessionsTable.expiresAt, new Date()));
  } catch {
    // non-fatal
  }
}

setInterval(cleanExpiredSessions, 5 * 60 * 1000);

// ── Row limits ────────────────────────────────────────────────────────────────
const MAX_ROWS = 500;

// ── Parse file buffer to rows ─────────────────────────────────────────────────
function parseFileToRows(buffer: Buffer, mimetype: string, originalname: string): Record<string, unknown>[] {
  const isExcel =
    mimetype.includes("spreadsheet") ||
    mimetype.includes("excel") ||
    originalname.toLowerCase().endsWith(".xlsx") ||
    originalname.toLowerCase().endsWith(".xls");

  const wb = isExcel
    ? XLSX.read(buffer, { type: "buffer" })
    : XLSX.read(buffer.toString("utf-8"), { type: "string" });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return rows.slice(0, MAX_ROWS);
}

// ── Grok prompts ──────────────────────────────────────────────────────────────

const ORG_FIELDS = `
{
  "name": "Facility/organization name — REQUIRED. If missing, set _rowStatus to 'error'.",
  "organizationType": "Best match from: HOSPITAL, HEALTH_SYSTEM, HOSPICE, HOME_HEALTH, GOVERNMENT_AGENCY, PRIME_CONTRACTOR, SUBCONTRACTOR, CONSULTANT, VENDOR, OTHER. Default OTHER.",
  "addressLine1": "Street address or null",
  "city": "City or null",
  "state": "2-letter US state code or null",
  "zip": "Zip/postal code as string or null",
  "country": "Country or null",
  "phone": "Phone number as string or null",
  "email": "Email address or null",
  "website": "Website URL or null",
  "latitude": "Latitude as number or null",
  "longitude": "Longitude as number or null",
  "notes": "Concatenate any unmapped/extra columns as 'ColumnName: value' pairs separated by newlines, or null"
}`;

const CONTACT_FIELDS = `
{
  "firstName": "First name or null",
  "lastName": "Last name or null",
  "fullName": "Full name — REQUIRED. If missing combine firstName+lastName. If still empty, set _rowStatus to 'error'.",
  "title": "Job title or null",
  "department": "Department or null",
  "email": "Email address or null",
  "phone": "Phone number as string or null",
  "organizationName": "Company/organization name or null",
  "notes": "Concatenate any unmapped/extra columns as 'ColumnName: value' pairs separated by newlines, or null"
}`;

function buildGrokPrompt(rows: Record<string, unknown>[], importType: "organizations" | "contacts"): string {
  const fields = importType === "organizations" ? ORG_FIELDS : CONTACT_FIELDS;
  const label = importType === "organizations" ? "Organizations/Facilities" : "Contacts";
  const sampleRows = rows.slice(0, 5);

  return `You are an expert data importer for a healthcare B2B CRM called Opportunity OS.

I have a spreadsheet with ${rows.length} rows of ${label} data. The column names may vary from standard names.

Here are the first few rows as a sample to understand the columns:
${JSON.stringify(sampleRows, null, 2)}

Map ALL ${rows.length} rows to this JSON structure:
${fields}

For each row also include:
- "_rowStatus": "ready" | "warning" | "error"
  - "ready": all important fields mapped successfully
  - "warning": name/fullName present but missing useful fields like address or phone
  - "error": required field (name/fullName) is missing or empty
- "_rowIssues": array of human-readable strings describing problems, or empty array

Here are all ${rows.length} rows to process:
${JSON.stringify(rows, null, 2)}

Return ONLY a valid JSON array — no markdown, no code blocks, no explanation. Just the raw JSON array.`;
}

// ── POST /bulk-import/upload ──────────────────────────────────────────────────

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }

    const importType = req.body.importType as "organizations" | "contacts" | undefined;
    if (!importType || !["organizations", "contacts"].includes(importType)) {
      res.status(400).json({ error: "importType must be 'organizations' or 'contacts'." });
      return;
    }

    const rows = parseFileToRows(file.buffer, file.mimetype, file.originalname);
    if (rows.length === 0) {
      res.status(422).json({ error: "No data rows found in the file. Check that the file has a header row and data." });
      return;
    }

    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await db.insert(bulkImportSessionsTable).values({
      sessionToken,
      workspaceId: req.authWorkspace?.id ?? null,
      importType,
      rows,
      expiresAt,
    });

    res.json({
      sessionToken,
      rowCount: rows.length,
      truncated: rows.length === MAX_ROWS,
      sampleHeaders: rows[0] ? Object.keys(rows[0]) : [],
    });
  } catch (err: unknown) {
    req.log?.error({ err }, "[BULK-IMPORT] upload failed");
    res.status(500).json({ error: "Failed to parse file." });
  }
});

// ── POST /bulk-import/analyze ─────────────────────────────────────────────────

router.post("/analyze", async (req, res) => {
  try {
    const { sessionToken } = req.body as { sessionToken?: string };
    if (!sessionToken) {
      res.status(400).json({ error: "sessionToken is required." });
      return;
    }

    const workspaceId = req.authWorkspace?.id;

    const whereClause = and(
      eq(bulkImportSessionsTable.sessionToken, sessionToken),
      sql`${bulkImportSessionsTable.expiresAt} > now()`,
      // Scope to workspace when available; sessions uploaded without auth
      // (pre-login upload flows) store null and are accessible without scoping.
      workspaceId
        ? sql`(${bulkImportSessionsTable.workspaceId} = ${workspaceId} OR ${bulkImportSessionsTable.workspaceId} IS NULL)`
        : sql`1=1`,
    );

    const [session] = await db
      .select()
      .from(bulkImportSessionsTable)
      .where(whereClause)
      .limit(1);

    if (!session) {
      res.status(404).json({ error: "Session not found or expired. Please re-upload the file." });
      return;
    }

    const rows = session.rows as Record<string, unknown>[];
    const importType = session.importType as "organizations" | "contacts";
    const prompt = buildGrokPrompt(rows, importType);

    let ai: ReturnType<typeof getAiClient>;
    try {
      ai = getAiClient("grok");
    } catch {
      res.status(503).json({ error: "Grok AI is not configured. Please check the API key." });
      return;
    }

    const startMs = Date.now();
    const completion = await ai.client.chat.completions.create({
      model: GROK_DEFAULT_MODEL,
      max_tokens: 16000,
      messages: [
        {
          role: "system",
          content: "You are an expert data importer. Return ONLY valid JSON arrays — no markdown, no explanation.",
        },
        { role: "user", content: prompt },
      ],
    });

    const rawText = completion.choices[0]?.message?.content ?? "[]";
    const latencyMs = Date.now() - startMs;

    let mappedRows: Record<string, unknown>[] = [];
    try {
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) {
        mappedRows = JSON.parse(match[0]);
      }
    } catch {
      res.status(422).json({ error: "Grok returned invalid JSON. Please try re-processing." });
      return;
    }

    if (!Array.isArray(mappedRows)) {
      res.status(422).json({ error: "Grok response was not an array. Please try re-processing." });
      return;
    }

    const ready = mappedRows.filter((r) => r._rowStatus === "ready").length;
    const warnings = mappedRows.filter((r) => r._rowStatus === "warning").length;
    const errors = mappedRows.filter((r) => r._rowStatus === "error").length;

    // Refresh the TTL so the session stays alive through review + commit
    await db
      .update(bulkImportSessionsTable)
      .set({ expiresAt: new Date(Date.now() + 30 * 60 * 1000) })
      .where(eq(bulkImportSessionsTable.sessionToken, sessionToken));

    req.log?.info({ importType, rowCount: mappedRows.length, ready, warnings, errors, latencyMs }, "[BULK-IMPORT] analyze complete");

    res.json({
      sessionToken,
      importType,
      totalRows: mappedRows.length,
      ready,
      warnings,
      errors,
      rows: mappedRows,
    });
  } catch (err: unknown) {
    req.log?.error({ err }, "[BULK-IMPORT] analyze failed");
    const msg = err instanceof Error ? err.message : "Analysis failed";
    res.status(500).json({ error: `Grok analysis failed: ${msg}` });
  }
});

// ── POST /bulk-import/commit ──────────────────────────────────────────────────

router.post("/commit", async (req, res) => {
  try {
    const workspaceId = req.authWorkspace?.id;
    if (!workspaceId) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }

    const { sessionToken, importType: bodyImportType, rows: bodyRows } = req.body as {
      sessionToken?: string;
      importType?: string;
      rows?: Record<string, unknown>[];
    };

    if (!sessionToken) {
      res.status(400).json({ error: "sessionToken is required." });
      return;
    }

    // Validate session exists, is not expired, and belongs to this workspace.
    // The session token is used as an auth check; the actual rows to commit
    // come from the client body (which holds AI-mapped + user-edited rows after review).
    const [session] = await db
      .select()
      .from(bulkImportSessionsTable)
      .where(
        and(
          eq(bulkImportSessionsTable.sessionToken, sessionToken),
          sql`${bulkImportSessionsTable.expiresAt} > now()`,
          sql`(${bulkImportSessionsTable.workspaceId} = ${workspaceId} OR ${bulkImportSessionsTable.workspaceId} IS NULL)`,
        ),
      )
      .limit(1);

    if (!session) {
      res.status(404).json({ error: "Session not found or expired. Please re-upload the file." });
      return;
    }

    const importType = (session.importType ?? bodyImportType) as "organizations" | "contacts";
    // Use client-supplied rows (AI-mapped + user-edited/excluded during review).
    // Fall back to raw session rows if client sends none.
    const rows: Record<string, unknown>[] = Array.isArray(bodyRows) && bodyRows.length > 0
      ? bodyRows
      : (session.rows as Record<string, unknown>[]);

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "No rows to import." });
      return;
    }

    let created = 0;
    let skipped = 0;
    const skippedDuplicates: { name: string; existingOrganizationId: string }[] = [];
    const errors: string[] = [];

    if (importType === "organizations") {
      for (const row of rows) {
        const name = (row.name as string | undefined)?.trim();
        if (!name) { skipped++; continue; }
        try {
          const existing = await db
            .select({ id: organizationsTable.id })
            .from(organizationsTable)
            .where(
              and(
                eq(organizationsTable.workspaceId, workspaceId),
                sql`lower(${organizationsTable.name}) = lower(${name})`,
                isNull(organizationsTable.deletedAt),
              ),
            )
            .limit(1);

          if (existing.length > 0) {
            skippedDuplicates.push({ name, existingOrganizationId: existing[0]!.id });
            skipped++;
            continue;
          }

          await db.insert(organizationsTable).values({
            workspaceId,
            name,
            organizationType: (row.organizationType as string | undefined) ?? "OTHER",
            addressLine1: (row.addressLine1 as string | undefined) || undefined,
            city: (row.city as string | undefined) || undefined,
            state: (row.state as string | undefined) || undefined,
            zip: (row.zip as string | undefined) || undefined,
            country: (row.country as string | undefined) || undefined,
            phone: (row.phone as string | undefined) || undefined,
            email: (row.email as string | undefined) || undefined,
            website: (row.website as string | undefined) || undefined,
            latitude: typeof row.latitude === "number" ? row.latitude : undefined,
            longitude: typeof row.longitude === "number" ? row.longitude : undefined,
            notesText: (row.notes as string | undefined) || undefined,
          } as typeof organizationsTable.$inferInsert);
          created++;
        } catch (e: unknown) {
          errors.push(`Row "${name}": ${e instanceof Error ? e.message : "insert failed"}`);
        }
      }
    } else {
      for (const row of rows) {
        const firstName = (row.firstName as string | undefined)?.trim();
        const lastName = (row.lastName as string | undefined)?.trim();
        const fullName = ((row.fullName as string | undefined)?.trim()) ||
          [firstName, lastName].filter(Boolean).join(" ");
        if (!fullName) { skipped++; continue; }
        try {
          await db.insert(contactsTable).values({
            workspaceId,
            fullName,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            title: (row.title as string | undefined) || undefined,
            department: (row.department as string | undefined) || undefined,
            email: (row.email as string | undefined) || undefined,
            phone: (row.phone as string | undefined) || undefined,
            notesText: [
              row.organizationName ? `Organization: ${row.organizationName}` : null,
              row.notes,
            ].filter(Boolean).join("\n") || undefined,
            source: "bulk_import",
            status: "NEW",
          } as typeof contactsTable.$inferInsert);
          created++;
        } catch (e: unknown) {
          errors.push(`Row "${fullName}": ${e instanceof Error ? e.message : "insert failed"}`);
        }
      }
    }

    // Delete the session after a successful commit to prevent replay
    try {
      await db.delete(bulkImportSessionsTable).where(eq(bulkImportSessionsTable.sessionToken, sessionToken));
    } catch {
      // non-fatal — TTL cleanup will catch it
    }

    req.log?.info({ importType, created, skipped, duplicates: skippedDuplicates.length, errors: errors.length }, "[BULK-IMPORT] commit complete");

    res.json({ created, skipped, skippedDuplicates, errors: errors.length, errorDetails: errors.slice(0, 20) });
  } catch (err: unknown) {
    req.log?.error({ err }, "[BULK-IMPORT] commit failed");
    res.status(500).json({ error: "Commit failed." });
  }
});

// ── GET /bulk-import/template/:type ──────────────────────────────────────────

router.get("/template/:type", (req, res) => {
  const { type } = req.params;

  if (type === "organizations") {
    const rows = [
      ["Facility Name", "Type", "Address", "City", "State", "Zip", "Country", "Phone", "Email", "Website", "Notes"],
      ["St. Mary's Hospital", "HOSPITAL", "123 Main St", "Las Vegas", "NV", "89101", "USA", "702-555-0100", "info@stmarys.com", "https://stmarys.com", ""],
      ["Valley Health System", "HEALTH_SYSTEM", "456 Oak Ave", "Henderson", "NV", "89002", "USA", "702-555-0200", "contact@valley.com", "https://valley.com", "Tier 1 account"],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="organizations_template.csv"');
    res.send(csv);
  } else if (type === "contacts") {
    const rows = [
      ["First Name", "Last Name", "Title", "Department", "Email", "Phone", "Company", "Notes"],
      ["Jane", "Smith", "Director of Case Management", "Case Management", "jane.smith@hospital.com", "702-555-0300", "St. Mary's Hospital", ""],
      ["John", "Doe", "VP of Operations", "Administration", "john.doe@valley.com", "702-555-0400", "Valley Health System", "Key decision maker"],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="contacts_template.csv"');
    res.send(csv);
  } else {
    res.status(400).json({ error: "type must be 'organizations' or 'contacts'" });
  }
});

export default router;

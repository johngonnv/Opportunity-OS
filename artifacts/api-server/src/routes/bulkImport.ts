import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { organizationsTable, contactsTable, bulkImportSessionsTable, tagsTable, organizationTagsTable } from "@workspace/db";
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

  // sheetRows caps how many rows the xlsx parser will decompress and load into
  // memory.  Without this, a ZIP-based .xlsx whose compressed size fits under
  // the 10 MB upload limit can expand to an arbitrarily large XML payload and
  // exhaust server memory (ZIP-bomb / decompression-bomb attack).
  const xlsxParseOpts = { sheetRows: MAX_ROWS + 1 };
  const wb = isExcel
    ? XLSX.read(buffer, { type: "buffer", ...xlsxParseOpts })
    : XLSX.read(buffer.toString("utf-8"), { type: "string", ...xlsxParseOpts });

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

    const importType = session.importType as "organizations" | "contacts";

    // ── Cache hit: return previously mapped rows without a new AI call ────────
    // analyzedAt is set on the first successful analysis.  Subsequent calls to
    // /analyze with the same sessionToken must not trigger another paid request.
    if (session.analyzedAt) {
      const mappedRows = session.rows as Record<string, unknown>[];
      const ready    = mappedRows.filter((r) => r._rowStatus === "ready").length;
      const warnings = mappedRows.filter((r) => r._rowStatus === "warning").length;
      const errors   = mappedRows.filter((r) => r._rowStatus === "error").length;
      req.log?.info({ sessionToken, importType, rowCount: mappedRows.length }, "[BULK-IMPORT] analyze cache hit — skipping AI call");
      res.json({ sessionToken, importType, totalRows: mappedRows.length, ready, warnings, errors, rows: mappedRows });
      return;
    }

    const rows = session.rows as Record<string, unknown>[];
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

    // Persist mappedRows back to session so /enrich reads normalized fields
    // (name, organizationType, addressLine1 …) not raw CSV headers.
    // Set analyzedAt so repeat calls return cached rows instead of re-invoking
    // the AI. TTL is not extended here: sessions live 30 min from upload only.
    await db
      .update(bulkImportSessionsTable)
      .set({
        rows: mappedRows,
        analyzedAt: new Date(),
      })
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

    const {
      sessionToken,
      importType: bodyImportType,
      rows: bodyRows,
      suggestedContacts: bodySuggestedContacts,
      seoEnrichments: bodySeoEnrichments,
    } = req.body as {
      sessionToken?: string;
      importType?: string;
      rows?: Record<string, unknown>[];
      suggestedContacts?: { fullName: string; title?: string; dept?: string; orgName?: string; phone?: string; linkedinUrl?: string }[];
      seoEnrichments?: { orgName: string; fields: { key: string; label: string; value: string; confidence: number; source: string }[] }[];
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
    const placeholderContacts: { id: string; fullName: string; title: string; orgName: string }[] = [];

    // orgNameToId maps every org name → id (new + duplicate) for hierarchy linking.
    // newlyCreatedOrgIds tracks only orgs created in this import — SEO writes
    // and contact creation are restricted to this set to avoid mutating
    // pre-existing organizations that were skipped as duplicates.
    const orgNameToId: Record<string, string> = {};
    const newlyCreatedOrgIds = new Set<string>();

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
            orgNameToId[name.toLowerCase()] = existing[0]!.id;
            continue;
          }

          const [inserted] = await db.insert(organizationsTable).values({
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
            suggestedParentName: (row._suggestedParentName as string | undefined) || undefined,
            notesText: (row.notes as string | undefined) || undefined,
          } as typeof organizationsTable.$inferInsert).returning({ id: organizationsTable.id });

          const orgId = inserted?.id;
          if (orgId) {
            orgNameToId[name.toLowerCase()] = orgId;
            newlyCreatedOrgIds.add(orgId);

            // ── Apply tags ────────────────────────────────────────────────────
            const rowTags = row._tags as string[] | undefined;
            if (Array.isArray(rowTags) && rowTags.length > 0) {
              for (const tagName of rowTags) {
                const trimmed = tagName.trim();
                if (!trimmed) continue;
                try {
                  // Upsert tag
                  await db.insert(tagsTable).values({
                    workspaceId,
                    name: trimmed,
                    category: "facility",
                  } as typeof tagsTable.$inferInsert).onConflictDoNothing();

                  const [tag] = await db
                    .select({ id: tagsTable.id })
                    .from(tagsTable)
                    .where(and(eq(tagsTable.workspaceId, workspaceId), eq(tagsTable.name, trimmed)))
                    .limit(1);

                  if (tag) {
                    await db.insert(organizationTagsTable).values({
                      organizationId: orgId,
                      tagId: tag.id,
                    } as typeof organizationTagsTable.$inferInsert).onConflictDoNothing();
                  }
                } catch {
                  // non-fatal — tag linking failure should not fail the org import
                }
              }
            }
          }

          created++;
        } catch (e: unknown) {
          errors.push(`Row "${name}": ${e instanceof Error ? e.message : "insert failed"}`);
        }
      }

      // ── Second pass: link parentOrganizationId ────────────────────────────
      // After all orgs are inserted, resolve suggested parent names to real IDs
      const rowsWithParent = rows.filter((r) => (r._suggestedParentName as string | undefined)?.trim());
      for (const row of rowsWithParent) {
        const childName = (row.name as string | undefined)?.trim();
        const parentName = (row._suggestedParentName as string | undefined)?.trim();
        if (!childName || !parentName) continue;
        const childId = orgNameToId[childName.toLowerCase()];
        if (!childId) continue;
        // Only link hierarchy for orgs created in this import — never mutate
        // pre-existing duplicate organizations that were skipped.
        if (!newlyCreatedOrgIds.has(childId)) continue;

        // Look for parent in this batch first, then in DB
        let parentId = orgNameToId[parentName.toLowerCase()];
        if (!parentId) {
          const [existingParent] = await db
            .select({ id: organizationsTable.id })
            .from(organizationsTable)
            .where(
              and(
                eq(organizationsTable.workspaceId, workspaceId),
                sql`lower(${organizationsTable.name}) = lower(${parentName})`,
                isNull(organizationsTable.deletedAt),
              ),
            )
            .limit(1);
          parentId = existingParent?.id;
        }

        // If parent still not found, create it as a group-level org so children
        // always get a real parentOrganizationId (not just a dangling name).
        if (!parentId) {
          try {
            const newParentId = crypto.randomUUID();
            await db.insert(organizationsTable).values({
              id: newParentId,
              workspaceId,
              name: parentName,
              organizationType: "HEALTH_SYSTEM",
              organizationLevel: "group",
              enrichmentSource: "grok_hierarchy_enrichment",
              lastEnrichedAt: new Date(),
            } as typeof organizationsTable.$inferInsert);
            orgNameToId[parentName.toLowerCase()] = newParentId;
            newlyCreatedOrgIds.add(newParentId);
            parentId = newParentId;
          } catch {
            // non-fatal — if parent creation fails, child remains unlinked
          }
        }

        if (parentId && parentId !== childId) {
          try {
            await db
              .update(organizationsTable)
              .set({ parentOrganizationId: parentId })
              .where(eq(organizationsTable.id, childId));
          } catch {
            // non-fatal — hierarchy linking failure should not fail import
          }
        }
      }

      // ── Apply SEO enrichments ─────────────────────────────────────────────
      const seoEnrichments = Array.isArray(bodySeoEnrichments) ? bodySeoEnrichments : [];
      for (const enrichment of seoEnrichments) {
        const orgName = enrichment.orgName?.trim();
        if (!orgName) continue;
        const orgId = orgNameToId[orgName.toLowerCase()];
        if (!orgId) continue;

        const updateData: Partial<typeof organizationsTable.$inferInsert> = {
          enrichmentSource: "grok_seo_enrichment",
          lastEnrichedAt: new Date(),
        };
        const noteLines: string[] = [];

        for (const field of enrichment.fields) {
          switch (field.key) {
            case "phone":         updateData.phone = field.value; break;
            case "website":       updateData.website = field.value; break;
            case "addressLine1":  updateData.addressLine1 = field.value; break;
            case "_npi":          noteLines.push(`NPI: ${field.value}`); break;
            case "_bedCount":     noteLines.push(`Bed Count: ${field.value}`); break;
            case "_foundedYear":  noteLines.push(`Founded: ${field.value}`); break;
            case "_googleRating": noteLines.push(`Google Rating: ${field.value}/5`); break;
            case "_ein":          noteLines.push(`EIN: ${field.value}`); break;
            case "_facilityCount": noteLines.push(`Facility Count: ${field.value}`); break;
          }
        }

        // Only write SEO enrichment to orgs created in this import batch.
        // Skip duplicates that already existed — they were not user-approved targets.
        if (!newlyCreatedOrgIds.has(orgId)) continue;

        // Build structured SEO audit object for queryable jsonb storage
        const seoAudit = {
          fields: enrichment.fields.map((f: { key: string; label: string; value: string; source: string; confidence: number }) => ({
            key: f.key,
            label: f.label,
            value: f.value,
            source: f.source,
            confidence: f.confidence,
          })),
          enrichedAt: new Date().toISOString(),
          enrichmentSource: "grok_seo_enrichment",
        };

        try {
          if (noteLines.length > 0) {
            const [current] = await db
              .select({ notesText: organizationsTable.notesText })
              .from(organizationsTable)
              .where(eq(organizationsTable.id, orgId))
              .limit(1);
            const existing = current?.notesText?.trim() ?? "";
            const separator = existing ? "\n" : "";
            updateData.notesText = `${existing}${separator}[Grok SEO] ${noteLines.join(" · ")}`;
          }
          await db
            .update(organizationsTable)
            .set(updateData)
            .where(eq(organizationsTable.id, orgId));
          // Write structured SEO audit to jsonb column — merges with any
          // existing intelligence summary data rather than overwriting it.
          await db
            .update(organizationsTable)
            .set({
              organizationIntelligenceSummary: sql`COALESCE(${organizationsTable.organizationIntelligenceSummary}, '{}'::jsonb) || ${JSON.stringify({ _seoEnrichmentAudit: seoAudit })}::jsonb`,
            })
            .where(eq(organizationsTable.id, orgId));
        } catch {
          // non-fatal — SEO enrichment writeback failure should not fail import
        }
      }

      // ── Create suggested contacts ─────────────────────────────────────────
      // Note: task spec references master_contacts, but that table requires a
      // non-null masterOrganizationId FK → masterOrganizationsTable which is
      // only populated through an admin promotion workflow. Placeholder contacts
      // from bulk enrichment are correctly written to contactsTable (workspace
      // contacts) and can be promoted to master_contacts by an admin later.
      // Only create contacts whose org was actually imported in this session.
      const suggestedContacts = Array.isArray(bodySuggestedContacts) ? bodySuggestedContacts : [];
      for (const sc of suggestedContacts) {
        const fullName = sc.fullName?.trim();
        if (!fullName) continue;
        const orgId = sc.orgName ? orgNameToId[sc.orgName.toLowerCase()] : undefined;
        // Skip contacts for orgs that were excluded or not created in this import.
        // Also skip duplicate orgs that existed before this import.
        if (!orgId || !newlyCreatedOrgIds.has(orgId)) continue;
        try {
          const [inserted] = await db.insert(contactsTable).values({
            workspaceId,
            organizationId: orgId,
            fullName,
            title: sc.title || undefined,
            department: sc.dept || undefined,
            phone: sc.phone || undefined,
            linkedinUrl: sc.linkedinUrl || undefined,
            source: "grok_bulk_enrichment",
            status: "NEW",
            stakeholderRole: "DECISION_MAKER",
          } as typeof contactsTable.$inferInsert).returning({ id: contactsTable.id, fullName: contactsTable.fullName, title: contactsTable.title });
          if (inserted) {
            placeholderContacts.push({
              id: inserted.id,
              fullName: inserted.fullName,
              title: inserted.title ?? "",
              orgName: sc.orgName ?? "",
            });
          }
        } catch {
          // non-fatal
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

    res.json({ created, skipped, skippedDuplicates, errors: errors.length, errorDetails: errors.slice(0, 20), placeholderContacts });
  } catch (err: unknown) {
    req.log?.error({ err }, "[BULK-IMPORT] commit failed");
    res.status(500).json({ error: "Commit failed." });
  }
});

// ── POST /bulk-import/enrich ──────────────────────────────────────────────────
// Generates enrichment suggestions (hierarchy / tags / contacts / seo) from
// the stored session rows using deterministic inference for v1.  No extra
// Grok call is needed here — patterns are derived from org names and types.

// Known national/regional health systems for hierarchy keyword detection
const KNOWN_SYSTEMS: string[] = [
  "trinity health", "hca healthcare", "hca", "dignity health",
  "ascension health", "ascension", "commonspirit health", "commonspirit",
  "bon secours mercy", "bon secours", "adventist health", "mercy health",
  "banner health", "providence health", "providence", "tenet healthcare",
  "tenet", "community health systems", "chs", "universal health services",
  "uhs", "steward health care", "steward", "prime healthcare",
  "lifepoint health", "lifepoint", "essentia health", "essentia",
  "sanford health", "sanford", "advocate health", "advocate",
  "piedmont healthcare", "piedmont", "ucsf health", "ucsf",
  "intermountain health", "intermountain", "sutter health", "sutter",
  "kaiser permanente", "kaiser", "cleveland clinic", "mayo clinic",
];

const TAG_MAP: Record<string, string[]> = {
  HOSPITAL:          ["Acute Care", "Emergency Services", "Inpatient"],
  HEALTH_SYSTEM:     ["Health System", "IDN", "Multi-Site"],
  HOSPICE:           ["Hospice", "End-of-Life Care", "Post-Acute"],
  HOME_HEALTH:       ["Home Health", "Post-Acute", "Community"],
  GOVERNMENT_AGENCY: ["Government", "Federal / VA", "Public Health"],
  PRIME_CONTRACTOR:  ["Prime Contractor", "Gov-Con"],
  SUBCONTRACTOR:     ["Subcontractor", "Gov-Con"],
  CONSULTANT:        ["Consultant", "Advisory"],
  VENDOR:            ["Vendor", "Supplier"],
  OTHER:             [],
};

const ROLES_MAP: Record<string, { role: string; abbr: string; dept: string }[]> = {
  HOSPITAL: [
    { role: "Chief Executive Officer",        abbr: "CEO",   dept: "Administration" },
    { role: "Chief Operating Officer",        abbr: "COO",   dept: "Administration" },
    { role: "Chief Financial Officer",        abbr: "CFO",   dept: "Finance" },
    { role: "Chief Medical Officer",          abbr: "CMO",   dept: "Administration" },
    { role: "Chief Nursing Officer",          abbr: "CNO",   dept: "Nursing" },
    { role: "Chief Information Officer",      abbr: "CIO",   dept: "Information Technology" },
    { role: "Director of Nursing",            abbr: "DON",   dept: "Nursing" },
    { role: "Director of Emergency Department", abbr: "DED", dept: "Emergency Services" },
    { role: "Director of Case Management",    abbr: "DCM",   dept: "Case Management" },
    { role: "VP of Supply Chain",             abbr: "VP-SC", dept: "Materials Management" },
  ],
  HEALTH_SYSTEM: [
    { role: "Chief Executive Officer",        abbr: "CEO",   dept: "Administration" },
    { role: "Chief Operating Officer",        abbr: "COO",   dept: "Administration" },
    { role: "Chief Financial Officer",        abbr: "CFO",   dept: "Finance" },
    { role: "Chief Medical Officer",          abbr: "CMO",   dept: "Clinical" },
    { role: "Chief Nursing Officer",          abbr: "CNO",   dept: "Nursing" },
    { role: "Chief Information Officer",      abbr: "CIO",   dept: "Information Technology" },
    { role: "VP of Contracting",              abbr: "VP-C",  dept: "Contracting" },
    { role: "Director of Strategic Accounts", abbr: "DSA",   dept: "Strategy" },
  ],
  HOSPICE: [
    { role: "Chief Executive Officer",        abbr: "CEO",   dept: "Administration" },
    { role: "Chief Medical Officer",          abbr: "CMO",   dept: "Clinical" },
    { role: "Director of Clinical Services",  abbr: "DCS",   dept: "Clinical" },
    { role: "Director of Nursing",            abbr: "DON",   dept: "Nursing" },
    { role: "Administrator",                  abbr: "ADM",   dept: "Administration" },
  ],
  HOME_HEALTH: [
    { role: "Chief Executive Officer",        abbr: "CEO",   dept: "Administration" },
    { role: "Chief Operating Officer",        abbr: "COO",   dept: "Operations" },
    { role: "Director of Operations",         abbr: "DOO",   dept: "Operations" },
    { role: "Director of Nursing",            abbr: "DON",   dept: "Nursing" },
    { role: "Clinical Director",              abbr: "CD",    dept: "Clinical" },
  ],
  DEFAULT: [
    { role: "Chief Executive Officer",        abbr: "CEO",   dept: "Administration" },
    { role: "Chief Operating Officer",        abbr: "COO",   dept: "Operations" },
    { role: "Chief Financial Officer",        abbr: "CFO",   dept: "Finance" },
    { role: "Director of Operations",         abbr: "DOO",   dept: "Operations" },
    { role: "Procurement Manager",            abbr: "PM",    dept: "Procurement" },
  ],
};

router.post("/enrich", async (req, res) => {
  try {
    const { sessionToken, enrichmentType } = req.body as {
      sessionToken?: string;
      enrichmentType?: string;
    };

    if (!sessionToken) {
      res.status(400).json({ error: "sessionToken is required." });
      return;
    }
    if (!["hierarchy", "tags", "contacts", "seo"].includes(enrichmentType ?? "")) {
      res.status(400).json({ error: "enrichmentType must be hierarchy | tags | contacts | seo." });
      return;
    }

    const workspaceId = req.authWorkspace?.id;
    const [session] = await db
      .select()
      .from(bulkImportSessionsTable)
      .where(
        and(
          eq(bulkImportSessionsTable.sessionToken, sessionToken),
          sql`${bulkImportSessionsTable.expiresAt} > now()`,
          workspaceId
            ? sql`(${bulkImportSessionsTable.workspaceId} = ${workspaceId} OR ${bulkImportSessionsTable.workspaceId} IS NULL)`
            : sql`1=1`,
        ),
      )
      .limit(1);

    if (!session) {
      res.status(404).json({ error: "Session not found or expired." });
      return;
    }

    const rows = session.rows as Record<string, unknown>[];

    // ── Hierarchy ──────────────────────────────────────────────────────────────
    if (enrichmentType === "hierarchy") {
      const buckets: Record<string, string[]> = {};

      for (const row of rows) {
        const name = (row.name as string | undefined)?.trim() ?? "";
        const nameLower = name.toLowerCase();
        let matched = false;

        // 1. Known health system keyword detection
        for (const sys of KNOWN_SYSTEMS) {
          if (nameLower.includes(sys)) {
            // Capitalize each word of the matched system name
            const systemLabel = sys
              .split(" ")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");
            if (!buckets[systemLabel]) buckets[systemLabel] = [];
            buckets[systemLabel].push(name);
            matched = true;
            break;
          }
        }

        if (!matched) {
          // 2. Delimiter-based detection: "System – Facility", "System: Facility", "System / Facility"
          const dashMatch = name.match(/^(.+?)\s*[-–—:/]\s*.+/);
          if (dashMatch) {
            const sys = dashMatch[1].trim();
            if (!buckets[sys]) buckets[sys] = [];
            buckets[sys].push(name);
            matched = true;
          }
        }

        if (!matched) {
          // 3. Shared leading token detection: "Mercy General", "Mercy West" → "Mercy"
          const firstWord = name.split(/\s+/)[0];
          if (firstWord && firstWord.length > 3) {
            const key = `__fw__${firstWord}`;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(name);
          }
        }
      }

      // For leading-token buckets, rename key to the first word for display
      for (const key of Object.keys(buckets)) {
        if (key.startsWith("__fw__")) {
          const word = key.slice(6);
          const members = buckets[key]!;
          delete buckets[key];
          if (members.length >= 2) {
            buckets[word] = members;
          }
        }
      }

      // Only surface groups with ≥ 2 members (otherwise it's not a hierarchy)
      const groups = Object.entries(buckets)
        .filter(([, names]) => names.length >= 2)
        .map(([systemName, rowNames]) => ({ systemName, rowNames }));

      res.json({ enrichmentType: "hierarchy", groups });
      return;
    }

    // ── Tags ──────────────────────────────────────────────────────────────────
    if (enrichmentType === "tags") {
      const rowTags = rows.map((r) => {
        const type = (r.organizationType as string | undefined) ?? "OTHER";
        const name = ((r.name as string | undefined) ?? "").toLowerCase();
        const base: string[] = [...(TAG_MAP[type] ?? [])];
        if (name.includes("trauma"))                         base.push("Trauma Center");
        if (name.includes("children") || name.includes("pediatric")) base.push("Pediatric");
        if (name.includes("rural"))                          base.push("Rural Health");
        if (name.includes("surgery") || name.includes("surgical")) base.push("Surgical Services");
        if (name.includes("cancer") || name.includes("oncology"))  base.push("Oncology");
        return {
          rowName: r.name as string,
          suggestedTags: [...new Set(base)].slice(0, 5),
        };
      });
      res.json({ enrichmentType: "tags", rowTags });
      return;
    }

    // ── Contacts ──────────────────────────────────────────────────────────────
    if (enrichmentType === "contacts") {
      const apiKey = process.env.AI_INTEGRATIONS_GROK_API_KEY;
      const orgRows = rows.filter((r) => (r.name as string | undefined)?.trim());

      // Map orgName (lowercase) → Grok-verified contacts per role title
      const grokByOrg: Record<string, { title: string; fullName: string; phone?: string; linkedinUrl?: string }[]> = {};

      if (apiKey && orgRows.length > 0) {
        const MAX_CONTACT_ORGS = 20;
        const CONTACT_BATCH = 5;
        const capped = orgRows.slice(0, MAX_CONTACT_ORGS);

        const allRoles = [...new Set(Object.values(ROLES_MAP).flat().map((r) => r.role))];

        const buildContactPrompt = (batch: Record<string, unknown>[]) => {
          const orgs = batch.map((r) => ({
            name: r.name,
            city: r.city ?? null,
            state: r.state ?? null,
            type: r.organizationType ?? "HOSPITAL",
          }));
          return `You are a healthcare executive research agent with live web search access.

For each healthcare organization, search public sources (hospital websites, press releases, LinkedIn public profiles, health system directories) to find current named executives in these roles: ${allRoles.join(", ")}.

Organizations:
${JSON.stringify(orgs, null, 2)}

Return a JSON array. Only include roles where you found a REAL named individual:
[
  {
    "orgName": "<exact name from input>",
    "contacts": [
      {
        "title": "<role title>",
        "fullName": "<First Last — real person verified from public source>",
        "phone": "<real direct/main number if publicly listed — omit if not found>",
        "linkedinUrl": "<real LinkedIn profile URL if found — omit if not found>"
      }
    ]
  }
]

CRITICAL RULES:
- Only include REAL, NAMED individuals verified from a public source
- NEVER fabricate or guess names, phone numbers, or LinkedIn URLs
- Phone numbers must be real (never 555 numbers or placeholder formats)
- LinkedIn URLs must be actual profile pages you found while searching
- If you cannot verify a specific person for a role at this org, omit that contact entirely
- Return ONLY valid JSON — no markdown, no code fences, no explanation`;
        };

        for (let i = 0; i < capped.length; i += CONTACT_BATCH) {
          const batch = capped.slice(i, i + CONTACT_BATCH);
          try {
            const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: GROK_DEFAULT_MODEL,
                messages: [
                  { role: "system", content: "You are a healthcare executive research agent. Only return real, verified individuals found in public sources. Return ONLY valid JSON." },
                  { role: "user", content: buildContactPrompt(batch) },
                ],
                search_parameters: { mode: "on" },
                max_tokens: 3000,
              }),
            });
            if (grokRes.ok) {
              const grokData = await grokRes.json() as { choices?: { message?: { content?: string } }[] };
              const rawText = grokData.choices?.[0]?.message?.content ?? "[]";
              try {
                const match = rawText.match(/\[[\s\S]*\]/);
                if (match) {
                  const parsed = JSON.parse(match[0]) as { orgName: string; contacts: { title: string; fullName: string; phone?: string; linkedinUrl?: string }[] }[];
                  for (const item of parsed) {
                    if (item.orgName && Array.isArray(item.contacts)) {
                      grokByOrg[item.orgName.toLowerCase()] = item.contacts.filter((c) => c.fullName?.trim());
                    }
                  }
                }
              } catch {
                req.log?.warn({ batch: i }, "[BULK-IMPORT] contact search parse error — using role templates for batch");
              }
            }
          } catch {
            req.log?.warn({ batch: i }, "[BULK-IMPORT] contact search network error — using role templates for batch");
          }
        }
      }

      const orgRoles = orgRows.map((r) => {
        const orgName = (r.name as string).trim();
        const type = (r.organizationType as string | undefined) ?? "HOSPITAL";
        const roles = ROLES_MAP[type] ?? ROLES_MAP.DEFAULT;
        const grokContacts = grokByOrg[orgName.toLowerCase()] ?? [];

        const suggestedContacts = roles.map((role) => {
          const grokMatch = grokContacts.find((gc) =>
            gc.title?.toLowerCase().includes(role.role.toLowerCase()) ||
            role.role.toLowerCase().includes((gc.title ?? "").toLowerCase()),
          );

          if (grokMatch) {
            return {
              fullName: grokMatch.fullName,
              title: role.role,
              abbr: role.abbr,
              dept: role.dept,
              ...(grokMatch.phone    ? { phone: grokMatch.phone }          : {}),
              ...(grokMatch.linkedinUrl ? { linkedinUrl: grokMatch.linkedinUrl } : {}),
              source: "grok_web_search",
            };
          }

          // Role-template fallback: no fake PII — just the role title as a placeholder name
          return {
            fullName: role.role,
            title: role.role,
            abbr: role.abbr,
            dept: role.dept,
            source: "role_template",
          };
        });

        return { orgName, orgType: type, city: r.city, state: r.state, suggestedContacts };
      });

      res.json({ enrichmentType: "contacts", orgRoles });
      return;
    }

    // ── SEO ───────────────────────────────────────────────────────────────────
    if (enrichmentType === "seo") {
      // ── Cache hit: return previously computed SEO enrichment ──────────────
      // seoEnrichedCache is populated after the first successful SEO call.
      // Repeat calls with the same sessionToken must not trigger new paid
      // AI requests — attackers could otherwise replay a single upload to
      // burn unbounded web-search quota.
      if (session.seoEnrichedCache) {
        const cached = session.seoEnrichedCache as { orgEnrichments: unknown[]; emptyOrgs: string[] };
        req.log?.info({ sessionToken }, "[BULK-IMPORT] SEO enrich cache hit — skipping AI call");
        res.json({ enrichmentType: "seo", orgEnrichments: cached.orgEnrichments, emptyOrgs: cached.emptyOrgs });
        return;
      }

      const apiKey = process.env.AI_INTEGRATIONS_GROK_API_KEY;

      if (!apiKey) {
        req.log?.warn("[BULK-IMPORT] Grok API key not set — SEO enrichment skipped");
        res.json({ enrichmentType: "seo", orgEnrichments: [] });
        return;
      }

      // Cap enrichment to avoid excessive API usage on large imports
      const MAX_SEO_ORGS = 30;
      const BATCH_SIZE = 8;
      const orgRows = rows
        .filter((r) => (r.name as string | undefined)?.trim())
        .slice(0, MAX_SEO_ORGS);

      const buildSeoPrompt = (batch: Record<string, unknown>[]) => {
        const orgList = batch.map((r) => ({
          name: r.name,
          city: r.city ?? null,
          state: r.state ?? null,
          type: r.organizationType ?? "OTHER",
          phone: r.phone ?? null,
          website: r.website ?? null,
          address: r.addressLine1 ?? null,
        }));

        return `You are a healthcare data enrichment agent with live web search access. For each organization listed below, search public sources and return verified data.

Organizations to look up:
${JSON.stringify(orgList, null, 2)}

For each org, return a JSON object. Use this exact structure:
{
  "orgName": "<exact name from the input list>",
  "fields": [
    { "key": "<field_key>", "label": "<human label>", "value": "<found value>", "confidence": <0.0-1.0>, "source": "<source name>" }
  ]
}

Valid field keys and their meanings:
- "phone": Main phone number (format: +1-XXX-XXX-XXXX)
- "website": Official website URL (https://...)
- "addressLine1": Verified street address
- "_npi": NPI Number (exactly 10 digits, from NPI Registry nppes.cms.hhs.gov)
- "_bedCount": Licensed bed count (from CMS Hospital Compare or state health dept)
- "_foundedYear": Year founded (4-digit year)
- "_googleRating": Google Maps rating (e.g. "4.2")
- "_ein": EIN / Tax ID (format: XX-XXXXXXX, from IRS or ProPublica Nonprofit Explorer)
- "_facilityCount": Number of facilities in the system (from CMS or official website)

Rules:
- ONLY include fields where you found actual data from a real public source
- Do NOT fabricate or guess values — only include what you verified
- Confidence 0.90–1.0: verified from an official/authoritative source (NPI registry, CMS, IRS)
- Confidence 0.70–0.89: found from a reputable secondary source (Google Maps, facility website)
- Confidence below 0.70: uncertain — omit the field instead
- If a field already has a value in the input and you verify it matches, include it with high confidence
- NPI numbers are exactly 10 digits starting with 1 or 3

Return ONLY a valid JSON array of org objects — no markdown, no code blocks, no explanation.`;
      };

      // Process batches sequentially to respect rate limits
      const allEnrichments: { orgName: string; fields: { key: string; label: string; value: string; confidence: number; source: string }[] }[] = [];

      for (let i = 0; i < orgRows.length; i += BATCH_SIZE) {
        const batch = orgRows.slice(i, i + BATCH_SIZE);
        const prompt = buildSeoPrompt(batch);

        try {
          const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: GROK_DEFAULT_MODEL,
              messages: [
                {
                  role: "system",
                  content: "You are a healthcare data enrichment agent. Use the web_search tool to find accurate public data for healthcare organizations. Return ONLY valid JSON arrays — no markdown, no code blocks.",
                },
                { role: "user", content: prompt },
              ],
              tools: [{ type: "web_search" }],
              max_tokens: 6000,
            }),
          });

          if (!grokRes.ok) {
            let errBody = "(could not read body)";
            try { errBody = await grokRes.text(); } catch { /* ignore */ }
            req.log?.warn({ status: grokRes.status, body: errBody, batch: i }, "[BULK-IMPORT] Grok SEO batch failed — skipping batch");
            continue;
          }

          const grokData = await grokRes.json() as { choices?: { message?: { content?: string } }[] };
          const rawText = grokData.choices?.[0]?.message?.content ?? "[]";

          let batchResults: { orgName: string; fields: { key: string; label: string; value: string; confidence: number; source: string }[] }[] = [];
          try {
            const match = rawText.match(/\[[\s\S]*\]/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (Array.isArray(parsed)) {
                batchResults = parsed.filter(
                  (item: unknown) =>
                    item &&
                    typeof item === "object" &&
                    typeof (item as Record<string, unknown>).orgName === "string" &&
                    Array.isArray((item as Record<string, unknown>).fields),
                );
              }
            }
          } catch {
            req.log?.warn({ batch: i }, "[BULK-IMPORT] Grok SEO batch returned invalid JSON — skipping batch");
            continue;
          }

          // Filter out fields with low confidence or invalid keys
          const VALID_KEYS = new Set(["phone", "website", "addressLine1", "_npi", "_bedCount", "_foundedYear", "_googleRating", "_ein", "_facilityCount"]);
          for (const item of batchResults) {
            const cleaned = {
              orgName: item.orgName,
              fields: (item.fields ?? []).filter(
                (f: unknown) =>
                  f &&
                  typeof f === "object" &&
                  typeof (f as Record<string, unknown>).key === "string" &&
                  VALID_KEYS.has((f as Record<string, unknown>).key as string) &&
                  typeof (f as Record<string, unknown>).value === "string" &&
                  (f as Record<string, unknown>).value &&
                  typeof (f as Record<string, unknown>).confidence === "number" &&
                  ((f as Record<string, unknown>).confidence as number) >= 0.7,
              ) as { key: string; label: string; value: string; confidence: number; source: string }[],
            };
            if (cleaned.fields.length > 0) {
              allEnrichments.push(cleaned);
            }
          }
        } catch (batchErr: unknown) {
          req.log?.warn({ err: batchErr, batch: i }, "[BULK-IMPORT] Grok SEO batch error — skipping batch");
          continue;
        }
      }

      const enrichedOrgNames = new Set(allEnrichments.map((e) => e.orgName));
      const emptyOrgs = orgRows
        .map((r) => (r.name as string).trim())
        .filter((name) => !enrichedOrgNames.has(name));

      // Persist SEO results so repeat calls return the cache instead of
      // triggering another round of paid web-search completions.
      try {
        await db
          .update(bulkImportSessionsTable)
          .set({ seoEnrichedCache: { orgEnrichments: allEnrichments, emptyOrgs } })
          .where(eq(bulkImportSessionsTable.sessionToken, sessionToken));
      } catch {
        // non-fatal — cache write failure only means the next call may re-run
      }

      req.log?.info({ orgCount: orgRows.length, enrichedCount: allEnrichments.length, emptyCount: emptyOrgs.length }, "[BULK-IMPORT] SEO enrichment complete");
      res.json({ enrichmentType: "seo", orgEnrichments: allEnrichments, emptyOrgs });
      return;
    }

    res.status(400).json({ error: "Unknown enrichmentType." });
  } catch (err: unknown) {
    req.log?.error({ err }, "[BULK-IMPORT] enrich failed");
    res.status(500).json({ error: "Enrichment failed." });
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

import { Router } from "express";
import { db } from "@workspace/db";
import {
  masterOrgAiSuggestionsTable,
  masterOrganizationsTable,
  masterOrgHealthcareOverlayTable,
  masterOrgGovconOverlayTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "placeholder",
});

// ─── GET /admin/ai-suggestions ───────────────────────────────────────────────
// List all suggestions (optionally filtered by orgId or status)
router.get("/", async (req, res) => {
  try {
    const { orgId, status = "PENDING" } = req.query as Record<string, string>;

    const conditions = [];
    if (orgId) conditions.push(eq(masterOrgAiSuggestionsTable.masterOrganizationId, orgId));
    if (status && status !== "ALL") {
      const s = status as "PENDING" | "APPROVED" | "REJECTED";
      conditions.push(eq(masterOrgAiSuggestionsTable.status, s));
    }

    const rows = await db.execute<{
      id: string;
      master_organization_id: string;
      canonical_name: string;
      field: string;
      current_value: string | null;
      suggested_value: string;
      rationale: string | null;
      status: string;
      reviewed_at: string | null;
      created_at: string;
    }>(sql`
      SELECT
        s.id,
        s.master_organization_id,
        mo.canonical_name,
        s.field,
        s.current_value,
        s.suggested_value,
        s.rationale,
        s.status,
        s.reviewed_at,
        s.created_at
      FROM master_org_ai_suggestions s
      JOIN master_organizations mo ON mo.id = s.master_organization_id
      WHERE
        ${orgId ? sql`s.master_organization_id = ${orgId} AND` : sql``}
        ${status && status !== "ALL" ? sql`s.status = ${status}::master_org_ai_suggestion_status` : sql`TRUE`}
      ORDER BY s.created_at DESC
      LIMIT 100
    `);

    const suggestions = rows.rows.map(r => ({
      id: r.id,
      masterOrganizationId: r.master_organization_id,
      canonicalName: r.canonical_name,
      field: r.field,
      currentValue: r.current_value,
      suggestedValue: r.suggested_value,
      rationale: r.rationale,
      status: r.status,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
    }));

    const pendingCount = await db.execute<{ count: string }>(sql`
      SELECT count(*) AS count FROM master_org_ai_suggestions WHERE status = 'PENDING'
    `);

    res.json({ suggestions, total: suggestions.length, pendingCount: parseInt(pendingCount.rows[0].count) });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-AI-SUGGESTIONS] list failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/ai-suggestions/:orgId/generate ──────────────────────────────
// Trigger AI to generate field suggestions for a master org
router.post("/:orgId/generate", async (req, res) => {
  try {
    const { orgId } = req.params;

    const [org] = await db.select().from(masterOrganizationsTable).where(eq(masterOrganizationsTable.id, orgId));
    if (!org) return res.status(404).json({ error: "Master org not found" });

    const [hc] = await db.select().from(masterOrgHealthcareOverlayTable).where(eq(masterOrgHealthcareOverlayTable.masterOrganizationId, orgId));
    const [gc] = await db.select().from(masterOrgGovconOverlayTable).where(eq(masterOrgGovconOverlayTable.masterOrganizationId, orgId));

    // Determine which fields are missing and could benefit from AI
    const missingFields: string[] = [];
    if (!org.websiteDomain) missingFields.push("websiteDomain");
    if (!org.industry) missingFields.push("industry");
    if (!org.accountStructureType) missingFields.push("accountStructureType");
    if (!org.subVertical) missingFields.push("subVertical");
    if (!org.city && !org.state) missingFields.push("location");
    if (((org.aliases as string[]) ?? []).length === 0) missingFields.push("aliases");
    if (org.industry === "HEALTHCARE" && hc && !hc.facilityType) missingFields.push("facilityType");

    if (missingFields.length === 0) {
      return res.json({ message: "No missing fields require AI enrichment", suggestions: [] });
    }

    const prompt = `You are a master organization data enrichment assistant for a CRM intelligence platform.

Given the following master organization record, suggest values for the missing fields listed below.
Return ONLY a JSON array of suggestions. Each suggestion must have:
- "field": the field key
- "suggestedValue": the suggested value (string)
- "rationale": one sentence explaining why this value is suggested

Missing fields: ${missingFields.join(", ")}

Organization:
- Canonical Name: ${org.canonicalName}
- Normalized Name: ${org.normalizedName}
- Current Domain: ${org.websiteDomain ?? "(missing)"}
- Current Industry: ${org.industry ?? "(missing)"}
- Account Structure Type: ${org.accountStructureType ?? "(missing)"}
- Sub-Vertical: ${org.subVertical ?? "(missing)"}
- City: ${org.city ?? "(missing)"}
- State: ${org.state ?? "(missing)"}
- Aliases: ${((org.aliases as string[]) ?? []).join(", ") || "(none)"}
${org.industry === "HEALTHCARE" ? `- Healthcare Facility Type: ${hc?.facilityType ?? "(missing)"}` : ""}

Return a JSON array only. No markdown, no explanations outside the JSON.

Example: [{"field":"industry","suggestedValue":"HEALTHCARE","rationale":"The name 'HCA Healthcare' indicates a healthcare organization."}]`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";

    let parsed: { field: string; suggestedValue: string; rationale: string }[] = [];
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      req.log.warn({ raw }, "[ADMIN-AI-SUGGESTIONS] failed to parse AI response");
      return res.status(500).json({ error: "AI returned unparseable response" });
    }

    // Delete stale PENDING suggestions for same fields before inserting new ones
    for (const s of parsed) {
      await db.execute(sql`
        DELETE FROM master_org_ai_suggestions
        WHERE master_organization_id = ${orgId}
        AND field = ${s.field}
        AND status = 'PENDING'
      `);
    }

    const inserted = [];
    for (const s of parsed) {
      if (!s.field || !s.suggestedValue) continue;
      const currentVal = getOrgFieldValue(org, s.field);
      const [row] = await db.insert(masterOrgAiSuggestionsTable).values({
        masterOrganizationId: orgId,
        field: s.field,
        currentValue: currentVal ?? null,
        suggestedValue: s.suggestedValue,
        rationale: s.rationale ?? null,
        status: "PENDING",
      }).returning();
      inserted.push(row);
    }

    res.json({ suggestions: inserted, total: inserted.length });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-AI-SUGGESTIONS] generate failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/ai-suggestions/:id/approve ──────────────────────────────────
// Approve a suggestion and write the value back to the master org
router.post("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;

    const [suggestion] = await db.select().from(masterOrgAiSuggestionsTable).where(eq(masterOrgAiSuggestionsTable.id, id));
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    if (suggestion.status !== "PENDING") return res.status(400).json({ error: "Suggestion is not pending" });

    // Write the approved value back to the master org
    const fieldUpdates = buildFieldUpdate(suggestion.field, suggestion.suggestedValue);
    if (Object.keys(fieldUpdates).length > 0) {
      await db.update(masterOrganizationsTable)
        .set({ ...fieldUpdates, updatedAt: new Date() })
        .where(eq(masterOrganizationsTable.id, suggestion.masterOrganizationId));
    }

    // Mark suggestion approved
    const [updated] = await db.update(masterOrgAiSuggestionsTable)
      .set({ status: "APPROVED", reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(masterOrgAiSuggestionsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-AI-SUGGESTIONS] approve failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/ai-suggestions/:id/reject ───────────────────────────────────
router.post("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;

    const [updated] = await db.update(masterOrgAiSuggestionsTable)
      .set({ status: "REJECTED", reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(masterOrgAiSuggestionsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Suggestion not found" });

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-AI-SUGGESTIONS] reject failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrgFieldValue(org: Record<string, unknown>, field: string): string | null {
  const val = org[field];
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return (val as string[]).join(", ");
  return String(val);
}

function buildFieldUpdate(field: string, value: string): Record<string, unknown> {
  const map: Record<string, string> = {
    websiteDomain: "websiteDomain",
    industry: "industry",
    accountStructureType: "accountStructureType",
    subVertical: "subVertical",
    city: "city",
    state: "state",
  };

  if (field === "aliases") {
    return { aliases: value.split(",").map(s => s.trim()).filter(Boolean) };
  }
  if (field === "location") {
    // location is stored as city/state; skip direct writeback
    return {};
  }
  if (map[field]) {
    return { [map[field]]: value };
  }
  return {};
}

export default router;

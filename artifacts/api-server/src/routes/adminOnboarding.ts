import { Router } from "express";
import { db } from "@workspace/db";
import {
  clientOnboardingSessionsTable,
  onboardingProvisioningStepsTable,
  workspaceAdminAuditLogTable,
  onboardingPresetsTable,
} from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { z } from "zod";
import { initializeProvisioningSteps, runProvisioning } from "../lib/onboardingProvisioner";
import { callGrok, normalizeGrokResponse, NormalizedRecommendation } from "../lib/grokNormalizer";

const router = Router();

const intakeSchema = z.object({
  clientName: z.string().min(1),
  website: z.string().optional(),
  industryDescription: z.string().optional(),
  productsSold: z.string().optional(),
  customerType: z.string().optional(),
  salesCycleType: z.string().optional(),
  teamSize: z.string().optional(),
  complianceNeeds: z.string().optional(),
  govconInvolved: z.boolean().optional(),
  clientType: z.enum(["SINGLE_USER", "SMALL_TEAM", "ENTERPRISE"]).optional(),
  notes: z.string().optional(),
  presetId: z.string().uuid().optional(),
}).passthrough();

// ─── POST /admin/onboarding/sessions ─────────────────────────────────────────
router.post("/sessions", async (req, res) => {
  try {
    const parsed = intakeSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }

    const { clientType = "SMALL_TEAM", notes, presetId, ...intakeFields } = parsed.data;

    let createdFromPresetId: string | null = null;
    let mergedIntake = { ...intakeFields };

    if (presetId) {
      const preset = await db.query.onboardingPresetsTable.findFirst({
        where: eq(onboardingPresetsTable.id, presetId),
      });
      if (!preset) return res.status(404).json({ error: "Preset not found" });

      const presetPayload = (preset.presetPayload ?? {}) as Record<string, unknown>;
      mergedIntake = { ...presetPayload, ...mergedIntake };
      createdFromPresetId = preset.id;

      await db
        .update(onboardingPresetsTable)
        .set({ usageCount: preset.usageCount + 1, updatedAt: new Date() })
        .where(eq(onboardingPresetsTable.id, preset.id));
    }

    const [session] = await db.insert(clientOnboardingSessionsTable).values({
      status: "INTAKE",
      clientType,
      intakePayload: mergedIntake,
      notes: notes ?? null,
      createdByAdminUserId: req.platformAdmin!.id,
      createdFromPresetId,
    }).returning();

    return res.status(201).json({ session });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/onboarding/sessions ──────────────────────────────────────────
router.get("/sessions", async (req, res) => {
  try {
    const { status, archived = "false", limit = "50", offset = "0" } = req.query as Record<string, string>;

    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offsetNum = Math.max(0, parseInt(offset));
    const showArchived = archived === "true";

    // Build WHERE clause: archived sessions are always separated from active ones
    let whereClause: ReturnType<typeof sql>;
    if (showArchived) {
      whereClause = sql`WHERE s.archived_at IS NOT NULL`;
    } else if (status && status !== "ALL") {
      whereClause = sql`WHERE s.archived_at IS NULL AND s.status = ${status}::onboarding_session_status`;
    } else {
      whereClause = sql`WHERE s.archived_at IS NULL`;
    }

    const rows = await db.execute<{
      id: string;
      status: string;
      client_type: string;
      intake_payload: Record<string, unknown>;
      normalized_recommendation: Record<string, unknown> | null;
      created_workspace_id: string | null;
      created_by_admin_user_id: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
      archived_at: string | null;
    }>(sql`
      SELECT s.id, s.status, s.client_type, s.intake_payload,
             s.normalized_recommendation,
             s.created_workspace_id, s.created_by_admin_user_id, s.notes,
             s.created_at, s.updated_at, s.archived_at
      FROM client_onboarding_sessions s
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ${limitNum} OFFSET ${offsetNum}
    `);

    const totalRow = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) AS count
      FROM client_onboarding_sessions s
      ${whereClause}
    `);

    function extractVerticalLabel(nrec: unknown, ipay: unknown): string | null {
      if (nrec && typeof nrec === "object") {
        const rec = nrec as Record<string, unknown>;
        if (rec.vertical && typeof rec.vertical === "object") {
          const v = rec.vertical as Record<string, unknown>;
          const label = v.label ?? v.key;
          if (label) return String(label);
        }
      }
      if (ipay && typeof ipay === "object") {
        const ip = ipay as Record<string, unknown>;
        if (ip.industryDescription) return String(ip.industryDescription).slice(0, 40);
      }
      return null;
    }

    const items = rows.rows.map((r) => ({
      id: r.id,
      status: r.status,
      clientType: r.client_type,
      clientName: r.intake_payload !== null && typeof r.intake_payload === "object" && "clientName" in r.intake_payload
        ? String((r.intake_payload as Record<string, unknown>).clientName ?? "Unnamed")
        : "Unnamed",
      verticalLabel: extractVerticalLabel(r.normalized_recommendation, r.intake_payload),
      createdWorkspaceId: r.created_workspace_id,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      archivedAt: r.archived_at,
    }));

    return res.json({ items, total: parseInt(totalRow.rows[0].count) });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/onboarding/sessions/:id ──────────────────────────────────────
router.get("/sessions/:id", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const steps = await db
      .select()
      .from(onboardingProvisioningStepsTable)
      .where(eq(onboardingProvisioningStepsTable.sessionId, req.params.id))
      .orderBy(sql`array_position(
        ARRAY['CREATE_WORKSPACE','ASSIGN_PLAN','CREATE_MEMBERSHIPS','APPLY_VERTICAL_CONFIG',
              'ENABLE_SERVICE_LINES','ENABLE_ADD_ONS','PUBLISH_PIPELINE_TEMPLATES',
              'SEED_CONTACT_ROLES','SEED_TAGS','SEED_SAVED_VIEWS','SEED_DEFAULT_TASKS','SEED_ALERTS',
              'CREATE_LAUNCH_CHECKLIST','SEND_INVITE_EMAILS','RECORD_AUDIT_ENTRY',
              'SNAPSHOT_HEALTH_BASELINE']::text[],
        step_key::text
      )`);

    const reviewItemRows = await db.execute<ReviewItemRow>(sql`
      SELECT * FROM onboarding_review_items
      WHERE session_id = ${req.params.id}
      ORDER BY sort_order
    `);

    return res.json({ session, steps, reviewItems: reviewItemRows.rows });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /admin/onboarding/sessions/:id/archive ────────────────────────────
// Toggles archive: sets archived_at to NOW() when active, clears it when already archived.
router.patch("/sessions/:id/archive", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const newArchivedAt = session.archivedAt ? null : new Date();

    const [updated] = await db
      .update(clientOnboardingSessionsTable)
      .set({ archivedAt: newArchivedAt, updatedAt: new Date() })
      .where(eq(clientOnboardingSessionsTable.id, req.params.id))
      .returning();

    return res.json({ session: updated, archived: newArchivedAt !== null });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /admin/onboarding/sessions/:id ───────────────────────────────────
// Hard delete. Blocked if a workspace was already created to prevent orphaning live data.
router.delete("/sessions/:id", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (session.createdWorkspaceId) {
      return res.status(409).json({
        error: "Cannot delete a session that has an associated workspace. Archive it instead.",
      });
    }

    await db.execute(sql`
      DELETE FROM client_onboarding_sessions WHERE id = ${req.params.id}
    `);

    return res.status(204).send();
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /admin/onboarding/sessions/:id/intake ─────────────────────────────
router.patch("/sessions/:id/intake", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "INTAKE") {
      return res.status(409).json({ error: "Intake can only be updated when session is in INTAKE status" });
    }

    const { clientType, notes, ...intakeFields } = req.body;

    const updatedIntake = { ...(session.intakePayload as object), ...intakeFields };

    const [updated] = await db
      .update(clientOnboardingSessionsTable)
      .set({
        intakePayload: updatedIntake,
        clientType: clientType ?? session.clientType,
        notes: notes !== undefined ? notes : session.notes,
        status: "INTAKE",
        updatedAt: new Date(),
      })
      .where(eq(clientOnboardingSessionsTable.id, req.params.id))
      .returning();

    return res.json({ session: updated });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/onboarding/sessions/:id/recommend ───────────────────────────
router.post("/sessions/:id/recommend", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });

    await db
      .update(clientOnboardingSessionsTable)
      .set({ status: "AWAITING_RECOMMENDATION", updatedAt: new Date() })
      .where(eq(clientOnboardingSessionsTable.id, req.params.id));

    const intake = (session.intakePayload ?? {}) as Record<string, unknown>;
    const { raw, modelVersion, confidence } = await callGrok(intake);

    await db
      .update(clientOnboardingSessionsTable)
      .set({ grokRawPayload: raw, grokModelVersion: modelVersion, grokConfidence: confidence, status: "NORMALIZING", updatedAt: new Date() })
      .where(eq(clientOnboardingSessionsTable.id, req.params.id));

    const normalized = await normalizeGrokResponse(raw);

    const [updated] = await db
      .update(clientOnboardingSessionsTable)
      .set({
        normalizedRecommendation: normalized as unknown as Record<string, unknown>,
        status: "REVIEW",
        normalizedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientOnboardingSessionsTable.id, req.params.id))
      .returning();

    return res.json({ session: updated, normalizedRecommendation: normalized });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /admin/onboarding/sessions/:id/decisions ──────────────────────────
router.patch("/sessions/:id/decisions", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!["REVIEW"].includes(session.status)) {
      return res.status(409).json({ error: "Decisions can only be updated in REVIEW status" });
    }

    const decisions = { ...(session.adminDecisions as object), ...(req.body.decisions ?? {}) };

    const [updated] = await db
      .update(clientOnboardingSessionsTable)
      .set({ adminDecisions: decisions, updatedAt: new Date() })
      .where(eq(clientOnboardingSessionsTable.id, req.params.id))
      .returning();

    return res.json({ session: updated });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/onboarding/sessions/:id/lock ────────────────────────────────
router.post("/sessions/:id/lock", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "REVIEW") {
      return res.status(409).json({ error: "Session must be in REVIEW status to lock" });
    }

    const reviewItemRows = await db.execute<ReviewItemRow>(sql`
      SELECT * FROM onboarding_review_items
      WHERE session_id = ${session.id}
      ORDER BY sort_order
    `);

    let appliedConfig: Record<string, unknown>;

    if (reviewItemRows.rows.length > 0) {
      const blockingItems = reviewItemRows.rows.filter(i =>
        i.is_required && (
          i.status === "PENDING" ||
          (i.status === "REJECTED" && i.final_value_json === null) ||
          ((i.status === "APPROVED" || i.status === "EDITED") && i.final_value_json === null)
        )
      );
      if (blockingItems.length > 0) {
        return res.status(409).json({
          error: "Cannot lock session — required review items are unresolved",
          blockingItems: blockingItems.map(b => ({ id: b.id, group_key: b.group_key, item_key: b.item_key, label: b.label, status: b.status })),
        });
      }
      appliedConfig = buildAppliedConfigFromReviewItems(reviewItemRows.rows, session.intakePayload as Record<string, unknown>);
    } else {
      const normalized = (session.normalizedRecommendation ?? {}) as Record<string, unknown>;
      const decisions = (session.adminDecisions ?? {}) as Record<string, { action: string; value?: unknown }>;
      appliedConfig = buildAppliedConfig(normalized, decisions, session.intakePayload as Record<string, unknown>);
    }

    const [updated] = await db
      .update(clientOnboardingSessionsTable)
      .set({ status: "LOCKED", appliedConfig, lockedAt: new Date(), updatedAt: new Date() })
      .where(eq(clientOnboardingSessionsTable.id, req.params.id))
      .returning();

    await initializeProvisioningSteps(req.params.id);

    return res.json({ session: updated });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/onboarding/sessions/:id/provision ───────────────────────────
router.post("/sessions/:id/provision", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!["LOCKED", "FAILED", "PROVISIONING"].includes(session.status)) {
      return res.status(409).json({ error: "Session must be LOCKED or FAILED to provision" });
    }

    const { steps } = await runProvisioning(req.params.id, req.platformAdmin!.id, false);
    const updatedSession = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });

    return res.json({ session: updatedSession, steps });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/onboarding/sessions/:id/retry ───────────────────────────────
router.post("/sessions/:id/retry", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "FAILED") {
      return res.status(409).json({ error: "Session must be in FAILED status to retry" });
    }

    const { steps } = await runProvisioning(req.params.id, req.platformAdmin!.id, true);
    const updatedSession = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });

    return res.json({ session: updatedSession, steps });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/onboarding/sessions/:id/audit ────────────────────────────────
router.get("/sessions/:id/audit", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (!session.createdWorkspaceId) {
      return res.json({ entries: [] });
    }

    const entries = await db
      .select()
      .from(workspaceAdminAuditLogTable)
      .where(eq(workspaceAdminAuditLogTable.workspaceId, session.createdWorkspaceId))
      .orderBy(desc(workspaceAdminAuditLogTable.changedAt));

    return res.json({ entries });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/onboarding/config/verticals ──────────────────────────────────
router.get("/config/verticals", async (req, res) => {
  try {
    const verticals = await db.execute(sql`
      SELECT v.id, v.key, v.label, v.description, v.sort_order,
             COALESCE(
               json_agg(
                 json_build_object('id', sv.id, 'key', sv.key, 'label', sv.label, 'description', sv.description)
                 ORDER BY sv.sort_order
               ) FILTER (WHERE sv.id IS NOT NULL),
               '[]'
             ) AS sub_verticals
      FROM verticals v
      LEFT JOIN sub_verticals sv ON sv.vertical_id = v.id AND sv.is_active = true
      WHERE v.is_active = true
      GROUP BY v.id, v.key, v.label, v.description, v.sort_order
      ORDER BY v.sort_order
    `);

    return res.json({ verticals: verticals.rows });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/onboarding/config/sub-verticals ───────────────────────────────
router.get("/config/sub-verticals", async (req, res) => {
  try {
    const { verticalId } = req.query as Record<string, string>;
    const condition = verticalId ? sql`AND sv.vertical_id = ${verticalId}` : sql``;
    const result = await db.execute(sql`
      SELECT sv.id, sv.key, sv.label, sv.description, sv.vertical_id,
             v.label AS vertical_label
      FROM sub_verticals sv
      LEFT JOIN verticals v ON v.id = sv.vertical_id
      WHERE sv.is_active = true ${condition}
      ORDER BY sv.sort_order
    `);
    return res.json({ subVerticals: result.rows });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/onboarding/config/service-lines ───────────────────────────────
router.get("/config/service-lines", async (req, res) => {
  try {
    const { verticalId } = req.query as Record<string, string>;
    const condition = verticalId
      ? sql`WHERE sl.is_active = true AND sl.vertical_id = ${verticalId}`
      : sql`WHERE sl.is_active = true`;

    const rows = await db.execute(sql`
      SELECT sl.id, sl.key, sl.label, sl.description, sl.vertical_id, sl.sub_vertical_id,
             sl.default_pipeline_template_key, sl.sort_order,
             v.label AS vertical_label, sv.label AS sub_vertical_label
      FROM service_lines sl
      JOIN verticals v ON v.id = sl.vertical_id
      LEFT JOIN sub_verticals sv ON sv.id = sl.sub_vertical_id
      ${condition}
      ORDER BY sl.sort_order
    `);

    return res.json({ serviceLines: rows.rows });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/onboarding/config/pipeline-templates ─────────────────────────
router.get("/config/pipeline-templates", async (req, res) => {
  try {
    const { verticalId } = req.query as Record<string, string>;
    const condition = verticalId
      ? sql`WHERE pt.vertical = ${verticalId} AND pt.status = 'active'`
      : sql`WHERE pt.status = 'active'`;

    const rows = await db.execute(sql`
      SELECT pt.id, pt.key, pt.name AS label, pt.vertical, pt.sub_vertical, pt.status
      FROM pipeline_view_templates pt
      ${condition}
      ORDER BY pt.name
    `);

    return res.json({ pipelineTemplates: rows.rows });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/onboarding/config/add-on-types ────────────────────────────────
router.get("/config/add-on-types", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, key, label, description, config_schema
      FROM add_on_types
      WHERE is_active = true
      ORDER BY label
    `);

    return res.json({ addOnTypes: rows.rows });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Typed row interface for onboarding_review_items ─────────────────────────
interface ReviewItemRow extends Record<string, unknown> {
  id: string;
  session_id: string;
  group_key: string;
  item_key: string;
  label: string;
  suggested_value_json: unknown;
  final_value_json: unknown;
  source_json: unknown;
  confidence_band: "HIGH" | "MEDIUM" | "LOW";
  confidence_score: string | null;
  status: "PENDING" | "APPROVED" | "EDITED" | "REJECTED";
  rejection_reason: string | null;
  is_required: boolean;
  sort_order: number;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ReviewGroupDef {
  groupKey: string;
  label: string;
  helperText: string;
  items: Array<{
    itemKey: string;
    label: string;
    isRequired: boolean;
    defaultBand: "HIGH" | "MEDIUM" | "LOW";
    extract: (rec: NormalizedRecommendation) => unknown;
  }>;
}

const REVIEW_GROUP_DEFINITIONS: ReviewGroupDef[] = [
  {
    groupKey: "classification",
    label: "Classification",
    helperText: "Core business classification — vertical, sub-vertical, and account type",
    items: [
      { itemKey: "vertical", label: "Vertical", isRequired: true, defaultBand: "HIGH", extract: r => r.vertical ?? null },
      { itemKey: "subVertical", label: "Sub-Vertical", isRequired: true, defaultBand: "HIGH", extract: r => r.subVertical ?? null },
      { itemKey: "clientType", label: "Client Type", isRequired: true, defaultBand: "HIGH", extract: r => r.clientType ?? null },
    ],
  },
  {
    groupKey: "businessModel",
    label: "Business Model",
    helperText: "Revenue streams and service lines that define how the client generates revenue",
    items: [
      { itemKey: "revenueStreams", label: "Revenue Streams", isRequired: true, defaultBand: "MEDIUM", extract: r => Array.isArray(r.revenueStreams) && r.revenueStreams.length > 0 ? r.revenueStreams : null },
      { itemKey: "serviceLines", label: "Service Lines", isRequired: true, defaultBand: "MEDIUM", extract: r => Array.isArray(r.serviceLines) && r.serviceLines.length > 0 ? r.serviceLines : null },
    ],
  },
  {
    groupKey: "marketStrategy",
    label: "Market Strategy",
    helperText: "Target facilities and buyer roles that define who they sell to and where",
    items: [
      { itemKey: "targetFacilities", label: "Target Facilities", isRequired: true, defaultBand: "MEDIUM", extract: r => Array.isArray(r.targetFacilities) && r.targetFacilities.length > 0 ? r.targetFacilities : null },
      { itemKey: "buyerRoles", label: "Buyer Roles", isRequired: true, defaultBand: "MEDIUM", extract: r => {
        if (Array.isArray(r.buyerRoles) && r.buyerRoles.length > 0) return r.buyerRoles;
        if (Array.isArray(r.contactRoles) && r.contactRoles.length > 0) return r.contactRoles.map((cr: { label?: string; name?: string } | string) => typeof cr === "string" ? cr : (cr.label ?? cr.name));
        return null;
      }},
    ],
  },
  {
    groupKey: "executionLayer",
    label: "Execution Layer",
    helperText: "Sales motions and pipeline templates that drive execution",
    items: [
      { itemKey: "salesMotions", label: "Sales Motions", isRequired: true, defaultBand: "MEDIUM", extract: r => Array.isArray(r.salesMotions) && r.salesMotions.length > 0 ? r.salesMotions : null },
      { itemKey: "pipelineTemplates", label: "Pipeline Templates", isRequired: true, defaultBand: "HIGH", extract: r => Array.isArray(r.pipelineTemplates) && r.pipelineTemplates.length > 0 ? r.pipelineTemplates : null },
    ],
  },
  {
    groupKey: "intelligenceLayer",
    label: "Intelligence Layer",
    helperText: "Competitive landscape and pain points for sales intelligence",
    items: [
      { itemKey: "competitors", label: "Competitors", isRequired: false, defaultBand: "MEDIUM", extract: r => Array.isArray(r.competitors) && r.competitors.length > 0 ? r.competitors : null },
      { itemKey: "painPoints", label: "Pain Points", isRequired: false, defaultBand: "MEDIUM", extract: r => Array.isArray(r.painPoints) && r.painPoints.length > 0 ? r.painPoints : null },
    ],
  },
  {
    groupKey: "tagging",
    label: "Tagging",
    helperText: "Suggested tags to classify this workspace in the master database",
    items: [
      { itemKey: "suggestedTags", label: "Suggested Tags", isRequired: true, defaultBand: "MEDIUM", extract: r => Array.isArray(r.suggestedTags) && r.suggestedTags.length > 0 ? r.suggestedTags : null },
    ],
  },
  {
    groupKey: "addOns",
    label: "Add-Ons",
    helperText: "Enabled modules — govcon and other specialized capabilities",
    items: [
      { itemKey: "addOns", label: "Add-Ons", isRequired: false, defaultBand: "HIGH", extract: r => Array.isArray(r.addOns) && r.addOns.length > 0 ? r.addOns : null },
    ],
  },
  {
    groupKey: "riskWarnings",
    label: "Risk / Warnings",
    helperText: "Warning flags from AI that may block successful execution",
    items: [
      { itemKey: "warningFlags", label: "Warning Flags", isRequired: false, defaultBand: "HIGH", extract: r => Array.isArray(r.warningFlags) && r.warningFlags.length > 0 ? r.warningFlags : null },
    ],
  },
];

function confidenceBand(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.8) return "HIGH";
  if (score >= 0.5) return "MEDIUM";
  return "LOW";
}

async function logReviewItemAction(params: {
  sessionId: string;
  itemId: string;
  oldStatus: string | null;
  newStatus: string;
  oldFinalValue: unknown;
  newFinalValue: unknown;
  actionType: "APPROVE" | "EDIT" | "REJECT";
  actedByUserId: string;
}) {
  await db.execute(sql`
    INSERT INTO onboarding_review_item_audit_log
      (id, session_id, item_id, old_status, new_status, old_final_value_json, new_final_value_json, action_type, acted_by_user_id, acted_at)
    VALUES
      (gen_random_uuid()::text, ${params.sessionId}, ${params.itemId}, ${params.oldStatus}, ${params.newStatus},
       ${JSON.stringify(params.oldFinalValue)}::jsonb, ${JSON.stringify(params.newFinalValue)}::jsonb,
       ${params.actionType}, ${params.actedByUserId}, NOW())
  `);
}

// ─── POST /admin/onboarding/sessions/:id/rebuild-items ────────────────────────
router.post("/sessions/:id/rebuild-items", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (["LOCKED", "PROVISIONING", "PROVISIONED", "FAILED"].includes(session.status)) {
      return res.status(409).json({ error: "Cannot rebuild items after session is locked or in terminal state" });
    }
    if (!session.normalizedRecommendation) {
      return res.status(409).json({ error: "No normalized recommendation available. Run recommend first." });
    }

    const rec = session.normalizedRecommendation as unknown as NormalizedRecommendation;
    const overallConf = rec.overallConfidence ?? 0.75;
    const confBand = confidenceBand(overallConf);

    let sortOrder = 0;
    const upserted: string[] = [];

    for (const group of REVIEW_GROUP_DEFINITIONS) {
      for (const item of group.items) {
        const suggestedValue = item.extract(rec);
        const band = item.defaultBand === "HIGH" ? confBand : item.defaultBand;

        await db.execute(sql`
          INSERT INTO onboarding_review_items
            (id, session_id, group_key, item_key, label, suggested_value_json,
             confidence_band, confidence_score, status, is_required, sort_order, created_at, updated_at)
          VALUES
            (gen_random_uuid()::text, ${session.id}, ${group.groupKey}, ${item.itemKey},
             ${item.label}, ${JSON.stringify(suggestedValue)}::jsonb,
             ${band}::ai_confidence_band, ${overallConf}, 'PENDING'::onboarding_review_item_status,
             ${item.isRequired}, ${sortOrder}, NOW(), NOW())
          ON CONFLICT (session_id, group_key, item_key) DO UPDATE SET
            suggested_value_json = EXCLUDED.suggested_value_json,
            confidence_band = EXCLUDED.confidence_band,
            confidence_score = EXCLUDED.confidence_score,
            is_required = EXCLUDED.is_required,
            sort_order = EXCLUDED.sort_order,
            updated_at = NOW()
        `);

        upserted.push(`${group.groupKey}.${item.itemKey}`);
        sortOrder++;
      }
    }

    const items = await db.execute<ReviewItemRow>(sql`
      SELECT * FROM onboarding_review_items
      WHERE session_id = ${session.id}
      ORDER BY sort_order
    `);

    return res.json({ items: items.rows, upserted: upserted.length });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/onboarding/sessions/:id/progress ──────────────────────────────
router.get("/sessions/:id/progress", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });

    const items = await db.execute<ReviewItemRow>(sql`
      SELECT * FROM onboarding_review_items
      WHERE session_id = ${session.id}
      ORDER BY sort_order
    `);

    const required = items.rows.filter(i => i.is_required);
    // Resolved = APPROVED or EDITED with a non-null final value, or REJECTED but admin provided a replacement
    const resolved = required.filter(i =>
      (i.status === "APPROVED" || i.status === "EDITED") && i.final_value_json !== null
    );
    // Blocking = PENDING, REJECTED without replacement, or APPROVED/EDITED but final_value is unexpectedly null
    const blocking = required.filter(i =>
      i.status === "PENDING" ||
      (i.status === "REJECTED" && i.final_value_json === null) ||
      ((i.status === "APPROVED" || i.status === "EDITED") && i.final_value_json === null)
    );

    return res.json({
      totalItems: items.rows.length,
      required: required.length,
      resolved: resolved.length,
      blocking: blocking.length,
      blockingItems: blocking.map(b => ({ id: b.id, group_key: b.group_key, item_key: b.item_key, label: b.label, status: b.status })),
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/onboarding/sessions/:id/items/:itemId/approve ────────────────
router.post("/sessions/:id/items/:itemId/approve", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!["REVIEW"].includes(session.status)) {
      return res.status(409).json({ error: "Session must be in REVIEW status to approve items" });
    }

    const existing = await db.execute<ReviewItemRow>(sql`
      SELECT * FROM onboarding_review_items
      WHERE id = ${req.params.itemId} AND session_id = ${session.id}
    `);
    const item = existing.rows[0];
    if (!item) return res.status(404).json({ error: "Review item not found" });

    const oldStatus = item.status;
    const oldFinalValue = item.final_value_json;
    const newFinalValue = item.suggested_value_json;

    // Governance: required items cannot be approved with a null suggested value;
    // admin must edit and provide a concrete final value instead.
    if (item.is_required && newFinalValue === null) {
      return res.status(409).json({
        error: "Cannot approve a required item with no suggested value. Use Edit to provide a concrete final value.",
      });
    }

    await db.execute(sql`
      UPDATE onboarding_review_items SET
        status = 'APPROVED'::onboarding_review_item_status,
        final_value_json = suggested_value_json,
        reviewed_by_user_id = ${req.platformAdmin!.id},
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${req.params.itemId}
    `);

    await logReviewItemAction({
      sessionId: session.id,
      itemId: req.params.itemId,
      oldStatus,
      newStatus: "APPROVED",
      oldFinalValue,
      newFinalValue,
      actionType: "APPROVE",
      actedByUserId: req.platformAdmin!.id,
    });

    const updated = await db.execute<ReviewItemRow>(sql`
      SELECT * FROM onboarding_review_items WHERE id = ${req.params.itemId}
    `);
    return res.json({ item: updated.rows[0] });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/onboarding/sessions/:id/items/:itemId/edit ──────────────────
router.post("/sessions/:id/items/:itemId/edit", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!["REVIEW"].includes(session.status)) {
      return res.status(409).json({ error: "Session must be in REVIEW status to edit items" });
    }

    const { finalValue } = req.body;
    if (finalValue === undefined) {
      return res.status(400).json({ error: "finalValue is required" });
    }

    const existing = await db.execute<ReviewItemRow>(sql`
      SELECT * FROM onboarding_review_items
      WHERE id = ${req.params.itemId} AND session_id = ${session.id}
    `);
    const item = existing.rows[0];
    if (!item) return res.status(404).json({ error: "Review item not found" });

    const oldStatus = item.status;
    const oldFinalValue = item.final_value_json;

    await db.execute(sql`
      UPDATE onboarding_review_items SET
        status = 'EDITED'::onboarding_review_item_status,
        final_value_json = ${JSON.stringify(finalValue)}::jsonb,
        reviewed_by_user_id = ${req.platformAdmin!.id},
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${req.params.itemId}
    `);

    await logReviewItemAction({
      sessionId: session.id,
      itemId: req.params.itemId,
      oldStatus,
      newStatus: "EDITED",
      oldFinalValue,
      newFinalValue: finalValue,
      actionType: "EDIT",
      actedByUserId: req.platformAdmin!.id,
    });

    const updated = await db.execute<ReviewItemRow>(sql`
      SELECT * FROM onboarding_review_items WHERE id = ${req.params.itemId}
    `);
    return res.json({ item: updated.rows[0] });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/onboarding/sessions/:id/items/:itemId/reject ────────────────
router.post("/sessions/:id/items/:itemId/reject", async (req, res) => {
  try {
    const session = await db.query.clientOnboardingSessionsTable.findFirst({
      where: eq(clientOnboardingSessionsTable.id, req.params.id),
    });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!["REVIEW"].includes(session.status)) {
      return res.status(409).json({ error: "Session must be in REVIEW status to reject items" });
    }

    const { rejectionReason } = req.body;
    if (!rejectionReason || typeof rejectionReason !== "string" || !rejectionReason.trim()) {
      return res.status(400).json({ error: "rejectionReason is required" });
    }

    const existing = await db.execute<ReviewItemRow>(sql`
      SELECT * FROM onboarding_review_items
      WHERE id = ${req.params.itemId} AND session_id = ${session.id}
    `);
    const item = existing.rows[0];
    if (!item) return res.status(404).json({ error: "Review item not found" });

    const oldStatus = item.status;
    const oldFinalValue = item.final_value_json;

    await db.execute(sql`
      UPDATE onboarding_review_items SET
        status = 'REJECTED'::onboarding_review_item_status,
        final_value_json = NULL,
        rejection_reason = ${rejectionReason.trim()},
        reviewed_by_user_id = ${req.platformAdmin!.id},
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${req.params.itemId}
    `);

    await logReviewItemAction({
      sessionId: session.id,
      itemId: req.params.itemId,
      oldStatus,
      newStatus: "REJECTED",
      oldFinalValue,
      newFinalValue: null,
      actionType: "REJECT",
      actedByUserId: req.platformAdmin!.id,
    });

    const updated = await db.execute<ReviewItemRow>(sql`
      SELECT * FROM onboarding_review_items WHERE id = ${req.params.itemId}
    `);
    return res.json({ item: updated.rows[0] });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Helper: build applied config from review items (new system) ──────────────
function buildAppliedConfigFromReviewItems(
  items: ReviewItemRow[],
  intake: Record<string, unknown>
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  function getItemFinal(groupKey: string, itemKey: string): unknown {
    const item = items.find(i => i.group_key === groupKey && i.item_key === itemKey);
    if (!item) return undefined;
    if (item.status !== "APPROVED" && item.status !== "EDITED") return undefined;
    return item.final_value_json;
  }

  const vertical = getItemFinal("classification", "vertical") as Record<string, unknown> | null | undefined;
  if (vertical) {
    config.verticalId = vertical.id;
    config.verticalKey = vertical.key;
    config.verticalText = vertical.label;
  }

  const subVertical = getItemFinal("classification", "subVertical") as Record<string, unknown> | null | undefined;
  if (subVertical) {
    config.subVerticalId = subVertical.id;
    config.subVerticalText = subVertical.label;
  }

  const clientType = getItemFinal("classification", "clientType") as Record<string, unknown> | string | null | undefined;
  if (clientType) {
    config.clientType = typeof clientType === "object" ? (clientType as Record<string, unknown>).value : clientType;
  }

  const revenueStreams = getItemFinal("businessModel", "revenueStreams");
  if (Array.isArray(revenueStreams)) config.revenueStreams = revenueStreams;

  const serviceLines = getItemFinal("businessModel", "serviceLines") as Array<{ id?: string }> | null | undefined;
  if (Array.isArray(serviceLines)) {
    config.serviceLineIds = serviceLines.filter(sl => sl.id).map(sl => sl.id!);
  }

  const targetFacilities = getItemFinal("marketStrategy", "targetFacilities");
  if (Array.isArray(targetFacilities)) config.targetFacilities = targetFacilities;

  const buyerRoles = getItemFinal("marketStrategy", "buyerRoles");
  if (Array.isArray(buyerRoles)) config.contactRoles = buyerRoles;

  const salesMotions = getItemFinal("executionLayer", "salesMotions");
  if (Array.isArray(salesMotions)) config.salesMotions = salesMotions;

  const pipelineTemplates = getItemFinal("executionLayer", "pipelineTemplates") as Array<{ key: string }> | null | undefined;
  if (Array.isArray(pipelineTemplates)) {
    config.pipelineTemplateKeys = pipelineTemplates.map(pt => pt.key);
  }

  const competitors = getItemFinal("intelligenceLayer", "competitors");
  if (Array.isArray(competitors)) config.competitors = competitors;

  const painPoints = getItemFinal("intelligenceLayer", "painPoints");
  if (Array.isArray(painPoints)) config.painPoints = painPoints;

  const suggestedTags = getItemFinal("tagging", "suggestedTags");
  if (Array.isArray(suggestedTags)) config.suggestedTags = suggestedTags;

  type AddOnItem = { id?: string; key?: string; label?: string; invisible?: boolean; config?: Record<string, unknown> };
  const addOns = getItemFinal("addOns", "addOns") as AddOnItem[] | null | undefined;
  if (Array.isArray(addOns)) {
    config.addOns = addOns.filter(ao => ao.id).map(ao => ({
      addOnTypeId: ao.id!,
      invisible:   ao.invisible === true,
      config:      ao.config ?? {},
    }));
    // Expose keys for provisioner seed steps (e.g. SEED_SAVED_VIEWS GovCon view)
    config.enabledAddOns = addOns.map(ao => ({ key: ao.key ?? ao.id, invisible: ao.invisible === true }));
  }

  const warningFlags = getItemFinal("riskWarnings", "warningFlags");
  if (Array.isArray(warningFlags)) config.warningFlags = warningFlags;

  if (Array.isArray(intake.inviteEmails)) {
    config.inviteEmails = intake.inviteEmails;
  }

  return config;
}

// ─── Helper: build applied config from decisions ──────────────────────────────
function buildAppliedConfig(
  normalized: Record<string, unknown>,
  decisions: Record<string, { action: string; value?: unknown }>,
  intake: Record<string, unknown>
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  function resolveSection<T>(key: string): T | undefined {
    const decision = decisions[key];
    if (decision?.action === "rejected") return undefined;
    if (decision?.action === "edited" && decision.value !== undefined) return decision.value as T;
    return (normalized[key] as T) ?? undefined;
  }

  const vertical = resolveSection<{ id: string; key: string }>("vertical");
  if (vertical) {
    config.verticalId = vertical.id;
    config.verticalKey = vertical.key;
  }

  const subVertical = resolveSection<{ id: string; key: string }>("subVertical");
  if (subVertical) {
    config.subVerticalId = subVertical.id;
  }

  const clientType = resolveSection<{ value: string }>("clientType");
  if (clientType) {
    config.clientType = clientType.value;
  }

  const serviceLines = resolveSection<Array<{ id?: string }>>("serviceLines");
  if (serviceLines) {
    config.serviceLineIds = serviceLines.filter((sl) => sl.id).map((sl) => sl.id!);
  }

  const pipelineTemplates = resolveSection<Array<{ key: string }>>("pipelineTemplates");
  if (pipelineTemplates) {
    config.pipelineTemplateKeys = pipelineTemplates.map((pt) => pt.key);
  }

  const contactRoles = resolveSection<Array<{ key: string; label: string }>>("contactRoles");
  if (contactRoles) {
    config.contactRoles = contactRoles;
  }

  const suggestedTags = resolveSection<Array<{ name: string; color?: string }>>("suggestedTags");
  if (suggestedTags) {
    config.suggestedTags = suggestedTags;
  }

  const addOns = resolveSection<Array<{ id?: string; key: string; config: Record<string, unknown> }>>("addOns");
  if (addOns) {
    config.addOns = addOns
      .filter((ao) => ao.id)
      .map((ao) => ({ addOnTypeId: ao.id!, config: ao.config ?? {} }));
  }

  const inviteEmails = intake.inviteEmails;
  if (Array.isArray(inviteEmails)) {
    config.inviteEmails = inviteEmails;
  }

  return config;
}

export default router;

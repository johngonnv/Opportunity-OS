import { Router } from "express";
import { db } from "@workspace/db";
import {
  clientOnboardingSessionsTable,
  onboardingProvisioningStepsTable,
  workspaceAdminAuditLogTable,
  onboardingPresetsTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { initializeProvisioningSteps, runProvisioning } from "../lib/onboardingProvisioner";
import { callGrok, normalizeGrokResponse } from "../lib/grokNormalizer";

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
    const { status, limit = "50", offset = "0" } = req.query as Record<string, string>;

    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offsetNum = Math.max(0, parseInt(offset));

    const statusCondition = status && status !== "ALL"
      ? sql`WHERE s.status = ${status}::onboarding_session_status`
      : sql`WHERE 1=1`;

    const rows = await db.execute<{
      id: string;
      status: string;
      client_type: string;
      intake_payload: Record<string, unknown>;
      created_workspace_id: string | null;
      created_by_admin_user_id: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>(sql`
      SELECT s.id, s.status, s.client_type, s.intake_payload,
             s.created_workspace_id, s.created_by_admin_user_id, s.notes,
             s.created_at, s.updated_at
      FROM client_onboarding_sessions s
      ${statusCondition}
      ORDER BY s.created_at DESC
      LIMIT ${limitNum} OFFSET ${offsetNum}
    `);

    const totalRow = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) AS count
      FROM client_onboarding_sessions s
      ${statusCondition}
    `);

    const items = rows.rows.map((r) => ({
      id: r.id,
      status: r.status,
      clientType: r.client_type,
      clientName: (r.intake_payload as any)?.clientName ?? "Unnamed",
      createdWorkspaceId: r.created_workspace_id,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
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
              'SEED_CONTACT_ROLES','SEED_TAGS','CREATE_LAUNCH_CHECKLIST',
              'SEND_INVITE_EMAILS','RECORD_AUDIT_ENTRY','SNAPSHOT_HEALTH_BASELINE']::text[],
        step_key::text
      )`);

    return res.json({ session, steps });
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

    const normalized = (session.normalizedRecommendation ?? {}) as Record<string, unknown>;
    const decisions = (session.adminDecisions ?? {}) as Record<string, { action: string; value?: unknown }>;

    const appliedConfig = buildAppliedConfig(normalized, decisions, session.intakePayload as Record<string, unknown>);

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

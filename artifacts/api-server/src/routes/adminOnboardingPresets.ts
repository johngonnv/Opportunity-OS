import { Router } from "express";
import { db } from "@workspace/db";
import {
  onboardingPresetsTable,
  clientOnboardingSessionsTable,
  verticalsTable,
  subVerticalsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const createPresetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  verticalId: z.string().optional(),
  subVerticalId: z.string().optional(),
  isPublic: z.boolean().optional(),
  sessionId: z.string().optional(),
});

// ─── GET /admin/onboarding/presets ────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { verticalId, limit = "50", offset = "0" } = req.query as Record<string, string>;

    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offsetNum = Math.max(0, parseInt(offset));

    const verticalCondition = verticalId
      ? sql`AND p.vertical_id = ${verticalId}`
      : sql``;

    const rows = await db.execute(sql`
      SELECT p.id, p.name, p.description, p.vertical_id, p.sub_vertical_id,
             p.is_public, p.usage_count, p.version, p.created_from_session_id,
             p.created_by_admin_user_id, p.created_at, p.updated_at,
             v.key AS vertical_key, v.label AS vertical_label,
             sv.key AS sub_vertical_key, sv.label AS sub_vertical_label
      FROM onboarding_presets p
      LEFT JOIN verticals v ON v.id = p.vertical_id
      LEFT JOIN sub_verticals sv ON sv.id = p.sub_vertical_id
      WHERE 1=1 ${verticalCondition}
      ORDER BY p.usage_count DESC, p.created_at DESC
      LIMIT ${limitNum} OFFSET ${offsetNum}
    `);

    const totalRow = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) AS count FROM onboarding_presets p
      WHERE 1=1 ${verticalCondition}
    `);

    type PresetListRow = {
      id: string;
      name: string;
      description: string | null;
      vertical_id: string | null;
      sub_vertical_id: string | null;
      is_public: boolean;
      usage_count: number;
      version: number;
      created_at: Date | string | null;
      updated_at: Date | string | null;
      vertical_label: string | null;
      vertical_key: string | null;
      sub_vertical_label: string | null;
      sub_vertical_key: string | null;
    };
    const normalized = (rows.rows as PresetListRow[]).map(r => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      verticalId: r.vertical_id ?? null,
      subVerticalId: r.sub_vertical_id ?? null,
      isPublic: r.is_public ?? false,
      usageCount: r.usage_count ?? 0,
      version: r.version ?? 1,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      verticalLabel: r.vertical_label ?? null,
      verticalKey: r.vertical_key ?? null,
      subVerticalLabel: r.sub_vertical_label ?? null,
      subVerticalKey: r.sub_vertical_key ?? null,
    }));
    return res.json({ presets: normalized, total: parseInt(totalRow.rows[0].count) });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/onboarding/presets/:id ───────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT p.*, v.key AS vertical_key, v.label AS vertical_label,
             sv.key AS sub_vertical_key, sv.label AS sub_vertical_label
      FROM onboarding_presets p
      LEFT JOIN verticals v ON v.id = p.vertical_id
      LEFT JOIN sub_verticals sv ON sv.id = p.sub_vertical_id
      WHERE p.id = ${req.params.id}
    `);

    if (rows.rows.length === 0) return res.status(404).json({ error: "Preset not found" });

    type PresetDetailRow = {
      id: string;
      name: string;
      description: string | null;
      vertical_id: string | null;
      sub_vertical_id: string | null;
      is_public: boolean;
      usage_count: number;
      version: number;
      created_at: Date | string | null;
      updated_at: Date | string | null;
      vertical_label: string | null;
      vertical_key: string | null;
      sub_vertical_label: string | null;
      sub_vertical_key: string | null;
      preset_payload: Record<string, unknown> | null;
      applied_config: Record<string, unknown> | null;
    };
    const r = rows.rows[0] as PresetDetailRow;
    const preset = {
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      verticalId: r.vertical_id ?? null,
      subVerticalId: r.sub_vertical_id ?? null,
      isPublic: r.is_public ?? false,
      usageCount: r.usage_count ?? 0,
      version: r.version ?? 1,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      verticalLabel: r.vertical_label ?? null,
      verticalKey: r.vertical_key ?? null,
      subVerticalLabel: r.sub_vertical_label ?? null,
      subVerticalKey: r.sub_vertical_key ?? null,
      appliedConfig: r.preset_payload ?? r.applied_config ?? null,
    };

    return res.json({ preset });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/onboarding/presets ──────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const parsed = createPresetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }

    const { name, description, verticalId, subVerticalId, isPublic = false, sessionId } = parsed.data;

    let presetPayload: Record<string, unknown> = {};
    let sourceVerticalId = verticalId;
    let sourceSubVerticalId = subVerticalId;

    if (sessionId) {
      const session = await db.query.clientOnboardingSessionsTable.findFirst({
        where: eq(clientOnboardingSessionsTable.id, sessionId),
      });
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (!session.appliedConfig) return res.status(400).json({ error: "Session has no applied config — provision it first" });

      const appliedConfig = session.appliedConfig && typeof session.appliedConfig === "object"
        ? session.appliedConfig as Record<string, unknown>
        : {};
      presetPayload = appliedConfig;

      if (!sourceVerticalId && typeof appliedConfig.verticalId === "string") {
        sourceVerticalId = appliedConfig.verticalId;
      }
      if (!sourceSubVerticalId && typeof appliedConfig.subVerticalId === "string") {
        sourceSubVerticalId = appliedConfig.subVerticalId;
      }
    }

    const [preset] = await db.insert(onboardingPresetsTable).values({
      name,
      description: description ?? null,
      verticalId: sourceVerticalId ?? null,
      subVerticalId: sourceSubVerticalId ?? null,
      isPublic,
      presetPayload,
      usageCount: 0,
      version: 1,
      createdFromSessionId: sessionId ?? null,
      createdByAdminUserId: req.platformAdmin!.id,
    }).returning();

    return res.status(201).json({ preset });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/onboarding/presets/:id/apply ─────────────────────────────────
// Creates a session directly in REVIEW status using the preset's applied config.
// Skips Phase 1 (intake) and Phase 2 (AI recommendation) entirely.
router.post("/:id/apply", async (req, res) => {
  try {
    const preset = await db.query.onboardingPresetsTable.findFirst({
      where: eq(onboardingPresetsTable.id, req.params.id),
    });
    if (!preset) return res.status(404).json({ error: "Preset not found" });

    const appliedConfig = (preset.presetPayload ?? {}) as Record<string, unknown>;

    // Reconstruct normalizedRecommendation from the stored applied config
    let vertical: Record<string, unknown> | null = null;
    if (typeof appliedConfig.verticalId === "string") {
      const v = await db.query.verticalsTable.findFirst({
        where: eq(verticalsTable.id, appliedConfig.verticalId),
      });
      if (v) {
        vertical = { id: v.id, key: v.key, label: v.label, confidence: 1.0, rationale: `Copied from preset: ${preset.name}` };
      }
    }

    let subVertical: Record<string, unknown> | null = null;
    if (typeof appliedConfig.subVerticalId === "string") {
      const sv = await db.query.subVerticalsTable.findFirst({
        where: eq(subVerticalsTable.id, appliedConfig.subVerticalId),
      });
      if (sv) {
        subVertical = { id: sv.id, key: sv.key, label: sv.label, confidence: 1.0 };
      }
    }

    const clientTypeValue = typeof appliedConfig.clientType === "string" ? appliedConfig.clientType : null;

    let serviceLines: Record<string, unknown>[] = [];
    if (Array.isArray(appliedConfig.serviceLineIds) && appliedConfig.serviceLineIds.length > 0) {
      const ids = appliedConfig.serviceLineIds as string[];
      const slRows = await db.execute(sql`SELECT id, key, label FROM service_lines WHERE id = ANY(${ids}::uuid[])`);
      serviceLines = slRows.rows.map(sl => ({ id: (sl as Record<string, unknown>).id, key: (sl as Record<string, unknown>).key, label: (sl as Record<string, unknown>).label, confidence: 1.0 }));
    }

    let pipelineTemplates: Record<string, unknown>[] = [];
    if (Array.isArray(appliedConfig.pipelineTemplateKeys) && appliedConfig.pipelineTemplateKeys.length > 0) {
      const keys = appliedConfig.pipelineTemplateKeys as string[];
      const ptRows = await db.execute(sql`SELECT id, key, name FROM pipeline_view_templates WHERE key = ANY(${keys}::text[])`);
      if (ptRows.rows.length > 0) {
        pipelineTemplates = ptRows.rows.map(pt => ({ id: (pt as Record<string, unknown>).id, key: (pt as Record<string, unknown>).key, label: (pt as Record<string, unknown>).name, confidence: 1.0 }));
      } else {
        pipelineTemplates = keys.map(k => ({ key: k, label: k, confidence: 1.0 }));
      }
    }

    const contactRoles = Array.isArray(appliedConfig.contactRoles) ? appliedConfig.contactRoles as Record<string, unknown>[] : [];
    const suggestedTags = Array.isArray(appliedConfig.suggestedTags) ? appliedConfig.suggestedTags as Record<string, unknown>[] : [];

    let addOns: Record<string, unknown>[] = [];
    if (Array.isArray(appliedConfig.addOns) && appliedConfig.addOns.length > 0) {
      const rawAddOns = appliedConfig.addOns as Array<{ addOnTypeId?: string; config?: Record<string, unknown> }>;
      const ids = rawAddOns.map(a => a.addOnTypeId).filter((id): id is string => !!id);
      const aoRows = ids.length > 0
        ? await db.execute(sql`SELECT id, key, label FROM add_on_types WHERE id = ANY(${ids}::uuid[])`)
        : { rows: [] };
      addOns = rawAddOns.map(a => {
        const aoType = aoRows.rows.find(r => (r as Record<string, unknown>).id === a.addOnTypeId) as Record<string, unknown> | undefined;
        return { id: a.addOnTypeId, key: aoType?.key ?? a.addOnTypeId, label: aoType?.label ?? a.addOnTypeId, config: a.config ?? {}, confidence: 1.0 };
      });
    }

    const normalizedRecommendation: Record<string, unknown> = {
      ...(vertical ? { vertical } : {}),
      ...(subVertical ? { subVertical } : {}),
      ...(clientTypeValue ? { clientType: { value: clientTypeValue, confidence: 1.0 } } : {}),
      ...(serviceLines.length > 0 ? { serviceLines } : {}),
      ...(pipelineTemplates.length > 0 ? { pipelineTemplates } : {}),
      ...(contactRoles.length > 0 ? { contactRoles } : {}),
      ...(suggestedTags.length > 0 ? { suggestedTags } : {}),
      ...(addOns.length > 0 ? { addOns } : {}),
    };

    const resolvedClientType = clientTypeValue && ["SINGLE_USER", "SMALL_TEAM", "ENTERPRISE"].includes(clientTypeValue)
      ? clientTypeValue as "SINGLE_USER" | "SMALL_TEAM" | "ENTERPRISE"
      : "SMALL_TEAM";

    const [session] = await db.insert(clientOnboardingSessionsTable).values({
      status: "REVIEW",
      clientType: resolvedClientType,
      intakePayload: { source: "preset", presetName: preset.name },
      normalizedRecommendation,
      grokConfidence: 1.0,
      normalizedAt: new Date(),
      createdByAdminUserId: req.platformAdmin!.id,
      createdFromPresetId: preset.id,
    }).returning();

    await db
      .update(onboardingPresetsTable)
      .set({ usageCount: preset.usageCount + 1, updatedAt: new Date() })
      .where(eq(onboardingPresetsTable.id, req.params.id));

    return res.status(201).json({ session });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

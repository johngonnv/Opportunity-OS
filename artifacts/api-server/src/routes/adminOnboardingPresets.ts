import { Router } from "express";
import { db } from "@workspace/db";
import {
  onboardingPresetsTable,
  clientOnboardingSessionsTable,
  verticalsTable,
  subVerticalsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
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

    return res.json({ presets: rows.rows, total: parseInt(totalRow.rows[0].count) });
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

    return res.json({ preset: rows.rows[0] });
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

export default router;

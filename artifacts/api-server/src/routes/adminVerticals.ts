import { Router } from "express";
import { db } from "@workspace/db";
import {
  verticalsTable,
  subVerticalsTable,
  serviceLinesTable,
} from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// ─── Common schemas ──────────────────────────────────────────────────────────
const stringArray = z.array(z.string()).default([]);
const jsonObject = z.record(z.string(), z.unknown()).default({});

const verticalCreateSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, "Key must be lowercase letters, numbers, and underscores only"),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  naicsCodes: stringArray,
  pscCodes: stringArray,
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const verticalUpdateSchema = verticalCreateSchema.partial();

const subVerticalCreateSchema = z.object({
  verticalId: z.string().min(1),
  key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  naicsCodes: stringArray,
  pscCodes: stringArray,
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const subVerticalUpdateSchema = subVerticalCreateSchema.omit({ verticalId: true }).partial();

const serviceLineCreateSchema = z.object({
  verticalId: z.string().min(1),
  subVerticalId: z.string().nullable().optional(),
  key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  naicsCodes: stringArray,
  pscCodes: stringArray,
  defaultPipelineTemplateKey: z.string().nullable().optional(),
  defaultConfig: jsonObject.optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const serviceLineUpdateSchema = serviceLineCreateSchema
  .omit({ verticalId: true })
  .partial();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function handleUniqueError(err: any, entity: string, res: any) {
  if (err?.code === "23505") {
    return res.status(409).json({
      error: `${entity} with this key already exists for the parent.`,
    });
  }
  return null;
}

// ─── VERTICALS ───────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const verticals = await db
      .select()
      .from(verticalsTable)
      .orderBy(asc(verticalsTable.sortOrder), asc(verticalsTable.label));

    // Enrich with child counts (small N+1 is acceptable for admin)
    const enriched = await Promise.all(
      verticals.map(async (v) => {
        const [subRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(subVerticalsTable)
          .where(eq(subVerticalsTable.verticalId, v.id));
        const [svcRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(serviceLinesTable)
          .where(eq(serviceLinesTable.verticalId, v.id));
        return {
          ...v,
          subVerticalCount: Number(subRow?.count ?? 0),
          serviceLineCount: Number(svcRow?.count ?? 0),
        };
      })
    );

    return res.json({ verticals: enriched });
  } catch (err) {
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const vertical = await db.query.verticalsTable.findFirst({
      where: eq(verticalsTable.id, req.params.id),
    });
    if (!vertical) return res.status(404).json({ error: "Vertical not found" });
    return res.json({ vertical });
  } catch (err) {
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const parsed = verticalCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }
    const data = parsed.data;

    const [created] = await db
      .insert(verticalsTable)
      .values({
        key: data.key,
        label: data.label,
        description: data.description ?? null,
        naicsCodes: data.naicsCodes,
        pscCodes: data.pscCodes,
        icon: data.icon ?? null,
        color: data.color ?? null,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();

    return res.status(201).json({ vertical: created });
  } catch (err: any) {
    const handled = handleUniqueError(err, "Vertical", res);
    if (handled) return handled;
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const existing = await db.query.verticalsTable.findFirst({
      where: eq(verticalsTable.id, req.params.id),
    });
    if (!existing) return res.status(404).json({ error: "Vertical not found" });

    const parsed = verticalUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }

    const [updated] = await db
      .update(verticalsTable)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(verticalsTable.id, req.params.id))
      .returning();

    return res.json({ vertical: updated });
  } catch (err: any) {
    const handled = handleUniqueError(err, "Vertical", res);
    if (handled) return handled;
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const existing = await db.query.verticalsTable.findFirst({
      where: eq(verticalsTable.id, req.params.id),
    });
    if (!existing) return res.status(404).json({ error: "Vertical not found" });

    // Soft delete (preserve referential integrity for historical data)
    const [updated] = await db
      .update(verticalsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(verticalsTable.id, req.params.id))
      .returning();

    return res.json({ vertical: updated });
  } catch (err) {
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── SUB-VERTICALS ───────────────────────────────────────────────────────────
router.get("/verticals/:verticalId/sub-verticals", async (req, res) => {
  try {
    const subs = await db
      .select()
      .from(subVerticalsTable)
      .where(eq(subVerticalsTable.verticalId, req.params.verticalId))
      .orderBy(asc(subVerticalsTable.sortOrder), asc(subVerticalsTable.label));
    return res.json({ subVerticals: subs });
  } catch (err) {
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sub-verticals/:id", async (req, res) => {
  try {
    const sv = await db.query.subVerticalsTable.findFirst({
      where: eq(subVerticalsTable.id, req.params.id),
    });
    if (!sv) return res.status(404).json({ error: "Sub-vertical not found" });
    return res.json({ subVertical: sv });
  } catch (err) {
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/verticals/:verticalId/sub-verticals", async (req, res) => {
  try {
    const bodyWithVertical = { ...req.body, verticalId: req.params.verticalId };
    const parsed = subVerticalCreateSchema.safeParse(bodyWithVertical);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }
    const data = parsed.data;

    const [created] = await db
      .insert(subVerticalsTable)
      .values({
        verticalId: data.verticalId,
        key: data.key,
        label: data.label,
        description: data.description ?? null,
        naicsCodes: data.naicsCodes,
        pscCodes: data.pscCodes,
        icon: data.icon ?? null,
        color: data.color ?? null,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();

    return res.status(201).json({ subVertical: created });
  } catch (err: any) {
    const handled = handleUniqueError(err, "Sub-vertical", res);
    if (handled) return handled;
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/sub-verticals/:id", async (req, res) => {
  try {
    const existing = await db.query.subVerticalsTable.findFirst({
      where: eq(subVerticalsTable.id, req.params.id),
    });
    if (!existing) return res.status(404).json({ error: "Sub-vertical not found" });

    const parsed = subVerticalUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }

    const [updated] = await db
      .update(subVerticalsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(subVerticalsTable.id, req.params.id))
      .returning();

    return res.json({ subVertical: updated });
  } catch (err: any) {
    const handled = handleUniqueError(err, "Sub-vertical", res);
    if (handled) return handled;
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/sub-verticals/:id", async (req, res) => {
  try {
    const existing = await db.query.subVerticalsTable.findFirst({
      where: eq(subVerticalsTable.id, req.params.id),
    });
    if (!existing) return res.status(404).json({ error: "Sub-vertical not found" });

    const [updated] = await db
      .update(subVerticalsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(subVerticalsTable.id, req.params.id))
      .returning();

    return res.json({ subVertical: updated });
  } catch (err) {
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── SERVICE LINES ───────────────────────────────────────────────────────────
router.get("/service-lines", async (req, res) => {
  try {
    const { verticalId, subVerticalId } = req.query as Record<string, string | undefined>;

    let query = db.select().from(serviceLinesTable);

    const conditions = [];
    if (verticalId) conditions.push(eq(serviceLinesTable.verticalId, verticalId));
    if (subVerticalId) conditions.push(eq(serviceLinesTable.subVerticalId, subVerticalId));

    if (conditions.length > 0) {
      // @ts-ignore - drizzle and chaining
      query = query.where(and(...conditions));
    }

    const serviceLines = await query.orderBy(
      asc(serviceLinesTable.sortOrder),
      asc(serviceLinesTable.label)
    );

    return res.json({ serviceLines });
  } catch (err) {
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/service-lines/:id", async (req, res) => {
  try {
    const sl = await db.query.serviceLinesTable.findFirst({
      where: eq(serviceLinesTable.id, req.params.id),
    });
    if (!sl) return res.status(404).json({ error: "Service line not found" });
    return res.json({ serviceLine: sl });
  } catch (err) {
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/service-lines", async (req, res) => {
  try {
    const parsed = serviceLineCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }
    const data = parsed.data;

    const [created] = await db
      .insert(serviceLinesTable)
      .values({
        verticalId: data.verticalId,
        subVerticalId: data.subVerticalId ?? null,
        key: data.key,
        label: data.label,
        description: data.description ?? null,
        naicsCodes: data.naicsCodes,
        pscCodes: data.pscCodes,
        defaultPipelineTemplateKey: data.defaultPipelineTemplateKey ?? null,
        defaultConfig: data.defaultConfig ?? {},
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();

    return res.status(201).json({ serviceLine: created });
  } catch (err: any) {
    const handled = handleUniqueError(err, "Service line", res);
    if (handled) return handled;
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/service-lines/:id", async (req, res) => {
  try {
    const existing = await db.query.serviceLinesTable.findFirst({
      where: eq(serviceLinesTable.id, req.params.id),
    });
    if (!existing) return res.status(404).json({ error: "Service line not found" });

    const parsed = serviceLineUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    }

    const [updated] = await db
      .update(serviceLinesTable)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(serviceLinesTable.id, req.params.id))
      .returning();

    return res.json({ serviceLine: updated });
  } catch (err: any) {
    const handled = handleUniqueError(err, "Service line", res);
    if (handled) return handled;
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/service-lines/:id", async (req, res) => {
  try {
    const existing = await db.query.serviceLinesTable.findFirst({
      where: eq(serviceLinesTable.id, req.params.id),
    });
    if (!existing) return res.status(404).json({ error: "Service line not found" });

    const [updated] = await db
      .update(serviceLinesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(serviceLinesTable.id, req.params.id))
      .returning();

    return res.json({ serviceLine: updated });
  } catch (err) {
    req.log?.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

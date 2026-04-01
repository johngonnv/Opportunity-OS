import { Router } from "express";
import { db } from "@workspace/db";
import {
  pipelineViewTemplatesTable,
  workspacePipelineViewsTable,
  pipelinesTable,
  pipelineStagesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const configJsonSchema = z.object({
  stages: z.array(z.object({
    name: z.string(),
    stageOrder: z.number().int().positive(),
    probabilityPercent: z.number().int().min(0).max(100),
  })).optional(),
  savedViews: z.array(z.object({
    name: z.string(),
    filters: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
  requiredFields: z.array(z.string()).optional(),
  automationHints: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const createTemplateSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  vertical: z.string().min(1),
  subVertical: z.string().optional(),
  status: z.enum(["draft", "active", "inactive", "archived"]).optional(),
  isLocked: z.boolean().optional(),
  isClientEditable: z.boolean().optional(),
  configJson: configJsonSchema.optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  vertical: z.string().min(1).optional(),
  subVertical: z.string().optional(),
  status: z.enum(["draft", "active", "inactive", "archived"]).optional(),
  isLocked: z.boolean().optional(),
  isClientEditable: z.boolean().optional(),
  configJson: configJsonSchema.optional(),
});

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["active", "archived"],
  active: ["inactive", "archived"],
  inactive: ["active", "archived"],
  archived: [],
};

router.get("/", async (req, res) => {
  try {
    const templates = await db.select().from(pipelineViewTemplatesTable);
    res.json({ templates });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    const [template] = await db.insert(pipelineViewTemplatesTable).values({
      key: data.key,
      name: data.name,
      vertical: data.vertical,
      subVertical: data.subVertical,
      status: data.status ?? "draft",
      isLocked: data.isLocked ?? false,
      isClientEditable: data.isClientEditable ?? true,
      configJson: data.configJson ?? {},
      createdByUserId: req.authUser!.id,
      updatedByUserId: req.authUser!.id,
    }).returning();
    res.status(201).json({ template });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "A template with this key already exists." });
      return;
    }
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const template = await db.query.pipelineViewTemplatesTable.findFirst({
      where: eq(pipelineViewTemplatesTable.id, req.params.id),
    });
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json({ template });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const template = await db.query.pipelineViewTemplatesTable.findFirst({
      where: eq(pipelineViewTemplatesTable.id, req.params.id),
    });
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
      return;
    }
    const data = parsed.data;

    if (data.status && data.status !== template.status) {
      const allowed = VALID_STATUS_TRANSITIONS[template.status] ?? [];
      if (!allowed.includes(data.status)) {
        res.status(400).json({
          error: `Cannot transition from '${template.status}' to '${data.status}'.`,
        });
        return;
      }
    }

    const [updated] = await db.update(pipelineViewTemplatesTable)
      .set({
        ...data,
        updatedByUserId: req.authUser!.id,
        updatedAt: new Date(),
      })
      .where(eq(pipelineViewTemplatesTable.id, req.params.id))
      .returning();

    res.json({ template: updated });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const template = await db.query.pipelineViewTemplatesTable.findFirst({
      where: eq(pipelineViewTemplatesTable.id, req.params.id),
    });
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const [archived] = await db.update(pipelineViewTemplatesTable)
      .set({ status: "archived", updatedByUserId: req.authUser!.id, updatedAt: new Date() })
      .where(eq(pipelineViewTemplatesTable.id, req.params.id))
      .returning();

    res.json({ template: archived });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/publish", async (req, res) => {
  try {
    const { workspaceId } = req.body;
    if (!workspaceId || typeof workspaceId !== "string") {
      res.status(400).json({ error: "workspaceId is required." });
      return;
    }

    const template = await db.query.pipelineViewTemplatesTable.findFirst({
      where: eq(pipelineViewTemplatesTable.id, req.params.id),
    });
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    if (template.status !== "active") {
      res.status(400).json({ error: "Only active templates can be published." });
      return;
    }

    const configJson = template.configJson as any;
    const stages: Array<{ name: string; stageOrder: number; probabilityPercent: number }> =
      configJson?.stages ?? [];

    let pipelineId: string | null = null;

    const existingView = await db.query.workspacePipelineViewsTable.findFirst({
      where: and(
        eq(workspacePipelineViewsTable.templateId, template.id),
        eq(workspacePipelineViewsTable.workspaceId, workspaceId),
      ),
    });

    if (existingView) {
      pipelineId = existingView.pipelineId;
    }

    if (!pipelineId && stages.length > 0) {
      const existingPipeline = await db.query.pipelinesTable.findFirst({
        where: and(
          eq(pipelinesTable.workspaceId, workspaceId),
          eq(pipelinesTable.name, template.name),
        ),
      });

      if (existingPipeline) {
        pipelineId = existingPipeline.id;
      } else {
        const [pipeline] = await db.insert(pipelinesTable).values({
          workspaceId,
          name: template.name,
          category: template.subVertical ?? template.vertical,
        }).returning();
        pipelineId = pipeline.id;

        for (const stage of stages) {
          await db.insert(pipelineStagesTable).values({
            pipelineId: pipeline.id,
            name: stage.name,
            stageOrder: stage.stageOrder,
            probabilityPercent: stage.probabilityPercent ?? 0,
          });
        }
      }
    }

    let workspacePipelineView: typeof workspacePipelineViewsTable.$inferSelect;

    if (existingView) {
      const [updated] = await db.update(workspacePipelineViewsTable)
        .set({ pipelineId, updatedAt: new Date() })
        .where(eq(workspacePipelineViewsTable.id, existingView.id))
        .returning();
      workspacePipelineView = updated;
    } else {
      const [created] = await db.insert(workspacePipelineViewsTable).values({
        templateId: template.id,
        workspaceId,
        pipelineId,
        isEnabled: true,
        isDefault: false,
        sortOrder: 0,
        visibilityScope: "all",
        settingsJson: {},
      }).returning();
      workspacePipelineView = created;
    }

    res.status(existingView ? 200 : 201).json({ workspacePipelineView });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

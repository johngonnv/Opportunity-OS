import { Router } from "express";
import { db } from "@workspace/db";
import {
  pipelineViewTemplatesTable,
  workspacePipelineViewsTable,
  workspacesTable,
  workspaceAdminAuditLogTable,
} from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { platformAdminMiddleware } from "../lib/platformAdminMiddleware";

const router = Router();

router.use(platformAdminMiddleware);

router.get("/", async (req, res) => {
  try {
    const templates = await db.select()
      .from(pipelineViewTemplatesTable)
      .orderBy(desc(pipelineViewTemplatesTable.createdAt));
    res.json({ templates });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const template = await db.query.pipelineViewTemplatesTable.findFirst({
      where: eq(pipelineViewTemplatesTable.id, req.params.id),
    });
    if (!template) return res.status(404).json({ error: "Template not found." });
    res.json({ template });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, vertical, subVertical, description, status, isLocked, isClientEditable, configJson } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required." });

    const [template] = await db.insert(pipelineViewTemplatesTable).values({
      name,
      vertical: vertical || null,
      subVertical: subVertical || null,
      description: description || null,
      status: status || "draft",
      isLocked: isLocked ?? false,
      isClientEditable: isClientEditable ?? true,
      configJson: configJson || null,
      createdByUserId: req.platformAdmin!.id,
    }).returning();

    res.status(201).json({ template });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const existing = await db.query.pipelineViewTemplatesTable.findFirst({
      where: eq(pipelineViewTemplatesTable.id, req.params.id),
    });
    if (!existing) return res.status(404).json({ error: "Template not found." });

    const { name, vertical, subVertical, description, status, isLocked, isClientEditable, configJson } = req.body;

    const [template] = await db.update(pipelineViewTemplatesTable)
      .set({
        name: name ?? existing.name,
        vertical: vertical !== undefined ? vertical : existing.vertical,
        subVertical: subVertical !== undefined ? subVertical : existing.subVertical,
        description: description !== undefined ? description : existing.description,
        status: status ?? existing.status,
        isLocked: isLocked !== undefined ? isLocked : existing.isLocked,
        isClientEditable: isClientEditable !== undefined ? isClientEditable : existing.isClientEditable,
        configJson: configJson !== undefined ? configJson : existing.configJson,
      })
      .where(eq(pipelineViewTemplatesTable.id, req.params.id))
      .returning();

    res.json({ template });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/:id/clone", async (req, res) => {
  try {
    const existing = await db.query.pipelineViewTemplatesTable.findFirst({
      where: eq(pipelineViewTemplatesTable.id, req.params.id),
    });
    if (!existing) return res.status(404).json({ error: "Template not found." });

    const [clone] = await db.insert(pipelineViewTemplatesTable).values({
      name: `${existing.name}_copy`,
      vertical: existing.vertical,
      subVertical: existing.subVertical,
      description: existing.description,
      status: "draft",
      isLocked: existing.isLocked,
      isClientEditable: existing.isClientEditable,
      configJson: existing.configJson,
      createdByUserId: req.platformAdmin!.id,
    }).returning();

    res.status(201).json({ template: clone });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/:id/archive", async (req, res) => {
  try {
    const existing = await db.query.pipelineViewTemplatesTable.findFirst({
      where: eq(pipelineViewTemplatesTable.id, req.params.id),
    });
    if (!existing) return res.status(404).json({ error: "Template not found." });

    const [template] = await db.update(pipelineViewTemplatesTable)
      .set({ status: "archived" })
      .where(eq(pipelineViewTemplatesTable.id, req.params.id))
      .returning();

    res.json({ template });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/:id/publish", async (req, res) => {
  try {
    const { workspaceId } = req.body;
    if (!workspaceId) return res.status(400).json({ error: "workspaceId is required." });

    const template = await db.query.pipelineViewTemplatesTable.findFirst({
      where: eq(pipelineViewTemplatesTable.id, req.params.id),
    });
    if (!template) return res.status(404).json({ error: "Template not found." });

    const workspace = await db.query.workspacesTable.findFirst({
      where: eq(workspacesTable.id, workspaceId),
    });
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });

    const existingViews = await db.select()
      .from(workspacePipelineViewsTable)
      .where(eq(workspacePipelineViewsTable.workspaceId, workspaceId))
      .orderBy(desc(workspacePipelineViewsTable.sortOrder));

    const maxSort = existingViews.length > 0 ? existingViews[0].sortOrder : -1;

    const [view] = await db.insert(workspacePipelineViewsTable).values({
      workspaceId,
      templateId: template.id,
      name: template.name,
      isEnabled: true,
      isDefault: existingViews.length === 0,
      sortOrder: maxSort + 1,
      isVisible: true,
      publishedByUserId: req.platformAdmin!.id,
    }).returning();

    res.status(201).json({ view });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import {
  workspacePipelineViewsTable,
  pipelineViewTemplatesTable,
  workspaceMembersTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";

const router = Router({ mergeParams: true });

async function requireWorkspaceMember(
  req: import("express").Request,
  res: import("express").Response,
): Promise<boolean> {
  const { workspaceId } = req.params;
  if (!req.authUser) {
    res.status(401).json({ error: "Not authenticated." });
    return false;
  }
  const membership = await db.query.workspaceMembersTable.findFirst({
    where: and(
      eq(workspaceMembersTable.workspaceId, workspaceId),
      eq(workspaceMembersTable.userId, req.authUser.id),
    ),
  });
  if (!membership) {
    res.status(403).json({ error: "Access denied." });
    return false;
  }
  return true;
}

router.get("/", async (req, res) => {
  try {
    const allowed = await requireWorkspaceMember(req, res);
    if (!allowed) return;

    const { workspaceId } = req.params;
    const views = await db.select({
      view: workspacePipelineViewsTable,
      template: pipelineViewTemplatesTable,
    })
      .from(workspacePipelineViewsTable)
      .leftJoin(pipelineViewTemplatesTable, eq(workspacePipelineViewsTable.templateId, pipelineViewTemplatesTable.id))
      .where(eq(workspacePipelineViewsTable.workspaceId, workspaceId))
      .orderBy(asc(workspacePipelineViewsTable.sortOrder));
    res.json({ views });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateViewSchema = z.object({
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  settingsJson: z.record(z.string(), z.unknown()).optional(),
  visibilityScope: z.string().optional(),
});

router.put("/:id", async (req, res) => {
  try {
    const allowed = await requireWorkspaceMember(req, res);
    if (!allowed) return;

    const { workspaceId, id } = req.params;

    const view = await db.query.workspacePipelineViewsTable.findFirst({
      where: and(
        eq(workspacePipelineViewsTable.id, id),
        eq(workspacePipelineViewsTable.workspaceId, workspaceId),
      ),
    });
    if (!view) {
      res.status(404).json({ error: "Pipeline view not found" });
      return;
    }

    const template = await db.query.pipelineViewTemplatesTable.findFirst({
      where: eq(pipelineViewTemplatesTable.id, view.templateId),
    });

    const parsed = updateViewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
      return;
    }
    const data = parsed.data;

    if (template?.isLocked) {
      const lockedFields = ["isEnabled", "sortOrder", "visibilityScope"] as const;
      for (const field of lockedFields) {
        if (data[field] !== undefined) {
          res.status(400).json({
            error: `Cannot modify '${field}' on a locked template view.`,
          });
          return;
        }
      }
    }

    if (data.isDefault === true) {
      await db.update(workspacePipelineViewsTable)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(workspacePipelineViewsTable.workspaceId, workspaceId),
            eq(workspacePipelineViewsTable.isDefault, true),
          ),
        );
    }

    const [updated] = await db.update(workspacePipelineViewsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(workspacePipelineViewsTable.id, id))
      .returning();

    res.json({ view: updated });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

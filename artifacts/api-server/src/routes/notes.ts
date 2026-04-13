import { Router } from "express";
import { db } from "@workspace/db";
import { notesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { enqueuePromotion } from "../lib/promotionQueue";
import { classifyOrgById, type ClassifyOrgOptions } from "../lib/govconClassifier";
import type { Logger } from "pino";

function pinoToClassifyLog(pinoLog: Logger): ClassifyOrgOptions["log"] {
  return {
    info: (obj: object, msg: string) => pinoLog.info(obj, msg),
    error: (obj: object, msg: string) => pinoLog.error(obj, msg),
  };
}

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const [note] = await db.insert(notesTable).values({ ...req.body, workspaceId: workspace.id, createdByUserId: user.id }).returning();
    if (note.organizationId || note.contactId) {
      await enqueuePromotion("NOTE", note.id, workspace.id, "NOTE_ADDED", {
        noteId: note.id, noteContent: note.content,
        organizationId: note.organizationId, contactId: note.contactId,
        workspaceId: workspace.id,
      });
    }
    // Fire-and-forget: reclassify org when a new note is added (notes add context signals)
    if (note.organizationId) {
      classifyOrgById(note.organizationId, workspace.id, { log: pinoToClassifyLog(req.log) }).catch(err =>
        req.log.error({ err, orgId: note.organizationId }, "[govcon] Note-triggered reclassification failed")
      );
    }
    res.status(201).json(note);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [note] = await db.update(notesTable).set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(notesTable.id, req.params.id), eq(notesTable.workspaceId, workspace.id))).returning();
    if (!note) return res.status(404).json({ error: "Not found" });
    if (note.organizationId || note.contactId) {
      await enqueuePromotion("NOTE", note.id, workspace.id, "NOTE_ADDED", {
        noteId: note.id, noteContent: note.content,
        organizationId: note.organizationId, contactId: note.contactId,
        workspaceId: workspace.id,
      });
    }
    // Fire-and-forget: reclassify org when a note is updated (updated notes may add new signals)
    if (note.organizationId) {
      classifyOrgById(note.organizationId, workspace.id, { log: pinoToClassifyLog(req.log) }).catch(err =>
        req.log.error({ err, orgId: note.organizationId }, "[govcon] Note-update reclassification failed")
      );
    }
    res.json(note);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    await db.delete(notesTable).where(and(eq(notesTable.id, req.params.id), eq(notesTable.workspaceId, workspace.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

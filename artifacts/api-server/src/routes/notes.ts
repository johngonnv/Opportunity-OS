import { Router } from "express";
import { db } from "@workspace/db";
import { notesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { enqueuePromotion } from "../lib/promotionQueue";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const [note] = await db.insert(notesTable).values({ ...req.body, workspaceId: workspace.id, createdByUserId: user.id }).returning();
    if (note.organizationId || note.contactId) {
      enqueuePromotion("NOTE", note.id, workspace.id, "NOTE_ADDED", {
        noteId: note.id, noteContent: note.content,
        organizationId: note.organizationId, contactId: note.contactId,
        workspaceId: workspace.id,
      });
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
      enqueuePromotion("NOTE", note.id, workspace.id, "NOTE_ADDED", {
        noteId: note.id, noteContent: note.content,
        organizationId: note.organizationId, contactId: note.contactId,
        workspaceId: workspace.id,
      });
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

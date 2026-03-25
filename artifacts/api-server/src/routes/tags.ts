import { Router } from "express";
import { db } from "@workspace/db";
import { tagsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const tags = await db.select().from(tagsTable).where(eq(tagsTable.workspaceId, workspace.id)).orderBy(asc(tagsTable.name));
    res.json({ tags });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [tag] = await db.insert(tagsTable).values({ ...req.body, workspaceId: workspace.id }).returning();
    res.status(201).json(tag);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

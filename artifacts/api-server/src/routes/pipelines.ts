import { Router } from "express";
import { db } from "@workspace/db";
import { pipelinesTable, pipelineStagesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const pipelines = await db.query.pipelinesTable.findMany({
      where: eq(pipelinesTable.workspaceId, workspace.id),
    });

    const result = await Promise.all(pipelines.map(async (p) => {
      const stages = await db.select().from(pipelineStagesTable)
        .where(eq(pipelineStagesTable.pipelineId, p.id))
        .orderBy(asc(pipelineStagesTable.stageOrder));
      return { ...p, stages };
    }));

    res.json({ pipelines: result });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

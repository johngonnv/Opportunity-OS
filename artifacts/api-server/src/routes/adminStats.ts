import { Router } from "express";
import { db } from "@workspace/db";
import {
  workspacesTable,
  workspaceMembersTable,
  pipelineViewTemplatesTable,
  masterOrganizationsTable,
  organizationStructureScansTable,
  organizationsTable,
} from "@workspace/db";
import { sql, desc, eq } from "drizzle-orm";
import { platformAdminMiddleware } from "../lib/platformAdminMiddleware";

const router = Router();

router.use(platformAdminMiddleware);

router.get("/", async (req, res) => {
  try {
    const [
      workspaceCount,
      memberCount,
      templates,
      masterOrgCount,
      recentScans,
    ] = await Promise.all([
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(workspacesTable),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(workspaceMembersTable),
      db.select({
        status: pipelineViewTemplatesTable.status,
        count: sql<number>`cast(count(*) as int)`,
      })
        .from(pipelineViewTemplatesTable)
        .groupBy(pipelineViewTemplatesTable.status),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(masterOrganizationsTable),
      db.select({
        id: organizationStructureScansTable.id,
        scanStatus: organizationStructureScansTable.scanStatus,
        reviewStatus: organizationStructureScansTable.reviewStatus,
        organizationId: organizationStructureScansTable.organizationId,
        createdAt: organizationStructureScansTable.createdAt,
        organizationName: organizationsTable.name,
      })
        .from(organizationStructureScansTable)
        .leftJoin(organizationsTable, eq(organizationStructureScansTable.organizationId, organizationsTable.id))
        .orderBy(desc(organizationStructureScansTable.createdAt))
        .limit(5),
    ]);

    const totalTemplates = templates.reduce((acc, r) => acc + Number(r.count), 0);
    const activeTemplates = templates.find(r => r.status === "active")?.count ?? 0;

    res.json({
      totalWorkspaces: Number(workspaceCount[0].count),
      totalMembers: Number(memberCount[0].count),
      totalTemplates,
      activeTemplates: Number(activeTemplates),
      totalMasterOrgs: Number(masterOrgCount[0].count),
      recentScans,
    });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-STATS] get failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

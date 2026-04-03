import { Router } from "express";
import { db } from "@workspace/db";
import {
  organizationStructureScansTable,
  organizationsTable,
  masterOrganizationsTable,
  masterOrganizationRelationshipsTable,
  activitiesTable,
  auditLogsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { runStructureScanPipeline } from "../lib/structureScanPipeline";

const router = Router();

// ─── POST /structure-scans  ─────────────────────────────────────────────────
// Create a new structure scan for an organization
router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const { organizationId } = req.body as { organizationId: string };

    if (!organizationId) {
      return res.status(400).json({ error: "organizationId is required" });
    }

    const org = await db.query.organizationsTable.findFirst({
      where: and(
        eq(organizationsTable.id, organizationId),
        eq(organizationsTable.workspaceId, workspace.id),
      ),
    });
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const [scan] = await db.insert(organizationStructureScansTable).values({
      workspaceId: workspace.id,
      organizationId,
      initiatedByUserId: user.id,
      scanStatus: "PENDING",
      reviewStatus: "PENDING_REVIEW",
    }).returning();

    await db.insert(activitiesTable).values({
      workspaceId: workspace.id,
      organizationId,
      type: "STRUCTURE_SCAN_STARTED",
      subject: `Structure scan initiated for ${org.name}`,
      createdByUserId: user.id,
    });

    await db.insert(auditLogsTable).values({
      workspaceId: workspace.id,
      userId: user.id,
      entityType: "organization_structure_scan",
      entityId: scan.id,
      action: "structure_scan_created",
      afterJson: { organizationId, orgName: org.name },
    });

    res.status(201).json(scan);
  } catch (err) {
    req.log.error({ err }, "[STRUCTURE-SCAN] create failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /structure-scans ────────────────────────────────────────────────────
// List structure scans for the workspace (optionally filtered by orgId)
router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { organizationId } = req.query as Record<string, string>;

    const conditions: any[] = [eq(organizationStructureScansTable.workspaceId, workspace.id)];
    if (organizationId) {
      conditions.push(eq(organizationStructureScansTable.organizationId, organizationId));
    }

    const rows = await db.select({
      scan: organizationStructureScansTable,
      orgName: organizationsTable.name,
    })
      .from(organizationStructureScansTable)
      .leftJoin(organizationsTable, eq(organizationStructureScansTable.organizationId, organizationsTable.id))
      .where(and(...conditions))
      .orderBy(desc(organizationStructureScansTable.createdAt))
      .limit(50);

    const result = rows.map((r) => ({ ...r.scan, organizationName: r.orgName ?? null }));
    res.json({ structureScans: result });
  } catch (err) {
    req.log.error({ err }, "[STRUCTURE-SCAN] list failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /structure-scans/:id ────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [row] = await db.select({
      scan: organizationStructureScansTable,
      orgName: organizationsTable.name,
      orgWebsite: organizationsTable.website,
      orgWebsiteDomain: organizationsTable.websiteDomain,
      orgGooglePlaceId: organizationsTable.googlePlaceId,
    })
      .from(organizationStructureScansTable)
      .leftJoin(organizationsTable, eq(organizationStructureScansTable.organizationId, organizationsTable.id))
      .where(and(
        eq(organizationStructureScansTable.id, req.params.id),
        eq(organizationStructureScansTable.workspaceId, workspace.id),
      ));

    if (!row) return res.status(404).json({ error: "Not found" });

    let siblings: Array<{ id: string; canonicalName: string; websiteDomain: string | null }> = [];
    if (row.scan.suggestedParentMasterOrganizationId) {
      const siblingRels = await db.select({
        childId: masterOrganizationRelationshipsTable.childMasterOrganizationId,
        childName: masterOrganizationsTable.canonicalName,
        childDomain: masterOrganizationsTable.websiteDomain,
      })
        .from(masterOrganizationRelationshipsTable)
        .innerJoin(masterOrganizationsTable, eq(masterOrganizationRelationshipsTable.childMasterOrganizationId, masterOrganizationsTable.id))
        .where(eq(masterOrganizationRelationshipsTable.parentMasterOrganizationId, row.scan.suggestedParentMasterOrganizationId))
        .limit(20);

      siblings = siblingRels.map((s) => ({ id: s.childId, canonicalName: s.childName, websiteDomain: s.childDomain }));
    }

    res.json({
      ...row.scan,
      organizationName: row.orgName ?? null,
      siblings,
    });
  } catch (err) {
    req.log.error({ err }, "[STRUCTURE-SCAN] get failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /structure-scans/:id/run ──────────────────────────────────────────
// Trigger the full lookup pipeline
router.post("/:id/run", async (req, res) => {
  const scanId = req.params.id;
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const scan = await db.query.organizationStructureScansTable.findFirst({
      where: and(
        eq(organizationStructureScansTable.id, scanId),
        eq(organizationStructureScansTable.workspaceId, workspace.id),
      ),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });

    const org = await db.query.organizationsTable.findFirst({
      where: eq(organizationsTable.id, scan.organizationId),
    });
    if (!org) return res.status(404).json({ error: "Organization not found" });

    req.log.info({ scanId, orgName: org.name }, "[STRUCTURE-SCAN] running pipeline");

    // Mark as running
    await db.update(organizationStructureScansTable)
      .set({ scanStatus: "MASTER_MATCHED", updatedAt: new Date() })
      .where(eq(organizationStructureScansTable.id, scanId));

    const result = await runStructureScanPipeline({
      orgName: org.name,
      websiteDomain: org.websiteDomain,
      googlePlaceId: org.googlePlaceId,
    });

    const [updated] = await db.update(organizationStructureScansTable).set({
      scanStatus: result.scanStatus,
      suggestedParentMasterOrganizationId: result.suggestedParentMasterOrganizationId,
      suggestedParentName: result.suggestedParentName,
      suggestedUltimateParentName: result.suggestedUltimateParentName,
      suggestedStructureType: result.suggestedStructureType,
      confidenceScore: result.confidenceScore,
      evidenceSummary: result.evidenceSummary,
      externalSourcePayload: result.externalSourcePayload ?? undefined,
      llmReasoningSummary: result.llmReasoningSummary,
      updatedAt: new Date(),
    }).where(eq(organizationStructureScansTable.id, scanId)).returning();

    // Update the org's last scanned time
    await db.update(organizationsTable).set({
      hierarchyLastScannedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(organizationsTable.id, org.id));

    await db.insert(auditLogsTable).values({
      workspaceId: workspace.id,
      userId: null,
      entityType: "organization_structure_scan",
      entityId: scanId,
      action: result.suggestedParentMasterOrganizationId ? "master_match_found" : "external_structure_candidates_found",
      afterJson: {
        scanStatus: result.scanStatus,
        suggestedParentName: result.suggestedParentName,
        confidenceScore: result.confidenceScore,
      },
    });

    // Fetch sibling count for response
    let siblings: Array<{ id: string; canonicalName: string; websiteDomain: string | null }> = [];
    if (result.suggestedParentMasterOrganizationId) {
      const siblingRels = await db.select({
        childId: masterOrganizationRelationshipsTable.childMasterOrganizationId,
        childName: masterOrganizationsTable.canonicalName,
        childDomain: masterOrganizationsTable.websiteDomain,
      })
        .from(masterOrganizationRelationshipsTable)
        .innerJoin(masterOrganizationsTable, eq(masterOrganizationRelationshipsTable.childMasterOrganizationId, masterOrganizationsTable.id))
        .where(eq(masterOrganizationRelationshipsTable.parentMasterOrganizationId, result.suggestedParentMasterOrganizationId))
        .limit(20);
      siblings = siblingRels.map((s) => ({ id: s.childId, canonicalName: s.childName, websiteDomain: s.childDomain }));
    }

    res.json({ scan: updated, siblings });
  } catch (err) {
    req.log.error({ err, scanId }, "[STRUCTURE-SCAN] run failed");
    await db.update(organizationStructureScansTable).set({
      scanStatus: "FAILED",
      updatedAt: new Date(),
    }).where(eq(organizationStructureScansTable.id, scanId)).catch(() => {});
    res.status(500).json({ error: "Pipeline failed", details: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /structure-scans/:id/approve ──────────────────────────────────────
router.post("/:id/approve", async (req, res) => {
  const scanId = req.params.id;
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const scan = await db.query.organizationStructureScansTable.findFirst({
      where: and(
        eq(organizationStructureScansTable.id, scanId),
        eq(organizationStructureScansTable.workspaceId, workspace.id),
      ),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });
    if (scan.scanStatus !== "COMPLETED") {
      return res.status(400).json({ error: "Scan must be in COMPLETED status to approve" });
    }

    const addToMasterGraph = Boolean(req.body.addToMasterGraph);

    const org = await db.query.organizationsTable.findFirst({
      where: and(
        eq(organizationsTable.id, scan.organizationId),
        eq(organizationsTable.workspaceId, workspace.id),
      ),
    });
    if (!org) return res.status(404).json({ error: "Organization not found" });

    // Get the suggested parent master org to find a workspace org to link to
    let parentOrgId: string | null = null;
    if (scan.suggestedParentMasterOrganizationId) {
      const parentWorkspaceOrg = await db.select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(and(
          eq(organizationsTable.masterOrganizationId, scan.suggestedParentMasterOrganizationId),
          eq(organizationsTable.workspaceId, workspace.id),
        ))
        .limit(1);
      if (parentWorkspaceOrg.length > 0) {
        parentOrgId = parentWorkspaceOrg[0].id;
      }
    }

    // Cycle detection (reuse logic from organizations route)
    if (parentOrgId && parentOrgId !== org.id) {
      const wouldCycle = await checkWouldCreateCycle(org.id, parentOrgId, workspace.id);
      if (wouldCycle) {
        return res.status(400).json({ error: "This would create a circular reference in the hierarchy" });
      }
    }

    // Apply hierarchy to workspace org
    const [updatedOrg] = await db.update(organizationsTable).set({
      masterOrganizationId: scan.suggestedParentMasterOrganizationId,
      hierarchyConfidenceScore: scan.confidenceScore,
      hierarchySourceType: "MASTER_DATABASE",
      hierarchyLastReviewedAt: new Date(),
      suggestedParentName: scan.suggestedParentName,
      suggestedUltimateParentName: scan.suggestedUltimateParentName,
      ...(parentOrgId ? { parentOrganizationId: parentOrgId } : {}),
      updatedAt: new Date(),
    }).where(eq(organizationsTable.id, org.id)).returning();

    // Mark scan as approved
    const [updatedScan] = await db.update(organizationStructureScansTable).set({
      reviewStatus: "APPROVED",
      addToMasterGraph,
      updatedAt: new Date(),
    }).where(eq(organizationStructureScansTable.id, scanId)).returning();

    // Optionally promote to master graph
    if (addToMasterGraph && scan.suggestedParentMasterOrganizationId) {
      const existingMasterOrg = await db.query.masterOrganizationsTable.findFirst({
        where: eq(masterOrganizationsTable.canonicalName, org.name),
      });

      if (!existingMasterOrg) {
        const [newMasterOrg] = await db.insert(masterOrganizationsTable).values({
          id: crypto.randomUUID(),
          canonicalName: org.name,
          normalizedName: org.name.toLowerCase().trim(),
          websiteDomain: org.websiteDomain ?? null,
          sourceType: "WORKSPACE_APPROVED",
          sourceConfidence: scan.confidenceScore ?? 0.8,
          aliases: [],
          notes: `Promoted from workspace by user approval`,
        }).returning();

        await db.insert(masterOrganizationRelationshipsTable).values({
          id: crypto.randomUUID(),
          parentMasterOrganizationId: scan.suggestedParentMasterOrganizationId,
          childMasterOrganizationId: newMasterOrg.id,
          relationshipType: "SUBSIDIARY",
          confidenceScore: scan.confidenceScore ?? 0.8,
          evidenceSummary: `Promoted via workspace structure scan approval by user`,
          approvedByUserId: user.id,
          reviewStatus: "APPROVED",
        });

        await db.insert(auditLogsTable).values({
          workspaceId: workspace.id,
          userId: user.id,
          entityType: "master_organization",
          entityId: newMasterOrg.id,
          action: "master_graph_updated",
          afterJson: { canonicalName: newMasterOrg.id, parentId: scan.suggestedParentMasterOrganizationId },
        });
      }
    }

    // Log activity
    await db.insert(activitiesTable).values({
      workspaceId: workspace.id,
      organizationId: org.id,
      type: "STRUCTURE_APPROVED",
      subject: `Structure scan approved: ${org.name} linked to ${scan.suggestedParentName ?? "parent organization"}`,
      createdByUserId: user.id,
    });

    await db.insert(auditLogsTable).values({
      workspaceId: workspace.id,
      userId: user.id,
      entityType: "organization",
      entityId: org.id,
      action: "structure_suggestion_applied",
      beforeJson: {
        masterOrganizationId: org.masterOrganizationId,
        hierarchyConfidenceScore: org.hierarchyConfidenceScore,
      },
      afterJson: {
        masterOrganizationId: updatedOrg.masterOrganizationId,
        hierarchyConfidenceScore: updatedOrg.hierarchyConfidenceScore,
        suggestedParentName: updatedOrg.suggestedParentName,
        addToMasterGraph,
      },
    });

    // Get siblings for response
    let siblings: Array<{ id: string; canonicalName: string; websiteDomain: string | null }> = [];
    if (scan.suggestedParentMasterOrganizationId) {
      const siblingRels = await db.select({
        childId: masterOrganizationRelationshipsTable.childMasterOrganizationId,
        childName: masterOrganizationsTable.canonicalName,
        childDomain: masterOrganizationsTable.websiteDomain,
      })
        .from(masterOrganizationRelationshipsTable)
        .innerJoin(masterOrganizationsTable, eq(masterOrganizationRelationshipsTable.childMasterOrganizationId, masterOrganizationsTable.id))
        .where(eq(masterOrganizationRelationshipsTable.parentMasterOrganizationId, scan.suggestedParentMasterOrganizationId))
        .limit(20);
      siblings = siblingRels.map((s) => ({ id: s.childId, canonicalName: s.childName, websiteDomain: s.childDomain }));
    }

    res.json({ scan: updatedScan, organization: updatedOrg, siblings });
  } catch (err) {
    req.log.error({ err, scanId }, "[STRUCTURE-SCAN] approve failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /structure-scans/:id/reject ───────────────────────────────────────
router.post("/:id/reject", async (req, res) => {
  const scanId = req.params.id;
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const scan = await db.query.organizationStructureScansTable.findFirst({
      where: and(
        eq(organizationStructureScansTable.id, scanId),
        eq(organizationStructureScansTable.workspaceId, workspace.id),
      ),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });

    const [updatedScan] = await db.update(organizationStructureScansTable).set({
      reviewStatus: "REJECTED",
      updatedAt: new Date(),
    }).where(eq(organizationStructureScansTable.id, scanId)).returning();

    const org = await db.query.organizationsTable.findFirst({
      where: eq(organizationsTable.id, scan.organizationId),
    });

    if (org) {
      await db.insert(activitiesTable).values({
        workspaceId: workspace.id,
        organizationId: org.id,
        type: "STRUCTURE_REJECTED",
        subject: `Structure scan rejected for ${org.name}`,
        createdByUserId: user.id,
      });
    }

    res.json(updatedScan);
  } catch (err) {
    req.log.error({ err, scanId }, "[STRUCTURE-SCAN] reject failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Cycle detection helper ───────────────────────────────────────────────────
async function checkWouldCreateCycle(orgId: string, proposedParentId: string, workspaceId: string): Promise<boolean> {
  if (orgId === proposedParentId) return true;
  const visited = new Set<string>();
  let currentId: string | null = proposedParentId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const rows = await db
      .select({ parentId: organizationsTable.parentOrganizationId })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, currentId), eq(organizationsTable.workspaceId, workspaceId)))
      .limit(1);
    if (!rows[0] || !rows[0].parentId) break;
    if (rows[0].parentId === orgId) return true;
    currentId = rows[0].parentId;
  }
  return false;
}

export default router;

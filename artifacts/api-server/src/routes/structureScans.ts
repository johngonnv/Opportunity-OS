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

// ─── Hierarchy helpers (mirrors organizations.ts) ─────────────────────────────

async function wouldCreateCycle(orgId: string, proposedParentId: string, workspaceId: string): Promise<boolean> {
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

async function validateParentInWorkspace(parentId: string, workspaceId: string): Promise<boolean> {
  const rows = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(and(eq(organizationsTable.id, parentId), eq(organizationsTable.workspaceId, workspaceId)))
    .limit(1);
  return rows.length > 0;
}

async function computeUltimateParent(parentId: string | null, workspaceId: string): Promise<string | null> {
  if (!parentId) return null;
  const visited = new Set<string>();
  let currentId = parentId;
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const rows = await db
      .select({ id: organizationsTable.id, parentId: organizationsTable.parentOrganizationId })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, currentId), eq(organizationsTable.workspaceId, workspaceId)))
      .limit(1);
    if (!rows[0]) break;
    if (!rows[0].parentId) return rows[0].id;
    currentId = rows[0].parentId;
  }
  return currentId;
}

async function getDescendantIds(orgId: string, workspaceId: string): Promise<string[]> {
  const result: string[] = [];
  const queue = [orgId];
  for (let depth = 0; depth < 10 && queue.length > 0; depth++) {
    const batch = queue.splice(0, queue.length);
    const children = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(and(
        inArray(organizationsTable.parentOrganizationId, batch),
        eq(organizationsTable.workspaceId, workspaceId),
      ));
    for (const c of children) {
      result.push(c.id);
      queue.push(c.id);
    }
  }
  return result;
}

async function propagateUltimateParent(orgId: string, ultimateParentId: string | null, workspaceId: string): Promise<void> {
  const descendantIds = await getDescendantIds(orgId, workspaceId);
  if (descendantIds.length === 0) return;
  await db.update(organizationsTable)
    .set({ ultimateParentOrganizationId: ultimateParentId, updatedAt: new Date() })
    .where(and(inArray(organizationsTable.id, descendantIds), eq(organizationsTable.workspaceId, workspaceId)));
}

// ─── Sibling helper ───────────────────────────────────────────────────────────

async function getSiblings(parentMasterOrgId: string): Promise<Array<{ id: string; canonicalName: string; websiteDomain: string | null }>> {
  const siblingRels = await db.select({
    childId: masterOrganizationRelationshipsTable.childMasterOrganizationId,
    childName: masterOrganizationsTable.canonicalName,
    childDomain: masterOrganizationsTable.websiteDomain,
  })
    .from(masterOrganizationRelationshipsTable)
    .innerJoin(masterOrganizationsTable, eq(masterOrganizationRelationshipsTable.childMasterOrganizationId, masterOrganizationsTable.id))
    .where(eq(masterOrganizationRelationshipsTable.parentMasterOrganizationId, parentMasterOrgId))
    .limit(20);
  return siblingRels.map((s) => ({ id: s.childId, canonicalName: s.childName, websiteDomain: s.childDomain }));
}

// ─── POST /structure-scans  ──────────────────────────────────────────────────

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

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { organizationId } = req.query as Record<string, string>;

    const conditions: Parameters<typeof and>[0][] = [eq(organizationStructureScansTable.workspaceId, workspace.id)];
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
      siblings = await getSiblings(row.scan.suggestedParentMasterOrganizationId);
    }

    res.json({ ...row.scan, organizationName: row.orgName ?? null, siblings });
  } catch (err) {
    req.log.error({ err }, "[STRUCTURE-SCAN] get failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /structure-scans/:id/run ──────────────────────────────────────────

router.post("/:id/run", async (req, res) => {
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

    const org = await db.query.organizationsTable.findFirst({
      where: eq(organizationsTable.id, scan.organizationId),
    });
    if (!org) return res.status(404).json({ error: "Organization not found" });

    req.log.info({ scanId, orgName: org.name }, "[STRUCTURE-SCAN] running pipeline");

    // Update to MASTER_MATCHED step (pipeline running)
    await db.update(organizationStructureScansTable)
      .set({ scanStatus: "MASTER_MATCHED", updatedAt: new Date() })
      .where(eq(organizationStructureScansTable.id, scanId));

    const result = await runStructureScanPipeline({
      orgName: org.name,
      websiteDomain: org.websiteDomain,
      googlePlaceId: org.googlePlaceId,
      onStatusUpdate: async (status) => {
        await db.update(organizationStructureScansTable)
          .set({ scanStatus: status, updatedAt: new Date() })
          .where(eq(organizationStructureScansTable.id, scanId))
          .catch(() => {});
      },
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

    // Update org's last scanned timestamp
    await db.update(organizationsTable).set({
      hierarchyLastScannedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(organizationsTable.id, org.id));

    // Log STRUCTURE_SUGGESTED activity if a suggestion was found
    if (result.suggestedParentName && result.scanStatus === "COMPLETED") {
      await db.insert(activitiesTable).values({
        workspaceId: workspace.id,
        organizationId: org.id,
        type: "STRUCTURE_SUGGESTED",
        subject: `Structure suggestion for ${org.name}: parent is ${result.suggestedParentName} (confidence ${((result.confidenceScore ?? 0) * 100).toFixed(0)}%)`,
        createdByUserId: user.id,
      });

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
    }

    let siblings: Array<{ id: string; canonicalName: string; websiteDomain: string | null }> = [];
    if (result.suggestedParentMasterOrganizationId) {
      siblings = await getSiblings(result.suggestedParentMasterOrganizationId);
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

    // Find if there's a workspace org already linked to the suggested master parent
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

    // Validate parent and check for cycles using shared helpers
    if (parentOrgId) {
      const parentValid = await validateParentInWorkspace(parentOrgId, workspace.id);
      if (!parentValid) {
        return res.status(400).json({ error: "Suggested parent organization not found in this workspace" });
      }
      const cycle = await wouldCreateCycle(org.id, parentOrgId, workspace.id);
      if (cycle) {
        return res.status(400).json({ error: "This would create a circular reference in the hierarchy" });
      }
    }

    // Compute ultimate parent for workspace hierarchy
    const ultimateParentId = parentOrgId ? await computeUltimateParent(parentOrgId, workspace.id) : null;

    // Determine hierarchy source type from the scan's dominant evidence path
    let hierarchySourceType: "MASTER_DATABASE" | "EXTERNAL_ENRICHMENT" | "LLM_SYNTHESIS" | "HUMAN_CONFIRMED" =
      "MASTER_DATABASE";
    const llmReasoning = scan.llmReasoningSummary;
    const hasLlmContent =
      llmReasoning &&
      llmReasoning.length > 0 &&
      !llmReasoning.startsWith("LLM not configured") &&
      !llmReasoning.startsWith("LLM error");
    const externalPayload = scan.externalSourcePayload as Record<string, unknown> | null;
    const hasExternalContent =
      externalPayload !== null &&
      externalPayload !== undefined &&
      (Object.keys(externalPayload).length > 0);
    if (hasLlmContent) {
      hierarchySourceType = "LLM_SYNTHESIS";
    } else if (hasExternalContent && !scan.suggestedParentMasterOrganizationId) {
      hierarchySourceType = "EXTERNAL_ENRICHMENT";
    }

    // Apply hierarchy to workspace org
    const [updatedOrg] = await db.update(organizationsTable).set({
      masterOrganizationId: scan.suggestedParentMasterOrganizationId,
      hierarchyConfidenceScore: scan.confidenceScore,
      hierarchySourceType,
      hierarchyLastReviewedAt: new Date(),
      suggestedParentName: scan.suggestedParentName,
      suggestedUltimateParentName: scan.suggestedUltimateParentName,
      ...(parentOrgId
        ? {
          parentOrganizationId: parentOrgId,
          ultimateParentOrganizationId: ultimateParentId ?? parentOrgId,
        }
        : {}),
      updatedAt: new Date(),
    }).where(eq(organizationsTable.id, org.id)).returning();

    // Propagate ultimate parent to descendants (reuses existing logic)
    if (parentOrgId) {
      await propagateUltimateParent(org.id, ultimateParentId ?? parentOrgId, workspace.id);
    }

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
        const normalizedName = org.name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
        const [newMasterOrg] = await db.insert(masterOrganizationsTable).values({
          id: crypto.randomUUID(),
          canonicalName: org.name,
          normalizedName,
          websiteDomain: org.websiteDomain ?? null,
          sourceType: "WORKSPACE_APPROVED",
          sourceConfidence: scan.confidenceScore ?? 0.8,
          aliases: [],
          notes: "Promoted from workspace by user approval",
        }).returning();

        await db.insert(masterOrganizationRelationshipsTable).values({
          id: crypto.randomUUID(),
          parentMasterOrganizationId: scan.suggestedParentMasterOrganizationId,
          childMasterOrganizationId: newMasterOrg.id,
          relationshipType: "SUBSIDIARY",
          confidenceScore: scan.confidenceScore ?? 0.8,
          evidenceSummary: "Promoted via workspace structure scan approval",
          approvedByUserId: user.id,
          reviewStatus: "APPROVED",
        });

        await db.insert(auditLogsTable).values({
          workspaceId: workspace.id,
          userId: user.id,
          entityType: "master_organization",
          entityId: newMasterOrg.id,
          action: "master_graph_updated",
          afterJson: { canonicalName: org.name, parentId: scan.suggestedParentMasterOrganizationId },
        });
      }
    }

    // Log STRUCTURE_APPROVED activity
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
        parentOrganizationId: org.parentOrganizationId,
      },
      afterJson: {
        masterOrganizationId: updatedOrg.masterOrganizationId,
        hierarchyConfidenceScore: updatedOrg.hierarchyConfidenceScore,
        suggestedParentName: updatedOrg.suggestedParentName,
        parentOrganizationId: updatedOrg.parentOrganizationId,
        addToMasterGraph,
      },
    });

    let siblings: Array<{ id: string; canonicalName: string; websiteDomain: string | null }> = [];
    if (scan.suggestedParentMasterOrganizationId) {
      siblings = await getSiblings(scan.suggestedParentMasterOrganizationId);
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

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { masterOrganizationRelationshipsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// ─── PUT /admin/master-organization-relationships/:id ─────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const VALID_RELATIONSHIP_TYPES = ["SUBSIDIARY", "REGIONAL", "DBA", "AFFILIATED"] as const;
    type RelType = typeof VALID_RELATIONSHIP_TYPES[number];

    const { relationshipType, confidenceScore, evidenceSummary } = req.body as {
      relationshipType?: RelType;
      confidenceScore?: number;
      evidenceSummary?: string;
    };

    if (relationshipType !== undefined && !VALID_RELATIONSHIP_TYPES.includes(relationshipType)) {
      return res.status(400).json({
        error: `Invalid relationshipType. Must be one of: ${VALID_RELATIONSHIP_TYPES.join(", ")}`,
      });
    }
    if (confidenceScore !== undefined && (confidenceScore < 0 || confidenceScore > 1)) {
      return res.status(400).json({ error: "confidenceScore must be between 0 and 1" });
    }

    const update: Partial<typeof masterOrganizationRelationshipsTable.$inferInsert> = {};
    if (relationshipType) update.relationshipType = relationshipType;
    if (confidenceScore != null) update.confidenceScore = confidenceScore;
    if (evidenceSummary !== undefined) update.evidenceSummary = evidenceSummary;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const [updated] = await db.update(masterOrganizationRelationshipsTable)
      .set(update)
      .where(eq(masterOrganizationRelationshipsTable.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-RELS] update failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /admin/master-organization-relationships/:id ─────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const [deleted] = await db.delete(masterOrganizationRelationshipsTable)
      .where(eq(masterOrganizationRelationshipsTable.id, req.params.id))
      .returning({ id: masterOrganizationRelationshipsTable.id });
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true, id: deleted.id });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-RELS] delete failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

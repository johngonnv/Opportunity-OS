import { Router } from "express";
import { db } from "@workspace/db";
import { masterOrganizationRelationshipsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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

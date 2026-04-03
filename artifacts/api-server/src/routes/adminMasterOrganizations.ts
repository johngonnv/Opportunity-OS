import { Router } from "express";
import { db } from "@workspace/db";
import {
  masterOrganizationsTable,
  masterOrganizationRelationshipsTable,
} from "@workspace/db";
import { eq, ilike, desc, and, sql } from "drizzle-orm";
import { normalizeOrgName } from "../lib/orgNameNormalization";

const router = Router();

// ─── GET /admin/master-organizations ─────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { search, page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: ReturnType<typeof ilike>[] = [];
    if (search) {
      conditions.push(ilike(masterOrganizationsTable.canonicalName, `%${search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [orgs, totalResult] = await Promise.all([
      db.select().from(masterOrganizationsTable)
        .where(whereClause)
        .orderBy(desc(masterOrganizationsTable.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(masterOrganizationsTable).where(whereClause),
    ]);

    res.json({ masterOrganizations: orgs, total: Number(totalResult[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] list failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/master-organizations ────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { canonicalName, websiteDomain, aliases, headquartersAddress, notes, sourceType } = req.body as {
      canonicalName: string;
      websiteDomain?: string;
      aliases?: string[];
      headquartersAddress?: string;
      notes?: string;
      sourceType?: string;
    };

    if (!canonicalName?.trim()) {
      return res.status(400).json({ error: "canonicalName is required" });
    }

    const [org] = await db.insert(masterOrganizationsTable).values({
      id: crypto.randomUUID(),
      canonicalName: canonicalName.trim(),
      normalizedName: normalizeOrgName(canonicalName.trim()),
      websiteDomain: websiteDomain ?? null,
      aliases: aliases ?? [],
      headquartersAddress: headquartersAddress ?? null,
      notes: notes ?? null,
      sourceType: sourceType ?? "MANUAL",
      sourceConfidence: 1.0,
    }).returning();

    res.status(201).json(org);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] create failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/master-organizations/:id ─────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const org = await db.query.masterOrganizationsTable.findFirst({
      where: eq(masterOrganizationsTable.id, req.params.id),
    });
    if (!org) return res.status(404).json({ error: "Not found" });
    res.json(org);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] get failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /admin/master-organizations/:id ─────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const { canonicalName, websiteDomain, aliases, headquartersAddress, notes, sourceType, sourceConfidence } = req.body as {
      canonicalName?: string;
      websiteDomain?: string;
      aliases?: string[];
      headquartersAddress?: string;
      notes?: string;
      sourceType?: string;
      sourceConfidence?: number;
    };

    const update: Partial<typeof masterOrganizationsTable.$inferInsert> = { updatedAt: new Date() };
    if (canonicalName != null) {
      update.canonicalName = canonicalName.trim();
      update.normalizedName = normalizeOrgName(canonicalName.trim());
    }
    if (websiteDomain !== undefined) update.websiteDomain = websiteDomain || null;
    if (aliases !== undefined) update.aliases = aliases;
    if (headquartersAddress !== undefined) update.headquartersAddress = headquartersAddress || null;
    if (notes !== undefined) update.notes = notes || null;
    if (sourceType !== undefined) update.sourceType = sourceType;
    if (sourceConfidence !== undefined) update.sourceConfidence = sourceConfidence;

    const [updated] = await db.update(masterOrganizationsTable).set(update)
      .where(eq(masterOrganizationsTable.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] update failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /admin/master-organizations/:id ───────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const [deleted] = await db.delete(masterOrganizationsTable)
      .where(eq(masterOrganizationsTable.id, req.params.id)).returning({ id: masterOrganizationsTable.id });
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true, id: deleted.id });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] delete failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/master-organizations/:id/relationships ───────────────────────
router.get("/:id/relationships", async (req, res) => {
  try {
    const org = await db.query.masterOrganizationsTable.findFirst({
      where: eq(masterOrganizationsTable.id, req.params.id),
    });
    if (!org) return res.status(404).json({ error: "Not found" });

    const [asParent, asChild] = await Promise.all([
      db.select({
        rel: masterOrganizationRelationshipsTable,
        childName: masterOrganizationsTable.canonicalName,
      })
        .from(masterOrganizationRelationshipsTable)
        .innerJoin(masterOrganizationsTable, eq(masterOrganizationRelationshipsTable.childMasterOrganizationId, masterOrganizationsTable.id))
        .where(eq(masterOrganizationRelationshipsTable.parentMasterOrganizationId, req.params.id)),
      db.select({
        rel: masterOrganizationRelationshipsTable,
        parentName: masterOrganizationsTable.canonicalName,
      })
        .from(masterOrganizationRelationshipsTable)
        .innerJoin(masterOrganizationsTable, eq(masterOrganizationRelationshipsTable.parentMasterOrganizationId, masterOrganizationsTable.id))
        .where(eq(masterOrganizationRelationshipsTable.childMasterOrganizationId, req.params.id)),
    ]);

    res.json({
      organization: org,
      childRelationships: asParent.map((r) => ({ ...r.rel, childName: r.childName })),
      parentRelationships: asChild.map((r) => ({ ...r.rel, parentName: r.parentName })),
    });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] relationships get failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/master-organizations/:id/relationships ──────────────────────
router.post("/:id/relationships", async (req, res) => {
  try {
    const {
      childMasterOrganizationId,
      relationshipType = "SUBSIDIARY",
      confidenceScore = 1.0,
      evidenceSummary,
    } = req.body as {
      childMasterOrganizationId: string;
      relationshipType?: "SUBSIDIARY" | "REGIONAL" | "DBA" | "AFFILIATED";
      confidenceScore?: number;
      evidenceSummary?: string;
    };

    if (!childMasterOrganizationId) {
      return res.status(400).json({ error: "childMasterOrganizationId is required" });
    }

    const [parentOrg, childOrg] = await Promise.all([
      db.query.masterOrganizationsTable.findFirst({ where: eq(masterOrganizationsTable.id, req.params.id) }),
      db.query.masterOrganizationsTable.findFirst({ where: eq(masterOrganizationsTable.id, childMasterOrganizationId) }),
    ]);
    if (!parentOrg) return res.status(404).json({ error: "Parent organization not found" });
    if (!childOrg) return res.status(404).json({ error: "Child organization not found" });

    const adminUser = req.platformAdmin;
    const [rel] = await db.insert(masterOrganizationRelationshipsTable).values({
      id: crypto.randomUUID(),
      parentMasterOrganizationId: req.params.id,
      childMasterOrganizationId,
      relationshipType,
      confidenceScore,
      evidenceSummary: evidenceSummary ?? null,
      approvedByUserId: adminUser?.id ?? null,
      reviewStatus: "APPROVED",
    }).returning();

    res.status(201).json(rel);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] relationship create failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

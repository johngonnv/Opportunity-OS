import { Router } from "express";
import { db } from "@workspace/db";
import {
  masterOrganizationsTable,
  masterOrganizationRelationshipsTable,
  masterOrganizationAliasesTable,
  masterOrgHealthcareOverlayTable,
  masterOrgGovconOverlayTable,
  organizationStructureScansTable,
  organizationsTable,
  workspacesTable,
  usersTable,
} from "@workspace/db";
import { eq, ilike, desc, and, sql, or, ne } from "drizzle-orm";
import { normalizeOrgName, normalizeDomain } from "../lib/orgNameNormalization";
import { computeCompleteness, computeNextBestAction } from "../lib/completeness";

const router = Router();

// ─── GET /admin/master-organizations/suggest-link ────────────────────────────
// Must be before /:id to avoid param capture
// Given a workspace org name/domain, suggest top master org matches
router.get("/suggest-link", async (req, res) => {
  try {
    const { orgName, domain } = req.query as Record<string, string>;
    if (!orgName) return res.status(400).json({ error: "orgName is required" });

    const normalized = normalizeOrgName(orgName);
    const normDomain = domain ? normalizeDomain(domain) : null;

    const candidates = await db.execute<{
      id: string;
      canonical_name: string;
      normalized_name: string;
      website_domain: string | null;
      industry: string | null;
      account_structure_type: string | null;
      validation_status: string;
      confidence_score: number;
    }>(sql`
      SELECT
        id, canonical_name, normalized_name, website_domain,
        industry, account_structure_type, validation_status, confidence_score
      FROM master_organizations
      WHERE
        normalized_name ILIKE ${`%${normalized}%`}
        OR canonical_name ILIKE ${`%${orgName}%`}
        ${normDomain ? sql`OR website_domain = ${normDomain}` : sql``}
      ORDER BY
        CASE WHEN normalized_name = ${normalized} THEN 0
             WHEN website_domain = ${normDomain ?? ""} THEN 1
             WHEN normalized_name ILIKE ${`%${normalized}%`} THEN 2
             ELSE 3
        END,
        confidence_score DESC
      LIMIT 5
    `);

    const scored = candidates.rows.map(c => {
      let score = 0.75;
      if (c.normalized_name === normalized) score = 0.95;
      else if (normDomain && c.website_domain === normDomain) score = 0.85;

      if (normDomain && c.website_domain === normDomain) score = Math.min(1.0, score + 0.15);

      return {
        id: c.id,
        canonicalName: c.canonical_name,
        websiteDomain: c.website_domain,
        industry: c.industry,
        accountStructureType: c.account_structure_type,
        validationStatus: c.validation_status,
        confidenceScore: parseFloat(score.toFixed(2)),
        confidenceBand: score >= 0.80 ? "HIGH" : score >= 0.50 ? "MEDIUM" : "LOW",
      };
    });

    res.json({ suggestions: scored, total: scored.length });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] suggest-link failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/master-organizations/completeness-audit ──────────────────────
// List master orgs with completeness score + health stage, sortable
// Must be before /:id
router.get("/completeness-audit", async (req, res) => {
  try {
    const { healthStage, industry, sort = "score_asc", page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const orgs = await db.execute<{
      id: string;
      canonical_name: string;
      normalized_name: string;
      website_domain: string | null;
      industry: string | null;
      sub_vertical: string | null;
      account_structure_type: string | null;
      validation_status: string;
      confidence_score: number;
      is_standalone: boolean;
      aliases: string[];
      admin_flags: string[];
      city: string | null;
      state: string | null;
      structure_last_scanned_at: string | null;
      updated_at: string;
      has_parent: boolean;
      has_ultimate_parent: boolean;
      has_healthcare: boolean;
      facility_type: string | null;
      has_govcon: boolean;
      uei: string | null;
      alias_count: number;
    }>(sql`
      SELECT
        mo.id, mo.canonical_name, mo.normalized_name, mo.website_domain,
        mo.industry, mo.sub_vertical, mo.account_structure_type, mo.validation_status,
        mo.confidence_score, mo.is_standalone, mo.aliases, mo.admin_flags,
        mo.city, mo.state, mo.structure_last_scanned_at, mo.updated_at,
        EXISTS (
          SELECT 1 FROM master_organization_relationships r
          WHERE r.child_master_organization_id = mo.id
        ) AS has_parent,
        EXISTS (
          SELECT 1 FROM master_organization_relationships r1
          JOIN master_organization_relationships r2 ON r2.child_master_organization_id = r1.parent_master_organization_id
          WHERE r1.child_master_organization_id = mo.id
        ) AS has_ultimate_parent,
        (hc.id IS NOT NULL) AS has_healthcare,
        hc.facility_type,
        (gc.id IS NOT NULL) AS has_govcon,
        gc.uei,
        (SELECT count(*) FROM master_organization_aliases a WHERE a.master_organization_id = mo.id) AS alias_count
      FROM master_organizations mo
      LEFT JOIN master_org_healthcare_overlays hc ON hc.master_organization_id = mo.id
      LEFT JOIN master_org_govcon_overlays gc ON gc.master_organization_id = mo.id
      ${industry && industry !== "ALL" ? sql`WHERE mo.industry = ${industry}::master_org_industry` : sql``}
    `);

    const scored = orgs.rows.map(o => {
      const completeness = computeCompleteness({
        canonicalName: o.canonical_name,
        normalizedName: o.normalized_name,
        websiteDomain: o.website_domain,
        industry: o.industry,
        subVertical: o.sub_vertical,
        accountStructureType: o.account_structure_type,
        validationStatus: o.validation_status,
        confidenceScore: o.confidence_score,
        isStandalone: o.is_standalone,
        aliases: (o.aliases as string[]) ?? [],
        adminFlags: (o.admin_flags as string[]) ?? [],
        city: o.city,
        state: o.state,
        structureLastScannedAt: o.structure_last_scanned_at ? new Date(o.structure_last_scanned_at) : null,
        hasParent: o.has_parent,
        hasUltimateParent: o.has_ultimate_parent,
        hasHealthcareOverlay: o.has_healthcare,
        hasFacilityType: !!o.facility_type,
        hasGovconOverlay: o.has_govcon,
        hasUei: !!o.uei,
        aliasCount: parseInt(String(o.alias_count)),
      });
      return {
        id: o.id,
        canonicalName: o.canonical_name,
        industry: o.industry,
        validationStatus: o.validation_status,
        ...completeness,
      };
    });

    let filtered = healthStage && healthStage !== "ALL"
      ? scored.filter(s => s.healthStage === healthStage)
      : scored;

    if (sort === "score_asc") filtered.sort((a, b) => a.percentage - b.percentage);
    else if (sort === "score_desc") filtered.sort((a, b) => b.percentage - a.percentage);

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limitNum);

    const stageCounts = { INCOMPLETE: 0, IDENTIFIED: 0, STRUCTURED: 0, STRATEGIC: 0 };
    for (const s of scored) stageCounts[s.healthStage]++;

    res.json({ orgs: paginated, total, page: pageNum, limit: limitNum, stageCounts });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] completeness-audit failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/master-organizations ─────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { search, sourceType, industry, validationStatus, page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    if (search) {
      conditions.push(ilike(masterOrganizationsTable.canonicalName, `%${search}%`));
    }
    if (sourceType && sourceType !== "ALL") {
      conditions.push(eq(masterOrganizationsTable.sourceType, sourceType));
    }
    if (industry && industry !== "ALL") {
      conditions.push(eq(masterOrganizationsTable.industry, industry as any));
    }
    if (validationStatus && validationStatus !== "ALL") {
      conditions.push(eq(masterOrganizationsTable.validationStatus, validationStatus as any));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [orgs, totalResult, parentCounts, childCounts] = await Promise.all([
      db.select().from(masterOrganizationsTable)
        .where(whereClause)
        .orderBy(desc(masterOrganizationsTable.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(masterOrganizationsTable).where(whereClause),
      db.select({
        orgId: masterOrganizationRelationshipsTable.parentMasterOrganizationId,
        cnt: sql<number>`cast(count(*) as int)`,
      }).from(masterOrganizationRelationshipsTable)
        .groupBy(masterOrganizationRelationshipsTable.parentMasterOrganizationId),
      db.select({
        orgId: masterOrganizationRelationshipsTable.childMasterOrganizationId,
        cnt: sql<number>`cast(count(*) as int)`,
      }).from(masterOrganizationRelationshipsTable)
        .groupBy(masterOrganizationRelationshipsTable.childMasterOrganizationId),
    ]);

    const relCountMap: Record<string, number> = {};
    for (const r of parentCounts) relCountMap[r.orgId] = (relCountMap[r.orgId] ?? 0) + Number(r.cnt);
    for (const r of childCounts) relCountMap[r.orgId] = (relCountMap[r.orgId] ?? 0) + Number(r.cnt);

    const orgsWithCount = orgs.map((o) => ({
      ...o,
      relationshipCount: relCountMap[o.id] ?? 0,
    }));

    res.json({ masterOrganizations: orgsWithCount, total: Number(totalResult[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] list failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /admin/master-organizations ────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      canonicalName, displayName, normalizedName, websiteDomain,
      industry, subVertical, accountStructureType, isStandalone,
      confidenceScore, validationStatus, aliases, headquartersAddress,
      city, state, country, notes, sourceType,
    } = req.body as Record<string, any>;

    const VALID_SOURCE_TYPES = ["MANUAL", "SEED", "WORKSPACE_APPROVED"] as const;

    if (!canonicalName?.trim()) {
      return res.status(400).json({ error: "canonicalName is required" });
    }
    if (sourceType && !VALID_SOURCE_TYPES.includes(sourceType)) {
      return res.status(400).json({ error: `Invalid sourceType. Must be one of: ${VALID_SOURCE_TYPES.join(", ")}` });
    }

    const derivedNormalized = normalizedName?.trim() || normalizeOrgName(canonicalName.trim());
    const derivedDomain = websiteDomain ? normalizeDomain(websiteDomain) : null;

    const [org] = await db.insert(masterOrganizationsTable).values({
      id: crypto.randomUUID(),
      canonicalName: canonicalName.trim(),
      displayName: displayName?.trim() ?? null,
      normalizedName: derivedNormalized,
      websiteDomain: derivedDomain,
      industry: industry ?? null,
      subVertical: subVertical ?? null,
      accountStructureType: accountStructureType ?? null,
      isStandalone: isStandalone ?? false,
      confidenceScore: confidenceScore ?? 0.5,
      validationStatus: validationStatus ?? "UNVALIDATED",
      aliases: aliases ?? [],
      headquartersAddress: headquartersAddress ?? null,
      city: city ?? null,
      state: state ?? null,
      country: country ?? null,
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
    const [org, aliases, healthcareOverlay, govconOverlay] = await Promise.all([
      db.query.masterOrganizationsTable.findFirst({
        where: eq(masterOrganizationsTable.id, req.params.id),
      }),
      db.select().from(masterOrganizationAliasesTable)
        .where(eq(masterOrganizationAliasesTable.masterOrganizationId, req.params.id))
        .orderBy(masterOrganizationAliasesTable.createdAt),
      db.query.masterOrgHealthcareOverlayTable.findFirst({
        where: eq(masterOrgHealthcareOverlayTable.masterOrganizationId, req.params.id),
      }),
      db.query.masterOrgGovconOverlayTable.findFirst({
        where: eq(masterOrgGovconOverlayTable.masterOrganizationId, req.params.id),
      }),
    ]);
    if (!org) return res.status(404).json({ error: "Not found" });
    res.json({ ...org, aliasRecords: aliases, healthcareOverlay: healthcareOverlay ?? null, govconOverlay: govconOverlay ?? null });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] get failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /admin/master-organizations/:id ─────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const {
      canonicalName, displayName, normalizedName, websiteDomain, aliases,
      headquartersAddress, city, state, country, notes, sourceType, sourceConfidence,
      industry, subVertical, accountStructureType, isStandalone,
      confidenceScore, validationStatus,
    } = req.body as Record<string, any>;

    const VALID_SOURCE_TYPES_PUT = ["MANUAL", "SEED", "WORKSPACE_APPROVED"] as const;
    if (sourceType !== undefined && !VALID_SOURCE_TYPES_PUT.includes(sourceType)) {
      return res.status(400).json({ error: `Invalid sourceType. Must be one of: ${VALID_SOURCE_TYPES_PUT.join(", ")}` });
    }
    if (sourceConfidence !== undefined && (sourceConfidence < 0 || sourceConfidence > 1)) {
      return res.status(400).json({ error: "sourceConfidence must be between 0 and 1" });
    }

    const update: Partial<typeof masterOrganizationsTable.$inferInsert> = { updatedAt: new Date() };
    if (canonicalName != null) {
      update.canonicalName = canonicalName.trim();
      update.normalizedName = normalizedName?.trim() || normalizeOrgName(canonicalName.trim());
    } else if (normalizedName != null) {
      update.normalizedName = normalizedName.trim();
    }
    if (displayName !== undefined) update.displayName = displayName?.trim() || null;
    if (websiteDomain !== undefined) update.websiteDomain = websiteDomain ? normalizeDomain(websiteDomain) : null;
    if (aliases !== undefined) update.aliases = aliases;
    if (headquartersAddress !== undefined) update.headquartersAddress = headquartersAddress || null;
    if (city !== undefined) update.city = city || null;
    if (state !== undefined) update.state = state || null;
    if (country !== undefined) update.country = country || null;
    if (notes !== undefined) update.notes = notes || null;
    if (sourceType !== undefined) update.sourceType = sourceType;
    if (sourceConfidence !== undefined) update.sourceConfidence = sourceConfidence;
    if (industry !== undefined) update.industry = industry || null;
    if (subVertical !== undefined) update.subVertical = subVertical || null;
    if (accountStructureType !== undefined) update.accountStructureType = accountStructureType || null;
    if (isStandalone !== undefined) update.isStandalone = isStandalone;
    if (confidenceScore !== undefined) update.confidenceScore = confidenceScore;
    if (validationStatus !== undefined) update.validationStatus = validationStatus;

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

// ─── PATCH /:id/validation-status — quick status update ──────────────────────
router.patch("/:id/validation-status", async (req, res) => {
  try {
    const { validationStatus } = req.body as { validationStatus: string };
    if (!validationStatus) return res.status(400).json({ error: "validationStatus is required" });

    const [updated] = await db.update(masterOrganizationsTable)
      .set({ validationStatus: validationStatus as any, updatedAt: new Date() })
      .where(eq(masterOrganizationsTable.id, req.params.id))
      .returning({ id: masterOrganizationsTable.id, validationStatus: masterOrganizationsTable.validationStatus });

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] validation-status patch failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /:id/structure-scan — initiate structure scan ──────────────────────
router.post("/:id/structure-scan", async (req, res) => {
  try {
    const org = await db.query.masterOrganizationsTable.findFirst({
      where: eq(masterOrganizationsTable.id, req.params.id),
    });
    if (!org) return res.status(404).json({ error: "Not found" });

    const currentFlags: string[] = (org.adminFlags as string[]) ?? [];
    const newFlags = currentFlags.filter(f => f !== "structure_not_run");

    await db.update(masterOrganizationsTable)
      .set({
        structureLastScannedAt: new Date(),
        adminFlags: newFlags as any,
        updatedAt: new Date(),
      })
      .where(eq(masterOrganizationsTable.id, req.params.id));

    res.json({ initiated: true, scannedAt: new Date().toISOString() });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] structure-scan failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── ALIASES ──────────────────────────────────────────────────────────────────

router.get("/:id/aliases", async (req, res) => {
  try {
    const aliases = await db.select().from(masterOrganizationAliasesTable)
      .where(eq(masterOrganizationAliasesTable.masterOrganizationId, req.params.id))
      .orderBy(masterOrganizationAliasesTable.createdAt);
    res.json({ aliases, total: aliases.length });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] aliases get failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/aliases", async (req, res) => {
  try {
    const { aliasName, aliasType = "VARIANT" } = req.body as { aliasName: string; aliasType?: string };
    if (!aliasName?.trim()) return res.status(400).json({ error: "aliasName is required" });

    const [alias] = await db.insert(masterOrganizationAliasesTable).values({
      id: crypto.randomUUID(),
      masterOrganizationId: req.params.id,
      aliasName: aliasName.trim(),
      normalizedAliasName: normalizeOrgName(aliasName.trim()),
      aliasType: aliasType as any,
    }).returning();

    res.status(201).json(alias);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] alias create failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id/aliases/:aliasId", async (req, res) => {
  try {
    const [deleted] = await db.delete(masterOrganizationAliasesTable)
      .where(and(
        eq(masterOrganizationAliasesTable.id, req.params.aliasId),
        eq(masterOrganizationAliasesTable.masterOrganizationId, req.params.id),
      )).returning({ id: masterOrganizationAliasesTable.id });
    if (!deleted) return res.status(404).json({ error: "Alias not found" });
    res.json({ deleted: true, id: deleted.id });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] alias delete failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── HEALTHCARE OVERLAY ───────────────────────────────────────────────────────

router.get("/:id/healthcare-overlay", async (req, res) => {
  try {
    const overlay = await db.query.masterOrgHealthcareOverlayTable.findFirst({
      where: eq(masterOrgHealthcareOverlayTable.masterOrganizationId, req.params.id),
    });
    res.json(overlay ?? null);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] healthcare overlay get failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id/healthcare-overlay", async (req, res) => {
  try {
    const { facilityType, licensedBeds, traumaLevel, systemType, ownershipModel, careSetting } = req.body as Record<string, any>;
    const existing = await db.query.masterOrgHealthcareOverlayTable.findFirst({
      where: eq(masterOrgHealthcareOverlayTable.masterOrganizationId, req.params.id),
    });

    if (existing) {
      const [updated] = await db.update(masterOrgHealthcareOverlayTable).set({
        facilityType: facilityType ?? null,
        licensedBeds: licensedBeds ?? null,
        traumaLevel: traumaLevel ?? null,
        systemType: systemType ?? null,
        ownershipModel: ownershipModel ?? null,
        careSetting: careSetting ?? null,
        updatedAt: new Date(),
      }).where(eq(masterOrgHealthcareOverlayTable.masterOrganizationId, req.params.id)).returning();
      return res.json(updated);
    } else {
      const [created] = await db.insert(masterOrgHealthcareOverlayTable).values({
        id: crypto.randomUUID(),
        masterOrganizationId: req.params.id,
        facilityType: facilityType ?? null,
        licensedBeds: licensedBeds ?? null,
        traumaLevel: traumaLevel ?? null,
        systemType: systemType ?? null,
        ownershipModel: ownershipModel ?? null,
        careSetting: careSetting ?? null,
      }).returning();
      return res.status(201).json(created);
    }
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] healthcare overlay put failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GOVCON OVERLAY ───────────────────────────────────────────────────────────

router.get("/:id/govcon-overlay", async (req, res) => {
  try {
    const overlay = await db.query.masterOrgGovconOverlayTable.findFirst({
      where: eq(masterOrgGovconOverlayTable.masterOrganizationId, req.params.id),
    });
    res.json(overlay ?? null);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] govcon overlay get failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id/govcon-overlay", async (req, res) => {
  try {
    const { uei, cageCode, naicsCodes, primeOrSub, contractVehicles, agencyAlignment } = req.body as Record<string, any>;
    const existing = await db.query.masterOrgGovconOverlayTable.findFirst({
      where: eq(masterOrgGovconOverlayTable.masterOrganizationId, req.params.id),
    });

    if (existing) {
      const [updated] = await db.update(masterOrgGovconOverlayTable).set({
        uei: uei ?? null,
        cageCode: cageCode ?? null,
        naicsCodes: naicsCodes ?? [],
        primeOrSub: primeOrSub ?? null,
        contractVehicles: contractVehicles ?? [],
        agencyAlignment: agencyAlignment ?? null,
        updatedAt: new Date(),
      }).where(eq(masterOrgGovconOverlayTable.masterOrganizationId, req.params.id)).returning();
      return res.json(updated);
    } else {
      const [created] = await db.insert(masterOrgGovconOverlayTable).values({
        id: crypto.randomUUID(),
        masterOrganizationId: req.params.id,
        uei: uei ?? null,
        cageCode: cageCode ?? null,
        naicsCodes: naicsCodes ?? [],
        primeOrSub: primeOrSub ?? null,
        contractVehicles: contractVehicles ?? [],
        agencyAlignment: agencyAlignment ?? null,
      }).returning();
      return res.status(201).json(created);
    }
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] govcon overlay put failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── SIBLINGS ─────────────────────────────────────────────────────────────────
// Returns other orgs that share the same parent as this one

router.get("/:id/siblings", async (req, res) => {
  try {
    const id = req.params.id;

    // Find all parents of this org
    const parents = await db.select({
      parentId: masterOrganizationRelationshipsTable.parentMasterOrganizationId,
    }).from(masterOrganizationRelationshipsTable)
      .where(eq(masterOrganizationRelationshipsTable.childMasterOrganizationId, id));

    if (parents.length === 0) {
      return res.json({ siblings: [], parentIds: [], total: 0 });
    }

    const parentIds = parents.map(p => p.parentId);

    // Find all children of those parents, excluding self
    const siblingRows = await db.execute<{
      sibling_id: string;
      sibling_name: string;
      relationship_type: string;
      parent_id: string;
      parent_name: string;
    }>(sql`
      SELECT DISTINCT
        c.id AS sibling_id,
        c.canonical_name AS sibling_name,
        r.relationship_type,
        p.id AS parent_id,
        p.canonical_name AS parent_name
      FROM master_organization_relationships r
      JOIN master_organizations c ON c.id = r.child_master_organization_id
      JOIN master_organizations p ON p.id = r.parent_master_organization_id
      WHERE r.parent_master_organization_id = ANY(${sql.raw(`ARRAY[${parentIds.map(pid => `'${pid}'`).join(",")}]::text[]`)})
        AND r.child_master_organization_id != ${id}
      ORDER BY c.canonical_name
      LIMIT 100
    `);

    res.json({
      siblings: siblingRows.rows.map(r => ({
        id: r.sibling_id,
        canonicalName: r.sibling_name,
        relationshipType: r.relationship_type,
        parentId: r.parent_id,
        parentName: r.parent_name,
      })),
      parentIds,
      total: siblingRows.rows.length,
    });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] siblings failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── ULTIMATE PARENT RESOLVER ─────────────────────────────────────────────────

router.get("/:id/ultimate-parent", async (req, res) => {
  try {
    const id = req.params.id;

    // Walk up the chain recursively (max 10 levels)
    const chain: { id: string; canonicalName: string; depth: number }[] = [];
    let currentId = id;
    const visited = new Set<string>();

    for (let depth = 0; depth < 10; depth++) {
      if (visited.has(currentId)) break; // Cycle guard
      visited.add(currentId);

      const parentRow = await db.select({
        parentId: masterOrganizationRelationshipsTable.parentMasterOrganizationId,
        parentName: masterOrganizationsTable.canonicalName,
      }).from(masterOrganizationRelationshipsTable)
        .innerJoin(masterOrganizationsTable, eq(masterOrganizationsTable.id, masterOrganizationRelationshipsTable.parentMasterOrganizationId))
        .where(eq(masterOrganizationRelationshipsTable.childMasterOrganizationId, currentId))
        .limit(1);

      if (parentRow.length === 0) break; // Reached the top

      chain.push({ id: parentRow[0].parentId, canonicalName: parentRow[0].parentName, depth: depth + 1 });
      currentId = parentRow[0].parentId;
    }

    const ultimateParent = chain.length > 0 ? chain[chain.length - 1] : null;

    res.json({ ultimateParent, chain, depth: chain.length });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] ultimate-parent failed");
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

// ─── DELETE /admin/master-organizations/:id/relationships/:relId ──────────────
router.delete("/:id/relationships/:relId", async (req, res) => {
  try {
    const [deleted] = await db.delete(masterOrganizationRelationshipsTable)
      .where(and(
        eq(masterOrganizationRelationshipsTable.id, req.params.relId),
        or(
          eq(masterOrganizationRelationshipsTable.parentMasterOrganizationId, req.params.id),
          eq(masterOrganizationRelationshipsTable.childMasterOrganizationId, req.params.id),
        )
      )).returning({ id: masterOrganizationRelationshipsTable.id });
    if (!deleted) return res.status(404).json({ error: "Relationship not found" });
    res.json({ deleted: true, id: deleted.id });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] relationship delete failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/master-organizations/:id/scan-history ────────────────────────
router.get("/:id/scan-history", async (req, res) => {
  try {
    const { id } = req.params;

    const org = await db.query.masterOrganizationsTable.findFirst({
      where: eq(masterOrganizationsTable.id, id),
    });
    if (!org) return res.status(404).json({ error: "Not found" });

    const scans = await db.select({
      id: organizationStructureScansTable.id,
      scanStatus: organizationStructureScansTable.scanStatus,
      reviewStatus: organizationStructureScansTable.reviewStatus,
      suggestedParentMasterOrganizationId: organizationStructureScansTable.suggestedParentMasterOrganizationId,
      suggestedParentName: organizationStructureScansTable.suggestedParentName,
      suggestedStructureType: organizationStructureScansTable.suggestedStructureType,
      confidenceScore: organizationStructureScansTable.confidenceScore,
      evidenceSummary: organizationStructureScansTable.evidenceSummary,
      addToMasterGraph: organizationStructureScansTable.addToMasterGraph,
      createdAt: organizationStructureScansTable.createdAt,
      updatedAt: organizationStructureScansTable.updatedAt,
      organizationName: organizationsTable.name,
      organizationId: organizationsTable.id,
      workspaceName: workspacesTable.name,
      workspaceId: workspacesTable.id,
      initiatedByEmail: usersTable.email,
    })
      .from(organizationStructureScansTable)
      .innerJoin(organizationsTable, eq(organizationStructureScansTable.organizationId, organizationsTable.id))
      .innerJoin(workspacesTable, eq(organizationStructureScansTable.workspaceId, workspacesTable.id))
      .leftJoin(usersTable, eq(organizationStructureScansTable.initiatedByUserId, usersTable.id))
      .where(
        and(
          eq(organizationStructureScansTable.reviewStatus, "APPROVED"),
          eq(organizationStructureScansTable.addToMasterGraph, true),
          or(
            eq(organizationStructureScansTable.suggestedParentMasterOrganizationId, id),
            eq(organizationsTable.masterOrganizationId, id),
          ),
        )
      )
      .orderBy(desc(organizationStructureScansTable.updatedAt));

    res.json({ scans, total: scans.length });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] scan-history get failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/master-organizations/:id/quality-score ───────────────────────
router.get("/:id/quality-score", async (req, res) => {
  try {
    const id = req.params.id;
    const [org] = await db.select().from(masterOrganizationsTable).where(eq(masterOrganizationsTable.id, id));
    if (!org) return res.status(404).json({ error: "Not found" });

    const relCount = await db.execute<{ count: string }>(sql`
      SELECT count(*) AS count FROM master_organization_relationships
      WHERE parent_master_organization_id = ${id} OR child_master_organization_id = ${id}
    `);
    const hasRelationship = parseInt(relCount.rows[0].count) > 0;
    const adminFlags = (org.adminFlags as string[]) ?? [];
    const daysSinceUpdate = Math.floor((Date.now() - new Date(org.updatedAt).getTime()) / 86400000);

    const signals: { label: string; weight: number; earned: boolean }[] = [
      { label: "Has canonical name", weight: 15, earned: !!org.canonicalName },
      { label: "Has normalized domain", weight: 15, earned: !!org.websiteDomain },
      { label: "Has at least one Place ID", weight: 10, earned: ((org.placeIds as string[]) ?? []).length > 0 },
      { label: "Has relationships or confirmed standalone", weight: 20, earned: hasRelationship || org.isStandalone },
      { label: "Source confidence ≥ 0.7", weight: 10, earned: (org.sourceConfidence ?? 0) >= 0.7 },
      { label: "Confidence score ≥ 0.7", weight: 10, earned: (org.confidenceScore ?? 0) >= 0.7 },
      { label: "Updated within 90 days", weight: 10, earned: daysSinceUpdate <= 90 },
      { label: "Has aliases", weight: 5, earned: ((org.aliases as string[]) ?? []).length > 0 },
      { label: "Has location (city/state)", weight: 5, earned: !!(org.city || org.state) },
    ];

    const score = signals.reduce((acc, s) => acc + (s.earned ? s.weight : 0), 0);

    return res.json({ score, maxScore: 100, signals });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] quality-score failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/master-organizations/:id/completeness ────────────────────────
router.get("/:id/completeness", async (req, res) => {
  try {
    const id = req.params.id;
    const [org] = await db.select().from(masterOrganizationsTable).where(eq(masterOrganizationsTable.id, id));
    if (!org) return res.status(404).json({ error: "Not found" });

    const [hcResult, gcResult, parentResult, ultimateParentResult, aliasResult] = await Promise.all([
      db.select().from(masterOrgHealthcareOverlayTable).where(eq(masterOrgHealthcareOverlayTable.masterOrganizationId, id)),
      db.select().from(masterOrgGovconOverlayTable).where(eq(masterOrgGovconOverlayTable.masterOrganizationId, id)),
      db.execute<{ count: string }>(sql`SELECT count(*) AS count FROM master_organization_relationships WHERE child_master_organization_id = ${id}`),
      db.execute<{ count: string }>(sql`
        SELECT count(*) AS count FROM master_organization_relationships r1
        JOIN master_organization_relationships r2 ON r2.child_master_organization_id = r1.parent_master_organization_id
        WHERE r1.child_master_organization_id = ${id}
      `),
      db.execute<{ count: string }>(sql`SELECT count(*) AS count FROM master_organization_aliases WHERE master_organization_id = ${id}`),
    ]);

    const hc = hcResult[0] ?? null;
    const gc = gcResult[0] ?? null;

    const orgData = {
      canonicalName: org.canonicalName,
      normalizedName: org.normalizedName,
      websiteDomain: org.websiteDomain,
      industry: org.industry,
      subVertical: org.subVertical,
      accountStructureType: org.accountStructureType,
      validationStatus: org.validationStatus,
      confidenceScore: org.confidenceScore,
      isStandalone: org.isStandalone,
      aliases: (org.aliases as string[]) ?? [],
      adminFlags: (org.adminFlags as string[]) ?? [],
      city: org.city,
      state: org.state,
      structureLastScannedAt: org.structureLastScannedAt,
      hasParent: parseInt(parentResult.rows[0].count) > 0,
      hasUltimateParent: parseInt(ultimateParentResult.rows[0].count) > 0,
      hasHealthcareOverlay: !!hc,
      hasFacilityType: !!(hc?.facilityType),
      hasGovconOverlay: !!gc,
      hasUei: !!(gc?.uei),
      aliasCount: parseInt(aliasResult.rows[0].count),
    };

    const completeness = computeCompleteness(orgData);
    const nextAction = computeNextBestAction(orgData, completeness);

    // ── Projected completeness: apply PENDING suggestions to orgData copy ────
    const pendingRows = await db.execute<{ field: string; suggested_value: string }>(sql`
      SELECT field, suggested_value FROM master_org_ai_suggestions
      WHERE master_organization_id = ${id} AND status = 'PENDING'
    `);
    let projectedPercentage = completeness.percentage;
    if (pendingRows.rows.length > 0) {
      const p = { ...orgData };
      for (const s of pendingRows.rows) {
        switch (s.field) {
          case "industry": p.industry = s.suggested_value; break;
          case "accountStructureType": p.accountStructureType = s.suggested_value; break;
          case "websiteDomain": p.websiteDomain = s.suggested_value; break;
          case "isStandalone": p.isStandalone = s.suggested_value === "true"; break;
          case "confidenceScore": { const n = parseFloat(s.suggested_value); if (!isNaN(n)) p.confidenceScore = n; break; }
          case "city": p.city = s.suggested_value; break;
          case "state": p.state = s.suggested_value; break;
          case "aliases": p.aliasCount = Math.max(p.aliasCount, 1); break;
          case "healthcare.facilityType": p.hasFacilityType = true; p.hasHealthcareOverlay = true; break;
          case "govcon.uei": p.hasUei = true; p.hasGovconOverlay = true; break;
        }
      }
      projectedPercentage = computeCompleteness(p).percentage;
    }

    res.json({ ...completeness, nextAction, projectedPercentage });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] completeness failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/master-organizations/:id/next-action ─────────────────────────
router.get("/:id/next-action", async (req, res) => {
  try {
    const id = req.params.id;
    const [org] = await db.select().from(masterOrganizationsTable).where(eq(masterOrganizationsTable.id, id));
    if (!org) return res.status(404).json({ error: "Not found" });

    const [hcResult, gcResult, parentResult, ultimateParentResult, aliasResult] = await Promise.all([
      db.select().from(masterOrgHealthcareOverlayTable).where(eq(masterOrgHealthcareOverlayTable.masterOrganizationId, id)),
      db.select().from(masterOrgGovconOverlayTable).where(eq(masterOrgGovconOverlayTable.masterOrganizationId, id)),
      db.execute<{ count: string }>(sql`SELECT count(*) AS count FROM master_organization_relationships WHERE child_master_organization_id = ${id}`),
      db.execute<{ count: string }>(sql`
        SELECT count(*) AS count FROM master_organization_relationships r1
        JOIN master_organization_relationships r2 ON r2.child_master_organization_id = r1.parent_master_organization_id
        WHERE r1.child_master_organization_id = ${id}
      `),
      db.execute<{ count: string }>(sql`SELECT count(*) AS count FROM master_organization_aliases WHERE master_organization_id = ${id}`),
    ]);

    const hc = hcResult[0] ?? null;
    const gc = gcResult[0] ?? null;

    const orgData = {
      canonicalName: org.canonicalName,
      normalizedName: org.normalizedName,
      websiteDomain: org.websiteDomain,
      industry: org.industry,
      subVertical: org.subVertical,
      accountStructureType: org.accountStructureType,
      validationStatus: org.validationStatus,
      confidenceScore: org.confidenceScore,
      isStandalone: org.isStandalone,
      aliases: (org.aliases as string[]) ?? [],
      adminFlags: (org.adminFlags as string[]) ?? [],
      city: org.city,
      state: org.state,
      structureLastScannedAt: org.structureLastScannedAt,
      hasParent: parseInt(parentResult.rows[0].count) > 0,
      hasUltimateParent: parseInt(ultimateParentResult.rows[0].count) > 0,
      hasHealthcareOverlay: !!hc,
      hasFacilityType: !!(hc?.facilityType),
      hasGovconOverlay: !!gc,
      hasUei: !!(gc?.uei),
      aliasCount: parseInt(aliasResult.rows[0].count),
    };

    const completeness = computeCompleteness(orgData);
    const nextAction = computeNextBestAction(orgData, completeness);

    res.json(nextAction);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] next-action failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /admin/master-organizations/:id/admin-flags ───────────────────────
router.patch("/:id/admin-flags", async (req, res) => {
  try {
    const id = req.params.id;
    const { flags } = req.body as { flags: string[] };

    const allowedFlags = [
      "duplicate_suspect", "structure_not_run", "structure_unresolved",
      "missing_parent", "missing_ultimate_parent", "low_confidence",
      "needs_revalidation", "domain_conflict", "standalone",
    ];

    if (!Array.isArray(flags)) {
      return res.status(400).json({ error: "flags must be an array" });
    }

    const sanitized = flags.filter(f => allowedFlags.includes(f));

    const [updated] = await db.update(masterOrganizationsTable)
      .set({ adminFlags: sanitized, updatedAt: new Date() })
      .where(eq(masterOrganizationsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-MASTER-ORGS] admin-flags update failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { masterOrganizationsTable, masterOrganizationRelationshipsTable, organizationsTable, workspacesTable } from "@workspace/db";
import { sql, lt, isNull, eq, desc } from "drizzle-orm";
import { computeCompleteness } from "../lib/completeness";

const router = Router();

// ─── GET /admin/diagnostics/summary ──────────────────────────────────────────
router.get("/summary", async (req, res) => {
  try {
    const [
      totalResult,
      duplicateSuspectsResult,
      noParentResult,
      lowConfidenceResult,
      staleResult,
      missingDomainResult,
      missingIndustryResult,
      unvalidatedResult,
      pendingSuggestionsResult,
      workspaceCoverageResult,
    ] = await Promise.all([
      db.execute<{ count: string }>(sql`SELECT count(*) AS count FROM master_organizations`),

      db.execute<{ count: string }>(sql`
        SELECT count(*) AS count FROM (
          SELECT normalized_name FROM master_organizations GROUP BY normalized_name HAVING count(*) > 1
          UNION
          SELECT website_domain AS normalized_name FROM master_organizations
          WHERE website_domain IS NOT NULL GROUP BY website_domain HAVING count(*) > 1
        ) dupes
      `),

      db.execute<{ count: string }>(sql`
        SELECT count(*) AS count FROM master_organizations mo
        WHERE NOT EXISTS (
          SELECT 1 FROM master_organization_relationships r
          WHERE r.child_master_organization_id = mo.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM master_organization_relationships r
          WHERE r.parent_master_organization_id = mo.id
        )
        AND NOT mo.is_standalone
      `),

      db.execute<{ count: string }>(sql`
        SELECT count(*) AS count FROM master_organizations
        WHERE source_confidence < 0.5
      `),

      db.execute<{ count: string }>(sql`
        SELECT count(*) AS count FROM master_organizations
        WHERE updated_at < now() - interval '90 days'
      `),

      db.execute<{ count: string }>(sql`SELECT count(*) AS count FROM master_organizations WHERE website_domain IS NULL`),
      db.execute<{ count: string }>(sql`SELECT count(*) AS count FROM master_organizations WHERE industry IS NULL`),
      db.execute<{ count: string }>(sql`SELECT count(*) AS count FROM master_organizations WHERE validation_status = 'UNVALIDATED'`),
      db.execute<{ count: string }>(sql`SELECT count(*) AS count FROM master_org_ai_suggestions WHERE status = 'PENDING'`),
      db.execute<{ count: string }>(sql`
        SELECT count(*) AS count FROM organizations
        WHERE master_organization_id IS NULL
      `),
    ]);

    return res.json({
      totalMasterOrgs: parseInt(totalResult.rows[0].count),
      duplicateSuspects: parseInt(duplicateSuspectsResult.rows[0].count),
      isolatedRecords: parseInt(noParentResult.rows[0].count),
      lowConfidence: parseInt(lowConfidenceResult.rows[0].count),
      staleRecords: parseInt(staleResult.rows[0].count),
      missingDomain: parseInt(missingDomainResult.rows[0].count),
      missingIndustry: parseInt(missingIndustryResult.rows[0].count),
      unvalidated: parseInt(unvalidatedResult.rows[0].count),
      pendingAiSuggestions: parseInt(pendingSuggestionsResult.rows[0].count),
      unlinkedWorkspaceOrgs: parseInt(workspaceCoverageResult.rows[0].count),
    });
  } catch (err) {
    req.log.error({ err }, "[DIAGNOSTICS] summary failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/diagnostics/duplicates ───────────────────────────────────────
router.get("/duplicates", async (req, res) => {
  try {
    const [nameGroups, domainGroups] = await Promise.all([
      db.execute<{ normalized_name: string; ids: string; names: string; count: string }>(sql`
        SELECT
          normalized_name,
          string_agg(id, ',' ORDER BY created_at) AS ids,
          string_agg(canonical_name, ' | ' ORDER BY created_at) AS names,
          count(*) AS count
        FROM master_organizations
        GROUP BY normalized_name
        HAVING count(*) > 1
        ORDER BY count DESC
        LIMIT 50
      `),

      db.execute<{ domain: string; ids: string; names: string; count: string }>(sql`
        SELECT
          website_domain AS domain,
          string_agg(id, ',' ORDER BY created_at) AS ids,
          string_agg(canonical_name, ' | ' ORDER BY created_at) AS names,
          count(*) AS count
        FROM master_organizations
        WHERE website_domain IS NOT NULL
        GROUP BY website_domain
        HAVING count(*) > 1
        ORDER BY count DESC
        LIMIT 50
      `),
    ]);

    const nameDupes = nameGroups.rows.map(r => ({
      type: "normalized_name" as const,
      key: r.normalized_name,
      ids: r.ids.split(","),
      names: r.names.split(" | "),
      count: parseInt(r.count),
    }));

    const domainDupes = domainGroups.rows.map(r => ({
      type: "domain" as const,
      key: r.domain,
      ids: r.ids.split(","),
      names: r.names.split(" | "),
      count: parseInt(r.count),
    }));

    const all = [...nameDupes, ...domainDupes].sort((a, b) => b.count - a.count);

    return res.json({ duplicateGroups: all, total: all.length });
  } catch (err) {
    req.log.error({ err }, "[DIAGNOSTICS] duplicates failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/diagnostics/structure-coverage ───────────────────────────────
router.get("/structure-coverage", async (req, res) => {
  try {
    const [isolated, flagged] = await Promise.all([
      db.execute<{ id: string; canonical_name: string; source_type: string; source_confidence: string; created_at: string }>(sql`
        SELECT mo.id, mo.canonical_name, mo.source_type, mo.source_confidence, mo.created_at
        FROM master_organizations mo
        WHERE NOT EXISTS (
          SELECT 1 FROM master_organization_relationships r
          WHERE r.child_master_organization_id = mo.id OR r.parent_master_organization_id = mo.id
        )
        ORDER BY mo.created_at DESC
        LIMIT 100
      `),

      db.execute<{ id: string; canonical_name: string; admin_flags: unknown; source_type: string; updated_at: string }>(sql`
        SELECT id, canonical_name, admin_flags, source_type, updated_at
        FROM master_organizations
        WHERE admin_flags @> '["structure_not_run"]'::jsonb
           OR admin_flags @> '["structure_unresolved"]'::jsonb
        ORDER BY updated_at DESC
        LIMIT 100
      `),
    ]);

    return res.json({
      isolatedOrgs: isolated.rows,
      flaggedOrgs: flagged.rows,
      totalIsolated: isolated.rows.length,
      totalFlagged: flagged.rows.length,
    });
  } catch (err) {
    req.log.error({ err }, "[DIAGNOSTICS] structure-coverage failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/diagnostics/relationship-integrity ───────────────────────────
router.get("/relationship-integrity", async (req, res) => {
  try {
    const [orphaned, circular, typeMismatches] = await Promise.all([
      db.execute<{ id: string; parent_id: string; child_id: string; relationship_type: string }>(sql`
        SELECT r.id, r.parent_master_organization_id AS parent_id,
               r.child_master_organization_id AS child_id,
               r.relationship_type
        FROM master_organization_relationships r
        WHERE NOT EXISTS (
          SELECT 1 FROM master_organizations mo WHERE mo.id = r.parent_master_organization_id
        )
        OR NOT EXISTS (
          SELECT 1 FROM master_organizations mo WHERE mo.id = r.child_master_organization_id
        )
        LIMIT 50
      `),

      db.execute<{ child_id: string; parent_id: string; grandparent_id: string; child_name: string; parent_name: string }>(sql`
        SELECT r1.child_master_organization_id AS child_id,
               r1.parent_master_organization_id AS parent_id,
               r2.parent_master_organization_id AS grandparent_id,
               c.canonical_name AS child_name,
               p.canonical_name AS parent_name
        FROM master_organization_relationships r1
        JOIN master_organization_relationships r2
          ON r2.child_master_organization_id = r1.parent_master_organization_id
          AND r2.parent_master_organization_id = r1.child_master_organization_id
        JOIN master_organizations c ON c.id = r1.child_master_organization_id
        JOIN master_organizations p ON p.id = r1.parent_master_organization_id
        LIMIT 20
      `),

      db.execute<{ id: string; parent_id: string; child_id: string; relationship_type: string; confidence_score: string; parent_name: string; child_name: string }>(sql`
        SELECT r.id,
               r.parent_master_organization_id AS parent_id,
               r.child_master_organization_id AS child_id,
               r.relationship_type,
               r.confidence_score::text,
               p.canonical_name AS parent_name,
               c.canonical_name AS child_name
        FROM master_organization_relationships r
        JOIN master_organizations p ON p.id = r.parent_master_organization_id
        JOIN master_organizations c ON c.id = r.child_master_organization_id
        WHERE r.confidence_score < 0.5
        ORDER BY r.confidence_score ASC
        LIMIT 50
      `),
    ]);

    return res.json({
      orphanedRelationships: orphaned.rows,
      circularRelationships: circular.rows,
      lowConfidenceRelationships: typeMismatches.rows,
      hasIssues: orphaned.rows.length > 0 || circular.rows.length > 0,
    });
  } catch (err) {
    req.log.error({ err }, "[DIAGNOSTICS] relationship-integrity failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/diagnostics/confidence-review ────────────────────────────────
router.get("/confidence-review", async (req, res) => {
  try {
    const results = await db.execute<{
      id: string;
      canonical_name: string;
      source_type: string;
      source_confidence: string;
      admin_flags: unknown;
      updated_at: string;
      created_at: string;
    }>(sql`
      SELECT id, canonical_name, source_type, source_confidence::text, admin_flags, updated_at, created_at
      FROM master_organizations
      WHERE source_confidence < 0.5
         OR (source_type IN ('WORKSPACE_LOGO_SCAN', 'WORKSPACE_APPROVED') AND source_confidence < 0.7)
         OR (source_type = 'MANUAL' AND source_confidence < 0.7)
      ORDER BY source_confidence ASC, updated_at ASC
      LIMIT 100
    `);

    const items = results.rows.map(r => ({
      id: r.id,
      canonicalName: r.canonical_name,
      sourceType: r.source_type,
      sourceConfidence: parseFloat(r.source_confidence),
      adminFlags: (r.admin_flags as string[]) ?? [],
      updatedAt: r.updated_at,
      createdAt: r.created_at,
      daysSinceUpdate: Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 86400000),
    }));

    return res.json({ items, total: items.length });
  } catch (err) {
    req.log.error({ err }, "[DIAGNOSTICS] confidence-review failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/diagnostics/domain ───────────────────────────────────────────
router.get("/domain", async (req, res) => {
  try {
    const [missing, duplicates, malformed] = await Promise.all([
      db.execute<{ id: string; canonical_name: string; source_type: string; created_at: string }>(sql`
        SELECT id, canonical_name, source_type, created_at
        FROM master_organizations
        WHERE website_domain IS NULL
        ORDER BY created_at DESC
        LIMIT 100
      `),

      db.execute<{ domain: string; ids: string; names: string; count: string }>(sql`
        SELECT
          website_domain AS domain,
          string_agg(id, ',' ORDER BY created_at) AS ids,
          string_agg(canonical_name, ' | ' ORDER BY created_at) AS names,
          count(*) AS count
        FROM master_organizations
        WHERE website_domain IS NOT NULL
        GROUP BY website_domain
        HAVING count(*) > 1
        ORDER BY count DESC
        LIMIT 50
      `),

      db.execute<{ id: string; canonical_name: string; website_domain: string }>(sql`
        SELECT id, canonical_name, website_domain
        FROM master_organizations
        WHERE website_domain IS NOT NULL
          AND (
            website_domain NOT LIKE '%.%'
            OR website_domain LIKE '% %'
            OR website_domain LIKE 'http%'
            OR length(website_domain) < 4
          )
        LIMIT 50
      `),
    ]);

    return res.json({
      missingDomain: missing.rows,
      duplicateDomains: duplicates.rows.map(r => ({
        domain: r.domain,
        ids: r.ids.split(","),
        names: r.names.split(" | "),
        count: parseInt(r.count),
      })),
      malformedDomains: malformed.rows,
      totalMissing: missing.rows.length,
      totalDuplicate: duplicates.rows.length,
      totalMalformed: malformed.rows.length,
    });
  } catch (err) {
    req.log.error({ err }, "[DIAGNOSTICS] domain failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/diagnostics/workspace-coverage ───────────────────────────────
// Master org link coverage by workspace (Feature F)
router.get("/workspace-coverage", async (req, res) => {
  try {
    const coverageRows = await db.execute<{
      workspace_id: string;
      workspace_name: string;
      total_orgs: string;
      linked_orgs: string;
      unlinked_orgs: string;
    }>(sql`
      SELECT
        w.id AS workspace_id,
        w.name AS workspace_name,
        count(o.id) AS total_orgs,
        count(o.id) FILTER (WHERE o.master_organization_id IS NOT NULL) AS linked_orgs,
        count(o.id) FILTER (WHERE o.master_organization_id IS NULL) AS unlinked_orgs
      FROM workspaces w
      LEFT JOIN organizations o ON o.workspace_id = w.id
      GROUP BY w.id, w.name
      HAVING count(o.id) > 0
      ORDER BY count(o.id) DESC
    `);

    const rows = coverageRows.rows.map(r => ({
      workspaceId: r.workspace_id,
      workspaceName: r.workspace_name,
      totalOrgs: parseInt(r.total_orgs),
      linkedOrgs: parseInt(r.linked_orgs),
      unlinkedOrgs: parseInt(r.unlinked_orgs),
      coveragePct: parseInt(r.total_orgs) > 0
        ? Math.round((parseInt(r.linked_orgs) / parseInt(r.total_orgs)) * 100)
        : 0,
    }));

    const totals = rows.reduce(
      (acc, r) => ({
        totalOrgs: acc.totalOrgs + r.totalOrgs,
        linkedOrgs: acc.linkedOrgs + r.linkedOrgs,
        unlinkedOrgs: acc.unlinkedOrgs + r.unlinkedOrgs,
      }),
      { totalOrgs: 0, linkedOrgs: 0, unlinkedOrgs: 0 }
    );

    return res.json({
      workspaces: rows,
      totals: {
        ...totals,
        coveragePct: totals.totalOrgs > 0
          ? Math.round((totals.linkedOrgs / totals.totalOrgs) * 100)
          : 0,
      },
    });
  } catch (err) {
    req.log.error({ err }, "[DIAGNOSTICS] workspace-coverage failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/diagnostics/unlinked-orgs ────────────────────────────────────
// Queue of workspace orgs not yet linked to a master org
router.get("/unlinked-orgs", async (req, res) => {
  try {
    const { workspaceId, page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const rows = await db.execute<{
      org_id: string;
      org_name: string;
      website: string | null;
      industry: string | null;
      vertical: string | null;
      workspace_id: string;
      workspace_name: string;
      created_at: string;
    }>(sql`
      SELECT
        o.id AS org_id,
        o.name AS org_name,
        o.website,
        o.industry,
        o.vertical,
        o.workspace_id,
        w.name AS workspace_name,
        o.created_at
      FROM organizations o
      JOIN workspaces w ON w.id = o.workspace_id
      WHERE o.master_organization_id IS NULL
      ${workspaceId ? sql`AND o.workspace_id = ${workspaceId}` : sql``}
      ORDER BY o.created_at DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `);

    const countRow = await db.execute<{ count: string }>(sql`
      SELECT count(*) AS count FROM organizations
      WHERE master_organization_id IS NULL
      ${workspaceId ? sql`AND workspace_id = ${workspaceId}` : sql``}
    `);

    return res.json({
      orgs: rows.rows.map(r => ({
        id: r.org_id,
        name: r.org_name,
        website: r.website,
        industry: r.industry,
        vertical: r.vertical,
        workspaceId: r.workspace_id,
        workspaceName: r.workspace_name,
        createdAt: r.created_at,
      })),
      total: parseInt(countRow.rows[0].count),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    req.log.error({ err }, "[DIAGNOSTICS] unlinked-orgs failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /admin/diagnostics/workspace-coverage ───────────────────────────────
// Per-workspace breakdown of org linkage to master orgs
router.get("/workspace-coverage", async (req, res) => {
  try {
    const rows = await db.execute<{
      workspace_id: string;
      workspace_name: string;
      total_orgs: string;
      linked_orgs: string;
      unlinked_orgs: string;
    }>(sql`
      SELECT
        w.id AS workspace_id,
        w.name AS workspace_name,
        count(o.id) AS total_orgs,
        count(o.id) FILTER (WHERE o.master_organization_id IS NOT NULL) AS linked_orgs,
        count(o.id) FILTER (WHERE o.master_organization_id IS NULL) AS unlinked_orgs
      FROM workspaces w
      LEFT JOIN organizations o ON o.workspace_id = w.id
      GROUP BY w.id, w.name
      ORDER BY count(o.id) FILTER (WHERE o.master_organization_id IS NULL) DESC
    `);

    const workspaces = rows.rows.map(r => {
      const total = parseInt(r.total_orgs);
      const linked = parseInt(r.linked_orgs);
      const unlinked = parseInt(r.unlinked_orgs);
      const coverage = total > 0 ? Math.round((linked / total) * 100) : 100;
      return {
        workspaceId: r.workspace_id,
        workspaceName: r.workspace_name,
        totalOrgs: total,
        linkedOrgs: linked,
        unlinkedOrgs: unlinked,
        coveragePercent: coverage,
        healthStatus: coverage >= 80 ? "GOOD" : coverage >= 50 ? "PARTIAL" : "LOW",
      };
    });

    const totals = workspaces.reduce((acc, w) => ({
      totalOrgs: acc.totalOrgs + w.totalOrgs,
      linkedOrgs: acc.linkedOrgs + w.linkedOrgs,
      unlinkedOrgs: acc.unlinkedOrgs + w.unlinkedOrgs,
    }), { totalOrgs: 0, linkedOrgs: 0, unlinkedOrgs: 0 });

    const overallCoverage = totals.totalOrgs > 0
      ? Math.round((totals.linkedOrgs / totals.totalOrgs) * 100)
      : 100;

    res.json({ workspaces, totals: { ...totals, coveragePercent: overallCoverage } });
  } catch (err) {
    req.log.error({ err }, "[DIAGNOSTICS] workspace-coverage failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

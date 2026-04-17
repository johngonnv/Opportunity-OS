import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  commissionRulesTable,
  commissionPeriodsTable,
  facilityNetRevenueLedgerTable,
  commissionRecordsTable,
  commissionAdjustmentsTable,
  organizationsTable,
  workspaceMembersTable,
  usersTable,
} from "@workspace/db";
import { and, eq, desc, asc, inArray, isNull, sql, lte, gte, or } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { logAdminAction } from "../lib/logAdminAction";

const router = Router();

type LineOfService = "EMS_INTERFACILITY" | "EVENT_STAFFING" | "EMT_PROGRAM" | "GOVERNMENT";
const ALL_LINES: LineOfService[] = ["EMS_INTERFACILITY", "EVENT_STAFFING", "EMT_PROGRAM", "GOVERNMENT"];
type Role = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";

async function getRole(workspaceId: string, userId: string): Promise<Role | null> {
  const m = await db.query.workspaceMembersTable.findFirst({
    where: and(
      eq(workspaceMembersTable.workspaceId, workspaceId),
      eq(workspaceMembersTable.userId, userId),
    ),
  });
  return (m?.role as Role) ?? null;
}

function canMutate(role: Role | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

function canReadAll(role: Role | null): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
}

function isValidPeriodKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
}

function isValidLine(s: unknown): s is LineOfService {
  return typeof s === "string" && (ALL_LINES as string[]).includes(s);
}

async function ensurePeriod(workspaceId: string, line: LineOfService, periodKey: string) {
  const existing = await db.query.commissionPeriodsTable.findFirst({
    where: and(
      eq(commissionPeriodsTable.workspaceId, workspaceId),
      eq(commissionPeriodsTable.lineOfService, line),
      eq(commissionPeriodsTable.periodKey, periodKey),
    ),
  });
  if (existing) return existing;
  const [created] = await db.insert(commissionPeriodsTable).values({
    workspaceId, lineOfService: line, periodKey, isLocked: 0,
  }).returning();
  return created;
}

async function isPeriodLocked(workspaceId: string, line: LineOfService, periodKey: string): Promise<boolean> {
  const p = await db.query.commissionPeriodsTable.findFirst({
    where: and(
      eq(commissionPeriodsTable.workspaceId, workspaceId),
      eq(commissionPeriodsTable.lineOfService, line),
      eq(commissionPeriodsTable.periodKey, periodKey),
    ),
  });
  return !!(p && p.isLocked === 1);
}

// ─── Rules ────────────────────────────────────────────────────────────────────

router.get("/rules", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!role) return res.status(403).json({ error: "Not a workspace member" });
    const { lineOfService, organizationId } = req.query as Record<string, string | undefined>;
    const conds = [eq(commissionRulesTable.workspaceId, workspace.id)];
    if (lineOfService && isValidLine(lineOfService)) conds.push(eq(commissionRulesTable.lineOfService, lineOfService));
    if (organizationId) conds.push(eq(commissionRulesTable.organizationId, organizationId));
    const rules = await db.select().from(commissionRulesTable).where(and(...conds)).orderBy(desc(commissionRulesTable.createdAt));
    res.json({ rules });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/rules", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const { lineOfService, organizationId, rateType, rateValue, revenueBasis, effectiveFrom, effectiveTo, notes } = req.body ?? {};
    if (!isValidLine(lineOfService)) return res.status(400).json({ error: "Invalid lineOfService" });
    if (!["PERCENT_OF_REVENUE", "FLAT", "PER_UNIT"].includes(rateType)) return res.status(400).json({ error: "Invalid rateType" });
    if (typeof rateValue !== "number" || !Number.isFinite(rateValue) || rateValue < 0) return res.status(400).json({ error: "Invalid rateValue" });
    if (organizationId) {
      const org = await db.query.organizationsTable.findFirst({
        where: and(eq(organizationsTable.id, organizationId), eq(organizationsTable.workspaceId, workspace.id)),
      });
      if (!org) return res.status(404).json({ error: "Organization not in workspace" });
    }
    const [rule] = await db.insert(commissionRulesTable).values({
      workspaceId: workspace.id,
      lineOfService,
      organizationId: organizationId || null,
      rateType,
      rateValue,
      revenueBasis: revenueBasis ?? "NET_REVENUE",
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      notes: notes ?? null,
      createdByUserId: user.id,
    }).returning();
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_RULE_CREATE", entityType: "commission_rule", entityId: rule.id,
      previousValue: null, newValue: rule,
    }).catch(() => {});
    res.status(201).json(rule);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/rules/:id", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const existing = await db.query.commissionRulesTable.findFirst({
      where: and(eq(commissionRulesTable.id, req.params.id), eq(commissionRulesTable.workspaceId, workspace.id)),
    });
    if (!existing) return res.status(404).json({ error: "Rule not found" });
    const { rateType, rateValue, revenueBasis, effectiveFrom, effectiveTo, notes, organizationId } = req.body ?? {};
    if (organizationId) {
      const org = await db.query.organizationsTable.findFirst({
        where: and(eq(organizationsTable.id, organizationId), eq(organizationsTable.workspaceId, workspace.id)),
      });
      if (!org) return res.status(404).json({ error: "Organization not in workspace" });
    }
    const [updated] = await db.update(commissionRulesTable).set({
      ...(rateType !== undefined ? { rateType } : {}),
      ...(rateValue !== undefined ? { rateValue } : {}),
      ...(revenueBasis !== undefined ? { revenueBasis } : {}),
      ...(effectiveFrom !== undefined ? { effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date() } : {}),
      ...(effectiveTo !== undefined ? { effectiveTo: effectiveTo ? new Date(effectiveTo) : null } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(organizationId !== undefined ? { organizationId: organizationId || null } : {}),
      updatedAt: new Date(),
    }).where(eq(commissionRulesTable.id, req.params.id)).returning();
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_RULE_UPDATE", entityType: "commission_rule", entityId: updated.id,
      previousValue: existing, newValue: updated,
    }).catch(() => {});
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/rules/:id", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const existing = await db.query.commissionRulesTable.findFirst({
      where: and(eq(commissionRulesTable.id, req.params.id), eq(commissionRulesTable.workspaceId, workspace.id)),
    });
    if (!existing) return res.status(404).json({ error: "Rule not found" });
    await db.delete(commissionRulesTable).where(eq(commissionRulesTable.id, req.params.id));
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_RULE_DELETE", entityType: "commission_rule", entityId: existing.id,
      previousValue: existing, newValue: null,
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Ledger ───────────────────────────────────────────────────────────────────

router.get("/ledger", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!role) return res.status(403).json({ error: "Not a workspace member" });
    const { periodKey, organizationId } = req.query as Record<string, string | undefined>;
    const conds = [eq(facilityNetRevenueLedgerTable.workspaceId, workspace.id)];
    if (periodKey && isValidPeriodKey(periodKey)) conds.push(eq(facilityNetRevenueLedgerTable.periodKey, periodKey));
    if (organizationId) conds.push(eq(facilityNetRevenueLedgerTable.organizationId, organizationId));
    // Reps see only their own facilities
    if (role === "MEMBER") {
      const ownedOrgs = await db.select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(and(eq(organizationsTable.workspaceId, workspace.id), eq(organizationsTable.ownerUserId, user.id)));
      const ids = ownedOrgs.map(o => o.id);
      if (ids.length === 0) return res.json({ entries: [] });
      conds.push(inArray(facilityNetRevenueLedgerTable.organizationId, ids));
    }
    const entries = await db
      .select({
        id: facilityNetRevenueLedgerTable.id,
        organizationId: facilityNetRevenueLedgerTable.organizationId,
        periodKey: facilityNetRevenueLedgerTable.periodKey,
        netRevenue: facilityNetRevenueLedgerTable.netRevenue,
        source: facilityNetRevenueLedgerTable.source,
        notes: facilityNetRevenueLedgerTable.notes,
        enteredByUserId: facilityNetRevenueLedgerTable.enteredByUserId,
        createdAt: facilityNetRevenueLedgerTable.createdAt,
        updatedAt: facilityNetRevenueLedgerTable.updatedAt,
        organizationName: organizationsTable.name,
      })
      .from(facilityNetRevenueLedgerTable)
      .leftJoin(organizationsTable, eq(facilityNetRevenueLedgerTable.organizationId, organizationsTable.id))
      .where(and(...conds))
      .orderBy(desc(facilityNetRevenueLedgerTable.periodKey), asc(organizationsTable.name));
    res.json({ entries });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/ledger", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const { organizationId, periodKey, netRevenue, source, notes } = req.body ?? {};
    if (!organizationId || typeof organizationId !== "string") return res.status(400).json({ error: "organizationId required" });
    if (!isValidPeriodKey(periodKey)) return res.status(400).json({ error: "Invalid periodKey (YYYY-MM)" });
    if (typeof netRevenue !== "number" || !Number.isFinite(netRevenue)) return res.status(400).json({ error: "Invalid netRevenue" });
    const org = await db.query.organizationsTable.findFirst({
      where: and(eq(organizationsTable.id, organizationId), eq(organizationsTable.workspaceId, workspace.id)),
    });
    if (!org) return res.status(404).json({ error: "Organization not found in this workspace" });
    if (await isPeriodLocked(workspace.id, "EMS_INTERFACILITY", periodKey)) {
      return res.status(409).json({ error: "EMS Interfacility period is locked" });
    }
    const existing = await db.query.facilityNetRevenueLedgerTable.findFirst({
      where: and(
        eq(facilityNetRevenueLedgerTable.workspaceId, workspace.id),
        eq(facilityNetRevenueLedgerTable.organizationId, organizationId),
        eq(facilityNetRevenueLedgerTable.periodKey, periodKey),
      ),
    });
    let entry;
    if (existing) {
      [entry] = await db.update(facilityNetRevenueLedgerTable).set({
        netRevenue, source: source ?? "MANUAL", notes: notes ?? null,
        enteredByUserId: user.id, updatedAt: new Date(),
      }).where(eq(facilityNetRevenueLedgerTable.id, existing.id)).returning();
    } else {
      [entry] = await db.insert(facilityNetRevenueLedgerTable).values({
        workspaceId: workspace.id, organizationId, periodKey, netRevenue,
        source: source ?? "MANUAL", notes: notes ?? null,
        enteredByUserId: user.id,
      }).returning();
    }
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: existing ? "LEDGER_UPDATE" : "LEDGER_CREATE",
      entityType: "facility_net_revenue_ledger", entityId: entry.id,
      previousValue: existing ?? null, newValue: entry,
    }).catch(() => {});
    res.status(existing ? 200 : 201).json(entry);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/ledger/bulk", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const { entries } = req.body ?? {};
    if (!Array.isArray(entries)) return res.status(400).json({ error: "entries[] required" });

    const results: { ok: number; errors: Array<{ row: number; error: string }> } = { ok: 0, errors: [] };
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      try {
        if (!e || typeof e !== "object") throw new Error("Invalid row");
        const { organizationId, periodKey, netRevenue, notes } = e;
        if (!organizationId || typeof organizationId !== "string") throw new Error("organizationId required");
        if (!isValidPeriodKey(periodKey)) throw new Error("Invalid periodKey");
        if (typeof netRevenue !== "number" || !Number.isFinite(netRevenue)) throw new Error("Invalid netRevenue");
        const org = await db.query.organizationsTable.findFirst({
          where: and(eq(organizationsTable.id, organizationId), eq(organizationsTable.workspaceId, workspace.id)),
        });
        if (!org) throw new Error("Org not in workspace");
        if (await isPeriodLocked(workspace.id, "EMS_INTERFACILITY", periodKey)) throw new Error("Period locked");
        const existing = await db.query.facilityNetRevenueLedgerTable.findFirst({
          where: and(
            eq(facilityNetRevenueLedgerTable.workspaceId, workspace.id),
            eq(facilityNetRevenueLedgerTable.organizationId, organizationId),
            eq(facilityNetRevenueLedgerTable.periodKey, periodKey),
          ),
        });
        if (existing) {
          await db.update(facilityNetRevenueLedgerTable).set({
            netRevenue, source: "CSV", notes: notes ?? null,
            enteredByUserId: user.id, updatedAt: new Date(),
          }).where(eq(facilityNetRevenueLedgerTable.id, existing.id));
        } else {
          await db.insert(facilityNetRevenueLedgerTable).values({
            workspaceId: workspace.id, organizationId, periodKey, netRevenue,
            source: "CSV", notes: notes ?? null, enteredByUserId: user.id,
          });
        }
        results.ok++;
      } catch (rowErr) {
        results.errors.push({ row: i, error: rowErr instanceof Error ? rowErr.message : "Unknown" });
      }
    }
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "LEDGER_BULK_UPLOAD", entityType: "facility_net_revenue_ledger",
      entityId: "bulk", previousValue: null, newValue: { ok: results.ok, errorCount: results.errors.length },
    }).catch(() => {});
    res.json(results);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/ledger/:id", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const existing = await db.query.facilityNetRevenueLedgerTable.findFirst({
      where: and(eq(facilityNetRevenueLedgerTable.id, req.params.id), eq(facilityNetRevenueLedgerTable.workspaceId, workspace.id)),
    });
    if (!existing) return res.status(404).json({ error: "Ledger entry not found" });
    if (await isPeriodLocked(workspace.id, "EMS_INTERFACILITY", existing.periodKey)) {
      return res.status(409).json({ error: "Period is locked" });
    }
    await db.delete(facilityNetRevenueLedgerTable).where(eq(facilityNetRevenueLedgerTable.id, existing.id));
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "LEDGER_DELETE", entityType: "facility_net_revenue_ledger", entityId: existing.id,
      previousValue: existing, newValue: null,
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Calculator (EMS_INTERFACILITY) ───────────────────────────────────────────
// Idempotent: only DRAFT records are overwritten. APPROVED/LOCKED/PAID/ADJUSTED are preserved.

async function findApplicableRule(
  workspaceId: string,
  line: LineOfService,
  organizationId: string | null,
  asOf: Date,
) {
  // Prefer org-specific rule; fall back to workspace-default (org=null)
  const candidates = await db.select().from(commissionRulesTable).where(
    and(
      eq(commissionRulesTable.workspaceId, workspaceId),
      eq(commissionRulesTable.lineOfService, line),
      lte(commissionRulesTable.effectiveFrom, asOf),
      or(isNull(commissionRulesTable.effectiveTo), gte(commissionRulesTable.effectiveTo, asOf)),
    ),
  );
  if (organizationId) {
    const orgSpecific = candidates.find(r => r.organizationId === organizationId);
    if (orgSpecific) return orgSpecific;
  }
  return candidates.find(r => r.organizationId === null) ?? null;
}

router.post("/calculate", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const { periodKey } = req.body ?? {};
    if (!isValidPeriodKey(periodKey)) return res.status(400).json({ error: "Invalid periodKey" });
    const line: LineOfService = "EMS_INTERFACILITY";
    if (await isPeriodLocked(workspace.id, line, periodKey)) {
      return res.status(409).json({ error: "Period is locked; calculator cannot run." });
    }
    await ensurePeriod(workspace.id, line, periodKey);

    const ledger = await db.select().from(facilityNetRevenueLedgerTable).where(
      and(
        eq(facilityNetRevenueLedgerTable.workspaceId, workspace.id),
        eq(facilityNetRevenueLedgerTable.periodKey, periodKey),
      ),
    );
    const orgIds = ledger.map(l => l.organizationId);
    const orgs = orgIds.length > 0
      ? await db.select({ id: organizationsTable.id, ownerUserId: organizationsTable.ownerUserId, name: organizationsTable.name })
        .from(organizationsTable)
        .where(and(eq(organizationsTable.workspaceId, workspace.id), inArray(organizationsTable.id, orgIds)))
      : [];
    const ownerByOrg = new Map(orgs.map(o => [o.id, o.ownerUserId]));
    const nameByOrg = new Map(orgs.map(o => [o.id, o.name]));

    const asOf = new Date(`${periodKey}-15T00:00:00Z`);
    const result = { created: 0, updated: 0, skipped: 0, missing: [] as Array<{ organizationId: string; reason: string }> };

    for (const lg of ledger) {
      const orgOwner = ownerByOrg.get(lg.organizationId);
      if (!orgOwner) {
        result.missing.push({ organizationId: lg.organizationId, reason: "No facility owner (ownerUserId)" });
        continue;
      }
      const rule = await findApplicableRule(workspace.id, line, lg.organizationId, asOf);
      if (!rule) {
        result.missing.push({ organizationId: lg.organizationId, reason: "No applicable rule" });
        continue;
      }
      let amount = 0;
      if (rule.rateType === "PERCENT_OF_REVENUE") amount = lg.netRevenue * (rule.rateValue / 100);
      else if (rule.rateType === "FLAT") amount = rule.rateValue;
      else if (rule.rateType === "PER_UNIT") amount = rule.rateValue * lg.netRevenue; // treat as per-$1 multiplier
      amount = Math.round(amount * 100) / 100;

      const existing = await db.query.commissionRecordsTable.findFirst({
        where: and(
          eq(commissionRecordsTable.workspaceId, workspace.id),
          eq(commissionRecordsTable.lineOfService, line),
          eq(commissionRecordsTable.periodKey, periodKey),
          eq(commissionRecordsTable.organizationId, lg.organizationId),
        ),
      });
      const calcMeta = {
        ledgerId: lg.id, ruleId: rule.id, rateType: rule.rateType,
        rateValue: rule.rateValue, basis: lg.netRevenue, facility: nameByOrg.get(lg.organizationId),
      };
      if (existing) {
        if (existing.status !== "DRAFT") {
          result.skipped++;
          continue;
        }
        await db.update(commissionRecordsTable).set({
          ruleId: rule.id, ownerRepUserId: orgOwner,
          basisAmount: lg.netRevenue, rateSnapshot: rule.rateValue,
          amount, revenueBasis: rule.revenueBasis, calcMeta, calculatedAt: new Date(), updatedAt: new Date(),
          description: `${nameByOrg.get(lg.organizationId) ?? "Facility"} — ${periodKey}`,
        }).where(eq(commissionRecordsTable.id, existing.id));
        result.updated++;
      } else {
        await db.insert(commissionRecordsTable).values({
          workspaceId: workspace.id, lineOfService: line, periodKey,
          organizationId: lg.organizationId, ownerRepUserId: orgOwner,
          ruleId: rule.id, revenueBasis: rule.revenueBasis,
          basisAmount: lg.netRevenue, rateSnapshot: rule.rateValue, amount,
          status: "DRAFT", calcMeta, calculatedAt: new Date(),
          description: `${nameByOrg.get(lg.organizationId) ?? "Facility"} — ${periodKey}`,
        });
        result.created++;
      }
    }

    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_CALCULATE", entityType: "commission_period",
      entityId: `${line}:${periodKey}`,
      previousValue: null, newValue: result,
    }).catch(() => {});

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Periods ──────────────────────────────────────────────────────────────────

router.get("/periods", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!role) return res.status(403).json({ error: "Not a workspace member" });
    const periods = await db.select().from(commissionPeriodsTable).where(eq(commissionPeriodsTable.workspaceId, workspace.id))
      .orderBy(desc(commissionPeriodsTable.periodKey));
    res.json({ periods });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/periods/:line/:periodKey/lock", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const line = req.params.line;
    const periodKey = req.params.periodKey;
    if (!isValidLine(line) || !isValidPeriodKey(periodKey)) return res.status(400).json({ error: "Invalid line or period" });
    const period = await ensurePeriod(workspace.id, line, periodKey);
    const [updated] = await db.update(commissionPeriodsTable).set({
      isLocked: 1, lockedAt: new Date(), lockedByUserId: user.id, updatedAt: new Date(),
    }).where(eq(commissionPeriodsTable.id, period.id)).returning();
    // Bulk-mark APPROVED records → LOCKED for this line+period
    await db.update(commissionRecordsTable).set({ status: "LOCKED", updatedAt: new Date() })
      .where(and(
        eq(commissionRecordsTable.workspaceId, workspace.id),
        eq(commissionRecordsTable.lineOfService, line),
        eq(commissionRecordsTable.periodKey, periodKey),
        eq(commissionRecordsTable.status, "APPROVED"),
      ));
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "PERIOD_LOCK", entityType: "commission_period", entityId: updated.id,
      previousValue: period, newValue: updated,
    }).catch(() => {});
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/periods/:line/:periodKey/unlock", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const line = req.params.line;
    const periodKey = req.params.periodKey;
    if (!isValidLine(line) || !isValidPeriodKey(periodKey)) return res.status(400).json({ error: "Invalid line or period" });
    const period = await db.query.commissionPeriodsTable.findFirst({
      where: and(
        eq(commissionPeriodsTable.workspaceId, workspace.id),
        eq(commissionPeriodsTable.lineOfService, line),
        eq(commissionPeriodsTable.periodKey, periodKey),
      ),
    });
    if (!period) return res.status(404).json({ error: "Period not found" });
    const [updated] = await db.update(commissionPeriodsTable).set({
      isLocked: 0, lockedAt: null, lockedByUserId: null, updatedAt: new Date(),
    }).where(eq(commissionPeriodsTable.id, period.id)).returning();
    await db.update(commissionRecordsTable).set({ status: "APPROVED", updatedAt: new Date() })
      .where(and(
        eq(commissionRecordsTable.workspaceId, workspace.id),
        eq(commissionRecordsTable.lineOfService, line),
        eq(commissionRecordsTable.periodKey, periodKey),
        eq(commissionRecordsTable.status, "LOCKED"),
      ));
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "PERIOD_UNLOCK", entityType: "commission_period", entityId: updated.id,
      previousValue: period, newValue: updated,
    }).catch(() => {});
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Records ──────────────────────────────────────────────────────────────────

router.get("/records", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!role) return res.status(403).json({ error: "Not a workspace member" });
    const { periodKey, lineOfService, status, ownerRepUserId, organizationId } = req.query as Record<string, string | undefined>;
    const conds = [eq(commissionRecordsTable.workspaceId, workspace.id)];
    if (periodKey && isValidPeriodKey(periodKey)) conds.push(eq(commissionRecordsTable.periodKey, periodKey));
    if (lineOfService && isValidLine(lineOfService)) conds.push(eq(commissionRecordsTable.lineOfService, lineOfService));
    if (status && ["DRAFT", "APPROVED", "LOCKED", "PAID", "ADJUSTED"].includes(status)) {
      conds.push(eq(commissionRecordsTable.status, status as any));
    }
    if (organizationId) conds.push(eq(commissionRecordsTable.organizationId, organizationId));
    if (role === "MEMBER") {
      conds.push(eq(commissionRecordsTable.ownerRepUserId, user.id));
    } else if (ownerRepUserId) {
      conds.push(eq(commissionRecordsTable.ownerRepUserId, ownerRepUserId));
    }
    const rows = await db
      .select({
        id: commissionRecordsTable.id,
        lineOfService: commissionRecordsTable.lineOfService,
        periodKey: commissionRecordsTable.periodKey,
        organizationId: commissionRecordsTable.organizationId,
        ownerRepUserId: commissionRecordsTable.ownerRepUserId,
        ruleId: commissionRecordsTable.ruleId,
        revenueBasis: commissionRecordsTable.revenueBasis,
        basisAmount: commissionRecordsTable.basisAmount,
        rateSnapshot: commissionRecordsTable.rateSnapshot,
        amount: commissionRecordsTable.amount,
        status: commissionRecordsTable.status,
        description: commissionRecordsTable.description,
        calculatedAt: commissionRecordsTable.calculatedAt,
        approvedAt: commissionRecordsTable.approvedAt,
        paidAt: commissionRecordsTable.paidAt,
        createdAt: commissionRecordsTable.createdAt,
        organizationName: organizationsTable.name,
        ownerFirstName: usersTable.firstName,
        ownerLastName: usersTable.lastName,
      })
      .from(commissionRecordsTable)
      .leftJoin(organizationsTable, eq(commissionRecordsTable.organizationId, organizationsTable.id))
      .leftJoin(usersTable, eq(commissionRecordsTable.ownerRepUserId, usersTable.id))
      .where(and(...conds))
      .orderBy(desc(commissionRecordsTable.periodKey), desc(commissionRecordsTable.amount));

    const totals = rows.reduce((acc, r) => {
      acc.count++;
      acc.total += Number(r.amount);
      acc.byStatus[r.status] = (acc.byStatus[r.status] || 0) + Number(r.amount);
      return acc;
    }, { count: 0, total: 0, byStatus: {} as Record<string, number> });

    res.json({ records: rows, totals, role });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/records/:id", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!role) return res.status(403).json({ error: "Not a workspace member" });
    const rec = await db.query.commissionRecordsTable.findFirst({
      where: and(eq(commissionRecordsTable.id, req.params.id), eq(commissionRecordsTable.workspaceId, workspace.id)),
    });
    if (!rec) return res.status(404).json({ error: "Record not found" });
    if (role === "MEMBER" && rec.ownerRepUserId !== user.id) return res.status(403).json({ error: "Forbidden" });

    const [orgRow, ownerRow, adjustments] = await Promise.all([
      rec.organizationId
        ? db.select({ id: organizationsTable.id, name: organizationsTable.name }).from(organizationsTable).where(eq(organizationsTable.id, rec.organizationId)).limit(1)
        : Promise.resolve([]),
      db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, rec.ownerRepUserId)).limit(1),
      db.select().from(commissionAdjustmentsTable).where(eq(commissionAdjustmentsTable.parentRecordId, rec.id)).orderBy(desc(commissionAdjustmentsTable.createdAt)),
    ]);
    res.json({
      ...rec,
      organization: orgRow[0] ?? null,
      owner: ownerRow[0] ?? null,
      adjustments,
      role,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/records", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const { lineOfService, periodKey, organizationId, ownerRepUserId, revenueBasis, basisAmount, rateSnapshot, amount, description } = req.body ?? {};
    if (!isValidLine(lineOfService)) return res.status(400).json({ error: "Invalid lineOfService" });
    if (lineOfService === "EMS_INTERFACILITY") return res.status(400).json({ error: "EMS_INTERFACILITY records are auto-calculated; use /calculate" });
    if (!isValidPeriodKey(periodKey)) return res.status(400).json({ error: "Invalid periodKey" });
    if (!ownerRepUserId || typeof ownerRepUserId !== "string") return res.status(400).json({ error: "ownerRepUserId required" });
    if (typeof amount !== "number" || !Number.isFinite(amount)) return res.status(400).json({ error: "Invalid amount" });
    if (organizationId) {
      const org = await db.query.organizationsTable.findFirst({
        where: and(eq(organizationsTable.id, organizationId), eq(organizationsTable.workspaceId, workspace.id)),
      });
      if (!org) return res.status(404).json({ error: "Organization not in workspace" });
    }
    const ownerMembership = await db.query.workspaceMembersTable.findFirst({
      where: and(eq(workspaceMembersTable.workspaceId, workspace.id), eq(workspaceMembersTable.userId, ownerRepUserId)),
    });
    if (!ownerMembership) return res.status(404).json({ error: "ownerRepUserId is not a workspace member" });
    if (await isPeriodLocked(workspace.id, lineOfService, periodKey)) {
      return res.status(409).json({ error: "Period is locked" });
    }
    await ensurePeriod(workspace.id, lineOfService, periodKey);
    const [rec] = await db.insert(commissionRecordsTable).values({
      workspaceId: workspace.id, lineOfService, periodKey,
      organizationId: organizationId ?? null,
      ownerRepUserId,
      revenueBasis: revenueBasis ?? "FLAT",
      basisAmount: basisAmount ?? 0,
      rateSnapshot: rateSnapshot ?? null,
      amount, status: "DRAFT", description: description ?? null,
    }).returning();
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_RECORD_CREATE", entityType: "commission_record", entityId: rec.id,
      previousValue: null, newValue: rec,
    }).catch(() => {});
    res.status(201).json(rec);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/records/:id", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const existing = await db.query.commissionRecordsTable.findFirst({
      where: and(eq(commissionRecordsTable.id, req.params.id), eq(commissionRecordsTable.workspaceId, workspace.id)),
    });
    if (!existing) return res.status(404).json({ error: "Record not found" });
    if (existing.status !== "DRAFT") {
      return res.status(409).json({ error: "Only DRAFT records can be edited; use /adjust for paid records" });
    }
    if (await isPeriodLocked(workspace.id, existing.lineOfService, existing.periodKey)) {
      return res.status(409).json({ error: "Period is locked" });
    }
    const { amount, basisAmount, description, overrideNote, rateSnapshot } = req.body ?? {};
    const [updated] = await db.update(commissionRecordsTable).set({
      ...(amount !== undefined ? { amount } : {}),
      ...(basisAmount !== undefined ? { basisAmount } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(overrideNote !== undefined ? { overrideNote } : {}),
      ...(rateSnapshot !== undefined ? { rateSnapshot } : {}),
      updatedAt: new Date(),
    }).where(eq(commissionRecordsTable.id, existing.id)).returning();
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_RECORD_UPDATE", entityType: "commission_record", entityId: updated.id,
      previousValue: existing, newValue: updated,
    }).catch(() => {});
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/records/:id/approve", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const existing = await db.query.commissionRecordsTable.findFirst({
      where: and(eq(commissionRecordsTable.id, req.params.id), eq(commissionRecordsTable.workspaceId, workspace.id)),
    });
    if (!existing) return res.status(404).json({ error: "Record not found" });
    if (existing.status !== "DRAFT") return res.status(409).json({ error: `Cannot approve from status ${existing.status}` });
    if (await isPeriodLocked(workspace.id, existing.lineOfService, existing.periodKey)) {
      return res.status(409).json({ error: "Period is locked" });
    }
    const [updated] = await db.update(commissionRecordsTable).set({
      status: "APPROVED", approvedAt: new Date(), approvedByUserId: user.id, updatedAt: new Date(),
    }).where(eq(commissionRecordsTable.id, existing.id)).returning();
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_RECORD_APPROVE", entityType: "commission_record", entityId: updated.id,
      previousValue: existing, newValue: updated,
    }).catch(() => {});
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/records/:id/pay", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const existing = await db.query.commissionRecordsTable.findFirst({
      where: and(eq(commissionRecordsTable.id, req.params.id), eq(commissionRecordsTable.workspaceId, workspace.id)),
    });
    if (!existing) return res.status(404).json({ error: "Record not found" });
    if (!["APPROVED", "LOCKED"].includes(existing.status)) {
      return res.status(409).json({ error: `Cannot pay from status ${existing.status}; must be APPROVED or LOCKED` });
    }
    const [updated] = await db.update(commissionRecordsTable).set({
      status: "PAID", paidAt: new Date(), paidByUserId: user.id, updatedAt: new Date(),
    }).where(eq(commissionRecordsTable.id, existing.id)).returning();
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_RECORD_PAY", entityType: "commission_record", entityId: updated.id,
      previousValue: existing, newValue: updated,
    }).catch(() => {});
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/records/:id/adjust", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const { deltaAmount, reason } = req.body ?? {};
    if (typeof deltaAmount !== "number" || !Number.isFinite(deltaAmount)) return res.status(400).json({ error: "Invalid deltaAmount" });
    if (!reason || typeof reason !== "string") return res.status(400).json({ error: "reason required" });
    const existing = await db.query.commissionRecordsTable.findFirst({
      where: and(eq(commissionRecordsTable.id, req.params.id), eq(commissionRecordsTable.workspaceId, workspace.id)),
    });
    if (!existing) return res.status(404).json({ error: "Record not found" });
    if (!["PAID", "ADJUSTED"].includes(existing.status)) {
      return res.status(409).json({ error: `Adjustments are only allowed on PAID/ADJUSTED records; current status: ${existing.status}` });
    }

    const [adjustment] = await db.insert(commissionAdjustmentsTable).values({
      workspaceId: workspace.id, parentRecordId: existing.id,
      deltaAmount, reason, createdByUserId: user.id,
    }).returning();
    const newAmount = Math.round((Number(existing.amount) + deltaAmount) * 100) / 100;
    const [updated] = await db.update(commissionRecordsTable).set({
      amount: newAmount, status: "ADJUSTED",
      lastAdjustedAt: new Date(), lastAdjustedByUserId: user.id, updatedAt: new Date(),
    }).where(eq(commissionRecordsTable.id, existing.id)).returning();
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_RECORD_ADJUST", entityType: "commission_record", entityId: updated.id,
      previousValue: { amount: existing.amount, status: existing.status },
      newValue: { amount: updated.amount, status: updated.status, deltaAmount, reason, adjustmentId: adjustment.id },
    }).catch(() => {});
    res.json({ record: updated, adjustment });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/records/:id", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const existing = await db.query.commissionRecordsTable.findFirst({
      where: and(eq(commissionRecordsTable.id, req.params.id), eq(commissionRecordsTable.workspaceId, workspace.id)),
    });
    if (!existing) return res.status(404).json({ error: "Record not found" });
    if (existing.status !== "DRAFT") return res.status(409).json({ error: "Only DRAFT records can be deleted" });
    if (await isPeriodLocked(workspace.id, existing.lineOfService, existing.periodKey)) {
      return res.status(409).json({ error: "Period is locked" });
    }
    await db.delete(commissionRecordsTable).where(eq(commissionRecordsTable.id, existing.id));
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_RECORD_DELETE", entityType: "commission_record", entityId: existing.id,
      previousValue: existing, newValue: null,
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── CSV Export ───────────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get("/export.csv", async (req: Request, res: Response) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!role) return res.status(403).json({ error: "Not a workspace member" });
    const { periodKey, lineOfService } = req.query as Record<string, string | undefined>;
    const conds = [eq(commissionRecordsTable.workspaceId, workspace.id)];
    if (periodKey && isValidPeriodKey(periodKey)) conds.push(eq(commissionRecordsTable.periodKey, periodKey));
    if (lineOfService && isValidLine(lineOfService)) conds.push(eq(commissionRecordsTable.lineOfService, lineOfService));
    if (role === "MEMBER") conds.push(eq(commissionRecordsTable.ownerRepUserId, user.id));

    const rows = await db
      .select({
        id: commissionRecordsTable.id,
        line: commissionRecordsTable.lineOfService,
        period: commissionRecordsTable.periodKey,
        status: commissionRecordsTable.status,
        amount: commissionRecordsTable.amount,
        basisAmount: commissionRecordsTable.basisAmount,
        rateSnapshot: commissionRecordsTable.rateSnapshot,
        revenueBasis: commissionRecordsTable.revenueBasis,
        description: commissionRecordsTable.description,
        approvedAt: commissionRecordsTable.approvedAt,
        paidAt: commissionRecordsTable.paidAt,
        organizationName: organizationsTable.name,
        ownerFirstName: usersTable.firstName,
        ownerLastName: usersTable.lastName,
        ownerEmail: usersTable.email,
      })
      .from(commissionRecordsTable)
      .leftJoin(organizationsTable, eq(commissionRecordsTable.organizationId, organizationsTable.id))
      .leftJoin(usersTable, eq(commissionRecordsTable.ownerRepUserId, usersTable.id))
      .where(and(...conds))
      .orderBy(desc(commissionRecordsTable.periodKey));

    const header = ["Period", "Line", "Rep Name", "Rep Email", "Facility", "Status", "Basis", "Rate", "Amount", "Description", "Approved At", "Paid At"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const repName = [r.ownerFirstName, r.ownerLastName].filter(Boolean).join(" ");
      lines.push([
        r.period, r.line, repName, r.ownerEmail ?? "", r.organizationName ?? "",
        r.status, r.basisAmount, r.rateSnapshot ?? "", r.amount, r.description ?? "",
        r.approvedAt ? new Date(r.approvedAt).toISOString() : "",
        r.paidAt ? new Date(r.paidAt).toISOString() : "",
      ].map(csvEscape).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="commissions-${periodKey ?? "all"}.csv"`);
    res.send(lines.join("\n"));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Role lookup helper ───────────────────────────────────────────────────────

router.get("/role", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    res.json({ role });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

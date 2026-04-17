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

// Returns the locked period keys that a rule's effective range would affect for a given line.
// Used to block rule edits that would alter commission math for already-closed months.
async function lockedPeriodsAffectedByRule(
  workspaceId: string,
  line: LineOfService,
  effectiveFrom: Date | null,
  effectiveTo: Date | null,
): Promise<string[]> {
  const lockedRows = await db.select({ periodKey: commissionPeriodsTable.periodKey })
    .from(commissionPeriodsTable)
    .where(and(
      eq(commissionPeriodsTable.workspaceId, workspaceId),
      eq(commissionPeriodsTable.lineOfService, line),
      eq(commissionPeriodsTable.isLocked, 1),
    ));
  return lockedRows
    .map(r => r.periodKey)
    .filter(pk => {
      const asOf = new Date(`${pk}-15T00:00:00Z`);
      if (effectiveFrom && asOf < effectiveFrom) return false;
      if (effectiveTo && asOf > effectiveTo) return false;
      return true;
    });
}

function sourceTypeForLine(line: LineOfService): "EMS_AUTO" | "MANUAL_EVENT" | "MANUAL_EDU" | "MANUAL_GOV" {
  switch (line) {
    case "EMS_INTERFACILITY": return "EMS_AUTO";
    case "EVENT_STAFFING": return "MANUAL_EVENT";
    case "EMT_PROGRAM": return "MANUAL_EDU";
    case "GOVERNMENT": return "MANUAL_GOV";
  }
}

function buildSnapshotName(firstName: string | null | undefined, lastName: string | null | undefined, email: string | null | undefined): string {
  const full = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return full || (email ?? "Unknown");
}

// ─── Rules ────────────────────────────────────────────────────────────────────

router.get("/rules", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
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
    const ruleEffFrom = effectiveFrom ? new Date(effectiveFrom) : new Date();
    const ruleEffTo = effectiveTo ? new Date(effectiveTo) : null;
    const lockedAffected = await lockedPeriodsAffectedByRule(workspace.id, lineOfService, ruleEffFrom, ruleEffTo);
    if (lockedAffected.length > 0) {
      return res.status(409).json({
        error: `Rule's effective range overlaps locked period(s): ${lockedAffected.join(", ")}. Use Adjustments instead.`,
        lockedPeriods: lockedAffected,
      });
    }
    const [rule] = await db.insert(commissionRulesTable).values({
      workspaceId: workspace.id,
      lineOfService,
      organizationId: organizationId || null,
      rateType,
      rateValue,
      revenueBasis: revenueBasis ?? "NET_REVENUE",
      effectiveFrom: ruleEffFrom,
      effectiveTo: ruleEffTo,
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
    if (rateType !== undefined && !["PERCENT_OF_REVENUE", "FLAT", "PER_UNIT"].includes(rateType)) {
      return res.status(400).json({ error: "Invalid rateType" });
    }
    if (rateValue !== undefined && (typeof rateValue !== "number" || !Number.isFinite(rateValue) || rateValue < 0)) {
      return res.status(400).json({ error: "Invalid rateValue (must be a non-negative number)" });
    }
    if (revenueBasis !== undefined && !["NET_REVENUE", "CONTRACT_VALUE", "TUITION", "PER_STUDENT", "FLAT", "MILESTONE"].includes(revenueBasis)) {
      return res.status(400).json({ error: "Invalid revenueBasis" });
    }
    if (organizationId) {
      const org = await db.query.organizationsTable.findFirst({
        where: and(eq(organizationsTable.id, organizationId), eq(organizationsTable.workspaceId, workspace.id)),
      });
      if (!org) return res.status(404).json({ error: "Organization not in workspace" });
    }
    // Locked-period immutability: block edits when either the existing or the proposed
    // effective range overlaps a locked period for this rule's line of service.
    const newFrom = effectiveFrom !== undefined ? (effectiveFrom ? new Date(effectiveFrom) : new Date()) : existing.effectiveFrom;
    const newTo = effectiveTo !== undefined ? (effectiveTo ? new Date(effectiveTo) : null) : existing.effectiveTo;
    const lineForLockCheck = existing.lineOfService as LineOfService;
    const lockedAffectedExisting = await lockedPeriodsAffectedByRule(workspace.id, lineForLockCheck, existing.effectiveFrom, existing.effectiveTo);
    const lockedAffectedNew = await lockedPeriodsAffectedByRule(workspace.id, lineForLockCheck, newFrom, newTo);
    const lockedAffected = Array.from(new Set([...lockedAffectedExisting, ...lockedAffectedNew]));
    if (lockedAffected.length > 0) {
      return res.status(409).json({
        error: `Rule edit would affect locked period(s): ${lockedAffected.join(", ")}. Use Adjustments instead.`,
        lockedPeriods: lockedAffected,
      });
    }
    const [updated] = await db.update(commissionRulesTable).set({
      ...(rateType !== undefined ? { rateType } : {}),
      ...(rateValue !== undefined ? { rateValue } : {}),
      ...(revenueBasis !== undefined ? { revenueBasis } : {}),
      ...(effectiveFrom !== undefined ? { effectiveFrom: newFrom } : {}),
      ...(effectiveTo !== undefined ? { effectiveTo: newTo } : {}),
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
    const lockedAffected = await lockedPeriodsAffectedByRule(
      workspace.id, existing.lineOfService as LineOfService, existing.effectiveFrom, existing.effectiveTo,
    );
    if (lockedAffected.length > 0) {
      return res.status(409).json({
        error: `Cannot delete: rule covers locked period(s) ${lockedAffected.join(", ")}.`,
        lockedPeriods: lockedAffected,
      });
    }
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
        // Accept both {organizationId, periodKey} and {facilityId, periodMonth} key spellings
        const organizationId = e.organizationId ?? e.facilityId;
        const periodKey = e.periodKey ?? e.periodMonth;
        const { netRevenue, notes } = e;
        if (!organizationId || typeof organizationId !== "string") throw new Error("organizationId/facilityId required");
        if (!isValidPeriodKey(periodKey)) throw new Error("Invalid periodKey/periodMonth (YYYY-MM)");
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

    // Resolve rep snapshot names in one batch
    const repIds = Array.from(new Set(orgs.map(o => o.ownerUserId).filter((x): x is string => !!x)));
    const repRows = repIds.length > 0
      ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
          .from(usersTable).where(inArray(usersTable.id, repIds))
      : [];
    const repNameById = new Map(repRows.map(r => [r.id, buildSnapshotName(r.firstName, r.lastName, r.email)]));

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
      // GAP F: negative-revenue protection — never pay commission on a negative basis
      const safeBasis = Math.max(lg.netRevenue, 0);
      let amount = 0;
      if (rule.rateType === "PERCENT_OF_REVENUE") amount = safeBasis * (rule.rateValue / 100);
      else if (rule.rateType === "FLAT") amount = rule.rateValue;
      else if (rule.rateType === "PER_UNIT") amount = rule.rateValue * safeBasis; // treat as per-$1 multiplier

      const existing = await db.query.commissionRecordsTable.findFirst({
        where: and(
          eq(commissionRecordsTable.workspaceId, workspace.id),
          eq(commissionRecordsTable.lineOfService, line),
          eq(commissionRecordsTable.periodKey, periodKey),
          eq(commissionRecordsTable.organizationId, lg.organizationId),
        ),
      });
      // Apply commission split (default 1.0 = full); preserve any custom split set on an existing DRAFT
      const splitPercent = existing?.commissionSplitPercent ?? 1.0;
      amount = Math.round(amount * splitPercent * 100) / 100;
      const repSnapshotName = repNameById.get(orgOwner) ?? null;
      const calcMeta = {
        ledgerId: lg.id, ruleId: rule.id, rateType: rule.rateType,
        rateValue: rule.rateValue, basis: lg.netRevenue, safeBasis,
        revenueMode: lg.revenueMode, splitPercent,
        facility: nameByOrg.get(lg.organizationId),
      };
      if (existing) {
        if (existing.status !== "DRAFT") {
          result.skipped++;
          continue;
        }
        await db.update(commissionRecordsTable).set({
          ruleId: rule.id, ownerRepUserId: orgOwner,
          ownerRepSnapshotName: repSnapshotName,
          sourceType: "EMS_AUTO",
          basisAmount: safeBasis, rateSnapshot: rule.rateValue,
          amount, revenueBasis: rule.revenueBasis, calcMeta, calculatedAt: new Date(), updatedAt: new Date(),
          description: `${nameByOrg.get(lg.organizationId) ?? "Facility"} — ${periodKey}`,
        }).where(eq(commissionRecordsTable.id, existing.id));
        result.updated++;
      } else {
        await db.insert(commissionRecordsTable).values({
          workspaceId: workspace.id, lineOfService: line, periodKey,
          organizationId: lg.organizationId, ownerRepUserId: orgOwner,
          ownerRepSnapshotName: repSnapshotName,
          commissionSplitPercent: 1.0,
          sourceType: "EMS_AUTO",
          ruleId: rule.id, revenueBasis: rule.revenueBasis,
          basisAmount: safeBasis, rateSnapshot: rule.rateValue, amount,
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
    const { periodKey, lineOfService, status, ownerRepUserId, organizationId, fromPeriod, toPeriod } = req.query as Record<string, string | undefined>;
    const conds = [eq(commissionRecordsTable.workspaceId, workspace.id)];
    if (periodKey && isValidPeriodKey(periodKey)) conds.push(eq(commissionRecordsTable.periodKey, periodKey));
    if (fromPeriod && isValidPeriodKey(fromPeriod)) conds.push(gte(commissionRecordsTable.periodKey, fromPeriod));
    if (toPeriod && isValidPeriodKey(toPeriod)) conds.push(lte(commissionRecordsTable.periodKey, toPeriod));
    if (lineOfService && isValidLine(lineOfService)) conds.push(eq(commissionRecordsTable.lineOfService, lineOfService));
    const VALID_STATUSES = ["DRAFT", "APPROVED", "LOCKED", "PAID", "ADJUSTED"] as const;
    type RecStatus = typeof VALID_STATUSES[number];
    const isStatus = (v: string): v is RecStatus => (VALID_STATUSES as readonly string[]).includes(v);
    if (status && isStatus(status)) {
      conds.push(eq(commissionRecordsTable.status, status));
    }
    if (organizationId) conds.push(eq(commissionRecordsTable.organizationId, organizationId));
    if (role === "MEMBER") {
      conds.push(eq(commissionRecordsTable.ownerRepUserId, user.id));
      // Also restrict to facilities the rep owns (or null org for non-facility lines)
      const ownedFacilities = await db.select({ id: organizationsTable.id }).from(organizationsTable)
        .where(and(eq(organizationsTable.workspaceId, workspace.id), eq(organizationsTable.ownerUserId, user.id)));
      const ownedIds = ownedFacilities.map(o => o.id);
      if (ownedIds.length === 0) {
        conds.push(isNull(commissionRecordsTable.organizationId));
      } else {
        conds.push(or(isNull(commissionRecordsTable.organizationId), inArray(commissionRecordsTable.organizationId, ownedIds))!);
      }
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
    if (role === "MEMBER") {
      if (rec.ownerRepUserId !== user.id) return res.status(403).json({ error: "Forbidden" });
      if (rec.organizationId) {
        const ownedFacility = await db.query.organizationsTable.findFirst({
          where: and(eq(organizationsTable.id, rec.organizationId), eq(organizationsTable.ownerUserId, user.id), eq(organizationsTable.workspaceId, workspace.id)),
        });
        if (!ownedFacility) return res.status(403).json({ error: "Forbidden: not facility owner" });
      }
    }

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
    const repRow = await db.query.usersTable.findFirst({ where: eq(usersTable.id, ownerRepUserId) });
    const repSnapshot = repRow ? buildSnapshotName(repRow.firstName, repRow.lastName, repRow.email) : null;
    // Optional split percent in body, default 1.0; clamped 0..1
    const splitInput = req.body?.commissionSplitPercent;
    const splitPct = typeof splitInput === "number" && Number.isFinite(splitInput)
      ? Math.min(1, Math.max(0, splitInput)) : 1.0;
    const safeAmount = Math.round(Math.max(amount, 0) * splitPct * 100) / 100;
    const [rec] = await db.insert(commissionRecordsTable).values({
      workspaceId: workspace.id, lineOfService, periodKey,
      organizationId: organizationId ?? null,
      ownerRepUserId,
      ownerRepSnapshotName: repSnapshot,
      commissionSplitPercent: splitPct,
      sourceType: sourceTypeForLine(lineOfService),
      revenueBasis: revenueBasis ?? "FLAT",
      basisAmount: Math.max(basisAmount ?? 0, 0),
      rateSnapshot: rateSnapshot ?? null,
      amount: safeAmount, status: "DRAFT", description: description ?? null,
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
    if (amount !== undefined && Number(amount) !== Number(existing.amount) && (!overrideNote || typeof overrideNote !== "string" || !overrideNote.trim())) {
      return res.status(400).json({ error: "Changing amount requires a non-empty overrideNote" });
    }
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
    // Spec: any state may have an adjustment recorded as a new ADJUSTED entry
    // Adjustments are recorded as a separate ADJUSTED commission_record linked via parentRecordId,
    // so the original record's audited amount is preserved. The adjustment row is kept for history.
    const [adjustment] = await db.insert(commissionAdjustmentsTable).values({
      workspaceId: workspace.id, parentRecordId: existing.id,
      deltaAmount, reason, createdByUserId: user.id,
    }).returning();
    const [adjustedRecord] = await db.insert(commissionRecordsTable).values({
      workspaceId: workspace.id, lineOfService: existing.lineOfService, periodKey: existing.periodKey,
      organizationId: existing.organizationId, ownerRepUserId: existing.ownerRepUserId,
      ownerRepSnapshotName: existing.ownerRepSnapshotName,
      commissionSplitPercent: existing.commissionSplitPercent,
      sourceType: existing.sourceType,
      ruleId: existing.ruleId, revenueBasis: existing.revenueBasis,
      basisAmount: 0, rateSnapshot: null, amount: deltaAmount,
      status: "ADJUSTED", description: `Adjustment to ${existing.id.slice(0, 8)}: ${reason}`,
      parentRecordId: existing.id,
      lastAdjustedAt: new Date(), lastAdjustedByUserId: user.id,
    }).returning();
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_RECORD_ADJUST", entityType: "commission_record", entityId: adjustedRecord.id,
      previousValue: { parentRecordId: existing.id, parentAmount: existing.amount },
      newValue: { adjustedRecordId: adjustedRecord.id, deltaAmount, reason, adjustmentId: adjustment.id },
    }).catch(() => {});
    res.json({ record: adjustedRecord, adjustment, parent: existing });
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
    const { periodKey, lineOfService, status, organizationId, ownerRepUserId, fromPeriod, toPeriod } =
      req.query as Record<string, string | undefined>;
    const conds = [eq(commissionRecordsTable.workspaceId, workspace.id)];
    if (periodKey && isValidPeriodKey(periodKey)) conds.push(eq(commissionRecordsTable.periodKey, periodKey));
    if (fromPeriod && isValidPeriodKey(fromPeriod)) conds.push(gte(commissionRecordsTable.periodKey, fromPeriod));
    if (toPeriod && isValidPeriodKey(toPeriod)) conds.push(lte(commissionRecordsTable.periodKey, toPeriod));
    if (lineOfService && isValidLine(lineOfService)) conds.push(eq(commissionRecordsTable.lineOfService, lineOfService));
    const VALID_EXP_STATUSES = ["DRAFT", "APPROVED", "LOCKED", "PAID", "ADJUSTED"] as const;
    type ExpStatus = typeof VALID_EXP_STATUSES[number];
    const isExpStatus = (v: string): v is ExpStatus => (VALID_EXP_STATUSES as readonly string[]).includes(v);
    if (status && isExpStatus(status)) conds.push(eq(commissionRecordsTable.status, status));
    if (organizationId) conds.push(eq(commissionRecordsTable.organizationId, organizationId));
    if (role !== "MEMBER" && ownerRepUserId) conds.push(eq(commissionRecordsTable.ownerRepUserId, ownerRepUserId));
    if (role === "MEMBER") {
      conds.push(eq(commissionRecordsTable.ownerRepUserId, user.id));
      const ownedFacilities = await db.select({ id: organizationsTable.id }).from(organizationsTable)
        .where(and(eq(organizationsTable.workspaceId, workspace.id), eq(organizationsTable.ownerUserId, user.id)));
      const ownedIds = ownedFacilities.map(o => o.id);
      if (ownedIds.length === 0) conds.push(isNull(commissionRecordsTable.organizationId));
      else conds.push(or(isNull(commissionRecordsTable.organizationId), inArray(commissionRecordsTable.organizationId, ownedIds))!);
    }

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


// ─── KPI aggregation ──────────────────────────────────────────────────────────

router.get("/kpi", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!role) return res.status(403).json({ error: "Not a workspace member" });
    const { periodKey } = req.query as Record<string, string | undefined>;
    const period = isValidPeriodKey(periodKey) ? periodKey! : (() => {
      const d = new Date();
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    })();
    const yearPrefix = period.slice(0, 4);

    // Base scope
    const baseConds = [eq(commissionRecordsTable.workspaceId, workspace.id)];
    let memberOwnedIds: string[] | null = null;
    if (role === "MEMBER") {
      baseConds.push(eq(commissionRecordsTable.ownerRepUserId, user.id));
      const owned = await db.select({ id: organizationsTable.id }).from(organizationsTable)
        .where(and(eq(organizationsTable.workspaceId, workspace.id), eq(organizationsTable.ownerUserId, user.id)));
      memberOwnedIds = owned.map(o => o.id);
      if (memberOwnedIds.length === 0) baseConds.push(isNull(commissionRecordsTable.organizationId));
      else baseConds.push(or(isNull(commissionRecordsTable.organizationId), inArray(commissionRecordsTable.organizationId, memberOwnedIds))!);
    }

    const allRows = await db.select({
      ownerRepUserId: commissionRecordsTable.ownerRepUserId,
      periodKey: commissionRecordsTable.periodKey,
      amount: commissionRecordsTable.amount,
      status: commissionRecordsTable.status,
    }).from(commissionRecordsTable).where(and(...baseConds));

    const mtdRows = allRows.filter(r => r.periodKey === period);
    const ytdRows = allRows.filter(r => r.periodKey.startsWith(yearPrefix));
    const sum = (rows: typeof allRows) => Math.round(rows.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;

    const kpi: {
      periodKey: string;
      role: Role;
      mtdTotal: number;
      ytdTotal: number;
      mtdByStatus: Record<string, number>;
      teamMtdTotal?: number;
      teamYtdTotal?: number;
      ranking?: Array<{ ownerRepUserId: string; firstName: string | null; lastName: string | null; mtd: number; ytd: number }>;
    } = {
      periodKey: period, role,
      mtdTotal: sum(mtdRows),
      ytdTotal: sum(ytdRows),
      mtdByStatus: mtdRows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + Number(r.amount); return acc; }, {} as Record<string, number>),
    };

    // For MANAGER/ADMIN/OWNER: also compute team-wide ranking
    if (canReadAll(role)) {
      const teamConds = [eq(commissionRecordsTable.workspaceId, workspace.id)];
      const teamRows = await db.select({
        ownerRepUserId: commissionRecordsTable.ownerRepUserId,
        periodKey: commissionRecordsTable.periodKey,
        amount: commissionRecordsTable.amount,
      }).from(commissionRecordsTable).where(and(...teamConds));

      const byRep = new Map<string, { mtd: number; ytd: number }>();
      for (const r of teamRows) {
        const cur = byRep.get(r.ownerRepUserId) ?? { mtd: 0, ytd: 0 };
        if (r.periodKey === period) cur.mtd += Number(r.amount);
        if (r.periodKey.startsWith(yearPrefix)) cur.ytd += Number(r.amount);
        byRep.set(r.ownerRepUserId, cur);
      }
      kpi.teamMtdTotal = Math.round(Array.from(byRep.values()).reduce((s, v) => s + v.mtd, 0) * 100) / 100;
      kpi.teamYtdTotal = Math.round(Array.from(byRep.values()).reduce((s, v) => s + v.ytd, 0) * 100) / 100;

      const repIds = Array.from(byRep.keys());
      const repInfo = repIds.length > 0
        ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
            .from(usersTable).where(inArray(usersTable.id, repIds))
        : [];
      const infoById = new Map(repInfo.map(u => [u.id, u]));
      kpi.ranking = repIds.map(id => {
        const u = infoById.get(id);
        const v = byRep.get(id)!;
        return {
          ownerRepUserId: id,
          firstName: u?.firstName ?? null,
          lastName: u?.lastName ?? null,
          mtd: Math.round(v.mtd * 100) / 100,
          ytd: Math.round(v.ytd * 100) / 100,
        };
      }).sort((a, b) => b.mtd - a.mtd);
    }

    res.json(kpi);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Override endpoint (explicit, requires note) ──────────────────────────────

router.post("/records/:id/override", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const role = await getRole(workspace.id, user.id);
    if (!canMutate(role)) return res.status(403).json({ error: "Admins only" });
    const { amount, overrideNote } = req.body ?? {};
    if (typeof amount !== "number" || !Number.isFinite(amount)) return res.status(400).json({ error: "Invalid amount" });
    if (!overrideNote || typeof overrideNote !== "string" || !overrideNote.trim()) {
      return res.status(400).json({ error: "overrideNote (required, non-empty)" });
    }
    const existing = await db.query.commissionRecordsTable.findFirst({
      where: and(eq(commissionRecordsTable.id, req.params.id), eq(commissionRecordsTable.workspaceId, workspace.id)),
    });
    if (!existing) return res.status(404).json({ error: "Record not found" });
    if (existing.status !== "DRAFT") {
      return res.status(409).json({ error: "Override only allowed on DRAFT records; use /adjust for finalized ones" });
    }
    if (await isPeriodLocked(workspace.id, existing.lineOfService, existing.periodKey)) {
      return res.status(409).json({ error: "Period is locked" });
    }
    const [updated] = await db.update(commissionRecordsTable).set({
      amount, overrideNote: overrideNote.trim(),
      lastAdjustedAt: new Date(), lastAdjustedByUserId: user.id, updatedAt: new Date(),
    }).where(eq(commissionRecordsTable.id, existing.id)).returning();
    await logAdminAction({
      workspaceId: workspace.id, changedByUserId: user.id,
      action: "COMMISSION_RECORD_OVERRIDE", entityType: "commission_record", entityId: updated.id,
      previousValue: { amount: existing.amount, overrideNote: existing.overrideNote },
      newValue: { amount: updated.amount, overrideNote: updated.overrideNote },
    }).catch(() => {});
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

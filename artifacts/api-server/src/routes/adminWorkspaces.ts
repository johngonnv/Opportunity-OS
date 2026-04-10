import { Router } from "express";
import { db } from "@workspace/db";
import {
  workspacesTable,
  workspaceMembersTable,
  workspacePipelineViewsTable,
  workspaceAdminAuditLogTable,
  workspaceLaunchChecklistTable,
  workspaceHealthSnapshotsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, asc, desc, sql } from "drizzle-orm";
import { platformAdminMiddleware } from "../lib/platformAdminMiddleware";
import { logAdminAction } from "../lib/logAdminAction";

const router = Router();

router.use(platformAdminMiddleware);

const PLATFORM_SUPPORT_HEADER = "x-platform-support";

function isPlatformSupportOverride(req: import("express").Request): boolean {
  return req.headers[PLATFORM_SUPPORT_HEADER] === "true";
}

router.get("/", async (req, res) => {
  try {
    const workspaces = await db.select().from(workspacesTable).orderBy(asc(workspacesTable.name));

    const result = await Promise.all(workspaces.map(async (ws) => {
      const members = await db.select()
        .from(workspaceMembersTable)
        .where(eq(workspaceMembersTable.workspaceId, ws.id));

      const adminMembers = members.filter(m => m.role === "ADMIN" || m.role === "OWNER");

      const adminUserIds = adminMembers.map(m => m.userId);
      let adminNames: string[] = [];
      if (adminUserIds.length > 0) {
        const adminUsers = await Promise.all(
          adminUserIds.map(uid => db.query.usersTable.findFirst({ where: eq(usersTable.id, uid) }))
        );
        adminNames = adminUsers
          .filter(Boolean)
          .map(u => [u!.firstName, u!.lastName].filter(Boolean).join(" ") || u!.email);
      }

      const activeViews = await db.select()
        .from(workspacePipelineViewsTable)
        .where(and(
          eq(workspacePipelineViewsTable.workspaceId, ws.id),
          eq(workspacePipelineViewsTable.isEnabled, true)
        ));

      return {
        ...ws,
        memberCount: members.length,
        adminNames,
        activePipelineViewCount: activeViews.length,
      };
    }));

    res.json({ workspaces: result });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/:workspaceId", async (req, res) => {
  try {
    const workspace = await db.query.workspacesTable.findFirst({
      where: eq(workspacesTable.id, req.params.workspaceId),
    });
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });
    res.json({ workspace });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/:workspaceId/pipeline-views", async (req, res) => {
  try {
    const workspace = await db.query.workspacesTable.findFirst({
      where: eq(workspacesTable.id, req.params.workspaceId),
    });
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });

    const views = await db.select()
      .from(workspacePipelineViewsTable)
      .where(eq(workspacePipelineViewsTable.workspaceId, req.params.workspaceId))
      .orderBy(asc(workspacePipelineViewsTable.sortOrder));

    res.json({ views });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.put("/:workspaceId/pipeline-views/:viewId", async (req, res) => {
  try {
    const { isEnabled, isDefault, sortOrder, visibilityScope } = req.body;
    const admin = req.platformAdmin!;
    const platformSupportAction = isPlatformSupportOverride(req);

    const existing = await db.query.workspacePipelineViewsTable.findFirst({
      where: and(
        eq(workspacePipelineViewsTable.id, req.params.viewId),
        eq(workspacePipelineViewsTable.workspaceId, req.params.workspaceId)
      ),
    });
    if (!existing) return res.status(404).json({ error: "Pipeline view not found." });

    if (isDefault === true) {
      await db.update(workspacePipelineViewsTable)
        .set({ isDefault: false })
        .where(eq(workspacePipelineViewsTable.workspaceId, req.params.workspaceId));
    }

    const [view] = await db.update(workspacePipelineViewsTable)
      .set({
        isEnabled: isEnabled !== undefined ? isEnabled : existing.isEnabled,
        isDefault: isDefault !== undefined ? isDefault : existing.isDefault,
        sortOrder: sortOrder !== undefined ? sortOrder : existing.sortOrder,
        visibilityScope: visibilityScope !== undefined ? visibilityScope : existing.visibilityScope,
      })
      .where(eq(workspacePipelineViewsTable.id, req.params.viewId))
      .returning();

    await logAdminAction({
      workspaceId: req.params.workspaceId,
      changedByUserId: admin.id,
      action: "UPDATE_PIPELINE_VIEW",
      entityType: "workspace_pipeline_view",
      entityId: req.params.viewId,
      previousValue: { isEnabled: existing.isEnabled, isDefault: existing.isDefault, sortOrder: existing.sortOrder, visibilityScope: existing.visibilityScope },
      newValue: { isEnabled: view.isEnabled, isDefault: view.isDefault, sortOrder: view.sortOrder, visibilityScope: view.visibilityScope },
      platformSupportAction: platformSupportAction || true,
    });

    res.json({ view });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.put("/:workspaceId/pipeline-views/reorder", async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: "order must be an array." });

    await Promise.all(order.map((item: { id: string; sortOrder: number }) =>
      db.update(workspacePipelineViewsTable)
        .set({ sortOrder: item.sortOrder })
        .where(and(
          eq(workspacePipelineViewsTable.id, item.id),
          eq(workspacePipelineViewsTable.workspaceId, req.params.workspaceId)
        ))
    ));

    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/:workspaceId/members", async (req, res) => {
  try {
    const workspace = await db.query.workspacesTable.findFirst({
      where: eq(workspacesTable.id, req.params.workspaceId),
    });
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });

    const members = await db.select()
      .from(workspaceMembersTable)
      .where(eq(workspaceMembersTable.workspaceId, req.params.workspaceId));

    const result = await Promise.all(members.map(async (m) => {
      const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, m.userId) });
      return {
        ...m,
        user: user ? {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        } : null,
      };
    }));

    res.json({ members: result });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.delete("/:workspaceId/members/:userId", async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const admin = req.platformAdmin!;
    const platformSupportAction = isPlatformSupportOverride(req);

    const memberRecord = await db.query.workspaceMembersTable.findFirst({
      where: and(
        eq(workspaceMembersTable.workspaceId, workspaceId),
        eq(workspaceMembersTable.userId, userId)
      ),
    });

    if (!memberRecord) {
      return res.status(404).json({ error: "Member not found." });
    }

    const ADMIN_ROLES = ["OWNER", "ADMIN"];
    if (ADMIN_ROLES.includes(memberRecord.role)) {
      const admins = await db.query.workspaceMembersTable.findMany({
        where: and(
          eq(workspaceMembersTable.workspaceId, workspaceId),
          inArray(workspaceMembersTable.role, ["OWNER", "ADMIN"])
        ),
      });
      if (admins.length <= 1) {
        return res.status(400).json({ error: "Cannot remove the last workspace admin" });
      }
    }

    await db.delete(workspaceMembersTable).where(
      and(
        eq(workspaceMembersTable.workspaceId, workspaceId),
        eq(workspaceMembersTable.userId, userId)
      )
    );

    await logAdminAction({
      workspaceId,
      changedByUserId: admin.id,
      action: "DELETE_MEMBER",
      entityType: "workspace_member",
      entityId: memberRecord.id,
      previousValue: { userId, role: memberRecord.role },
      newValue: null,
      platformSupportAction,
    });

    return res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

router.put("/:workspaceId/members/:memberId/role", async (req, res) => {
  try {
    const { workspaceId, memberId } = req.params;
    const { role, notes } = req.body;
    const admin = req.platformAdmin!;
    const platformSupportAction = isPlatformSupportOverride(req);

    if (!role || !["OWNER", "ADMIN", "MEMBER"].includes(role)) {
      return res.status(400).json({ error: "Invalid role." });
    }

    const existing = await db.query.workspaceMembersTable.findFirst({
      where: and(
        eq(workspaceMembersTable.id, memberId),
        eq(workspaceMembersTable.workspaceId, workspaceId)
      ),
    });
    if (!existing) return res.status(404).json({ error: "Member not found." });

    const ADMIN_ROLES = ["OWNER", "ADMIN"];
    const isDowngrade = ADMIN_ROLES.includes(existing.role) && !ADMIN_ROLES.includes(role);

    if (isDowngrade) {
      const admins = await db.query.workspaceMembersTable.findMany({
        where: and(
          eq(workspaceMembersTable.workspaceId, workspaceId),
          inArray(workspaceMembersTable.role, ["OWNER", "ADMIN"])
        ),
      });
      if (admins.length <= 1) {
        return res.status(400).json({ error: "Cannot remove the last workspace admin." });
      }
    }

    const validRole = role as "OWNER" | "ADMIN" | "MEMBER";
    const [member] = await db.update(workspaceMembersTable)
      .set({ role: validRole })
      .where(eq(workspaceMembersTable.id, memberId))
      .returning();

    await logAdminAction({
      workspaceId,
      changedByUserId: admin.id,
      action: "UPDATE_MEMBER_ROLE",
      entityType: "workspace_member",
      entityId: memberId,
      previousValue: { role: existing.role },
      newValue: { role },
      platformSupportAction: platformSupportAction || true,
      notes: notes ?? undefined,
    });

    return res.json({ member });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─── GET /:workspaceId/health ─────────────────────────────────────────────────
router.get("/:workspaceId/health", async (req, res) => {
  try {
    const snapshot = await db
      .select()
      .from(workspaceHealthSnapshotsTable)
      .where(eq(workspaceHealthSnapshotsTable.workspaceId, req.params.workspaceId))
      .orderBy(desc(workspaceHealthSnapshotsTable.snapshotDate))
      .limit(1);

    return res.json({ snapshot: snapshot[0] ?? null });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─── POST /:workspaceId/health/snapshot ───────────────────────────────────────
router.post("/:workspaceId/health/snapshot", async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const workspace = await db.query.workspacesTable.findFirst({
      where: eq(workspacesTable.id, workspaceId),
    });
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });

    const checklistItems = await db
      .select()
      .from(workspaceLaunchChecklistTable)
      .where(eq(workspaceLaunchChecklistTable.workspaceId, workspaceId));

    const totalItems = checklistItems.length;
    const completedItems = checklistItems.filter((i) => i.status === "COMPLETED").length;
    const completenessPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    const getCount = async (table: string): Promise<number> => {
      const result = await db.execute<{ count: string }>(
        sql`SELECT COUNT(*) AS count FROM ${sql.identifier(table)} WHERE workspace_id = ${workspaceId}`
      );
      return parseInt(result.rows[0]?.count ?? "0");
    };

    const [contactCount, orgCount, oppCount, memberCount] = await Promise.all([
      getCount("contacts"),
      getCount("organizations"),
      getCount("opportunities"),
      getCount("workspace_members"),
    ]);

    const missingDataFlags: string[] = [];
    if (contactCount === 0) missingDataFlags.push("NO_CONTACTS");
    if (orgCount === 0) missingDataFlags.push("NO_ORGANIZATIONS");
    if (oppCount === 0) missingDataFlags.push("NO_OPPORTUNITIES");

    const [snapshot] = await db.insert(workspaceHealthSnapshotsTable).values({
      workspaceId,
      setupCompletenessPct: completenessPct,
      activeUserCount: memberCount,
      contactCount,
      orgCount,
      opportunityCount: oppCount,
      missingDataFlags,
      grokImprovementSuggestions: [],
    }).returning();

    return res.status(201).json({ snapshot });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─── GET /:workspaceId/checklist ──────────────────────────────────────────────
router.get("/:workspaceId/checklist", async (req, res) => {
  try {
    const items = await db
      .select()
      .from(workspaceLaunchChecklistTable)
      .where(eq(workspaceLaunchChecklistTable.workspaceId, req.params.workspaceId))
      .orderBy(workspaceLaunchChecklistTable.createdAt);

    return res.json({ items });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─── PATCH /:workspaceId/checklist/:key ───────────────────────────────────────
router.patch("/:workspaceId/checklist/:key", async (req, res) => {
  try {
    const { workspaceId, key } = req.params;
    const { status } = req.body as { status?: string };

    const VALID_STATUSES = ["PENDING", "COMPLETED", "SKIPPED"] as const;
    if (!status || !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return res.status(400).json({ error: "Invalid status. Must be PENDING, COMPLETED, or SKIPPED" });
    }

    const existing = await db.query.workspaceLaunchChecklistTable.findFirst({
      where: and(
        eq(workspaceLaunchChecklistTable.workspaceId, workspaceId),
        eq(workspaceLaunchChecklistTable.itemKey, key)
      ),
    });
    if (!existing) return res.status(404).json({ error: "Checklist item not found." });

    const [updated] = await db
      .update(workspaceLaunchChecklistTable)
      .set({
        status: status as typeof VALID_STATUSES[number],
        completedAt: status === "COMPLETED" ? new Date() : null,
        completedByUserId: status === "COMPLETED" ? req.platformAdmin!.id : null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(workspaceLaunchChecklistTable.workspaceId, workspaceId),
        eq(workspaceLaunchChecklistTable.itemKey, key)
      ))
      .returning();

    return res.json({ item: updated });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/:workspaceId/audit-log", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const limit = Math.min(parseInt(String(req.query.limit || "100"), 10), 200);
    const offset = parseInt(String(req.query.offset || "0"), 10);

    const workspace = await db.query.workspacesTable.findFirst({
      where: eq(workspacesTable.id, workspaceId),
    });
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });

    const entries = await db.query.workspaceAdminAuditLogTable.findMany({
      where: eq(workspaceAdminAuditLogTable.workspaceId, workspaceId),
      orderBy: [desc(workspaceAdminAuditLogTable.changedAt)],
      limit,
      offset,
    });

    const result = await Promise.all(entries.map(async (e) => {
      let changedByName = "Unknown";
      if (e.changedByUserId) {
        const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, e.changedByUserId) });
        if (user) {
          changedByName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
        }
      }
      return { ...e, changedByName };
    }));

    return res.json({ entries: result });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

export default router;

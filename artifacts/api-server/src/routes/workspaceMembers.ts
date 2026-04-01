import { Router } from "express";
import { db } from "@workspace/db";
import { workspaceMembersTable, workspaceAdminAuditLogTable } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { logAdminAction } from "../lib/logAdminAction";

const router = Router();

const ADMIN_ROLES = ["OWNER", "ADMIN"] as const;

async function countWorkspaceAdmins(workspaceId: string): Promise<number> {
  const admins = await db.query.workspaceMembersTable.findMany({
    where: and(
      eq(workspaceMembersTable.workspaceId, workspaceId),
      inArray(workspaceMembersTable.role, ["OWNER", "ADMIN"])
    ),
  });
  return admins.length;
}

router.delete("/:workspaceId/members/:userId", async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const requestingUser = req.authUser!;
    const requestingWorkspace = req.authWorkspace!;

    if (requestingWorkspace.id !== workspaceId) {
      return res.status(403).json({ error: "Wrong auth context" });
    }

    const memberRecord = await db.query.workspaceMembersTable.findFirst({
      where: and(
        eq(workspaceMembersTable.workspaceId, workspaceId),
        eq(workspaceMembersTable.userId, userId)
      ),
    });

    if (!memberRecord) {
      return res.status(404).json({ error: "Member not found." });
    }

    if (ADMIN_ROLES.includes(memberRecord.role as any)) {
      const adminCount = await countWorkspaceAdmins(workspaceId);
      if (adminCount <= 1) {
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
      changedByUserId: requestingUser.id,
      action: "DELETE_MEMBER",
      entityType: "workspace_member",
      entityId: memberRecord.id,
      previousValue: { userId, role: memberRecord.role },
      newValue: null,
      platformSupportAction: false,
    });

    return res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

router.put("/:workspaceId/members/:userId", async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const { role } = req.body;
    const requestingUser = req.authUser!;
    const requestingWorkspace = req.authWorkspace!;

    if (requestingWorkspace.id !== workspaceId) {
      return res.status(403).json({ error: "Wrong auth context" });
    }

    if (!role || !["OWNER", "ADMIN", "MEMBER"].includes(role)) {
      return res.status(400).json({ error: "Invalid role." });
    }

    const memberRecord = await db.query.workspaceMembersTable.findFirst({
      where: and(
        eq(workspaceMembersTable.workspaceId, workspaceId),
        eq(workspaceMembersTable.userId, userId)
      ),
    });

    if (!memberRecord) {
      return res.status(404).json({ error: "Member not found." });
    }

    const isDowngrade =
      ADMIN_ROLES.includes(memberRecord.role as any) &&
      !ADMIN_ROLES.includes(role as any);

    if (isDowngrade) {
      const adminCount = await countWorkspaceAdmins(workspaceId);
      if (adminCount <= 1) {
        return res.status(400).json({ error: "Cannot remove the last workspace admin" });
      }
    }

    await db.update(workspaceMembersTable)
      .set({ role })
      .where(
        and(
          eq(workspaceMembersTable.workspaceId, workspaceId),
          eq(workspaceMembersTable.userId, userId)
        )
      );

    await logAdminAction({
      workspaceId,
      changedByUserId: requestingUser.id,
      action: "UPDATE_MEMBER_ROLE",
      entityType: "workspace_member",
      entityId: memberRecord.id,
      previousValue: { userId, role: memberRecord.role },
      newValue: { userId, role },
      platformSupportAction: false,
    });

    return res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/:workspaceId/audit-log", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const requestingWorkspace = req.authWorkspace!;

    if (requestingWorkspace.id !== workspaceId) {
      return res.status(403).json({ error: "Wrong auth context" });
    }

    const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 200);
    const offset = parseInt(String(req.query.offset || "0"), 10);

    const entries = await db.query.workspaceAdminAuditLogTable.findMany({
      where: eq(workspaceAdminAuditLogTable.workspaceId, workspaceId),
      orderBy: [desc(workspaceAdminAuditLogTable.changedAt)],
      limit,
      offset,
    });

    const safeEntries = entries.map((e) => ({
      id: e.id,
      workspaceId: e.workspaceId,
      changedByUserId: e.changedByUserId,
      changedAt: e.changedAt,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      newValue: e.newValue,
    }));

    return res.json({ entries: safeEntries });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

export default router;

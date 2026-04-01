import { Router } from "express";
import { db } from "@workspace/db";
import { workspaceAdminAuditLogTable, workspaceMembersTable, workspacesTable } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { platformAdminMiddleware } from "../lib/platformAdminMiddleware";
import { logAdminAction } from "../lib/logAdminAction";

const router = Router();

router.use(platformAdminMiddleware);

const PLATFORM_SUPPORT_HEADER = "x-platform-support";

function isPlatformSupportOverride(req: import("express").Request): boolean {
  return req.headers[PLATFORM_SUPPORT_HEADER] === "true";
}

router.get("/:workspaceId/audit-log", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 200);
    const offset = parseInt(String(req.query.offset || "0"), 10);

    const entries = await db.query.workspaceAdminAuditLogTable.findMany({
      where: eq(workspaceAdminAuditLogTable.workspaceId, workspaceId),
      orderBy: [desc(workspaceAdminAuditLogTable.changedAt)],
      limit,
      offset,
    });

    return res.json({ entries });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/:workspaceId/members", async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const members = await db.query.workspaceMembersTable.findMany({
      where: eq(workspaceMembersTable.workspaceId, workspaceId),
    });

    return res.json({ members });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

router.delete("/:workspaceId/members/:userId", async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const admin = req.platformAdmin!;
    const platformSupportAction = isPlatformSupportOverride(req);

    if (platformSupportAction) {
      req.log.info({ adminId: admin.id, workspaceId, userId }, "Platform support override: DELETE member");
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

router.put("/:workspaceId/members/:userId", async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const { role, notes } = req.body;
    const admin = req.platformAdmin!;
    const platformSupportAction = isPlatformSupportOverride(req);

    if (platformSupportAction) {
      req.log.info({ adminId: admin.id, workspaceId, userId, role }, "Platform support override: UPDATE member role");
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

    const ADMIN_ROLES = ["OWNER", "ADMIN"];
    const isDowngrade =
      ADMIN_ROLES.includes(memberRecord.role) && !ADMIN_ROLES.includes(role);

    if (isDowngrade) {
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
      changedByUserId: admin.id,
      action: "UPDATE_MEMBER_ROLE",
      entityType: "workspace_member",
      entityId: memberRecord.id,
      previousValue: { userId, role: memberRecord.role },
      newValue: { userId, role },
      platformSupportAction,
      notes: notes ?? undefined,
    });

    return res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

export default router;

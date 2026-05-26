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
import { sendWorkspaceInvite, type InviteRole } from "../lib/sendWorkspaceInvite";

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
        // isPending=true means the user has never set a password (invite not yet accepted).
        isPending: !user?.passwordHash,
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

// ─── POST /:workspaceId/members/invite ───────────────────────────────────────
// Platform-admin path for inviting a new ADMIN or MANAGER into a workspace
// that has *already* been provisioned. Mirrors the onboarding-time invite
// flow: find-or-create the user, attach a workspace_members row, and emit a
// durable INVITE_SENT audit row + best-effort Resend email via the shared
// sendWorkspaceInvite helper.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.post("/:workspaceId/members/invite", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const admin = req.platformAdmin!;
    const platformSupportAction = isPlatformSupportOverride(req);

    const { email, role, name } = (req.body ?? {}) as {
      email?: string;
      role?: string;
      name?: string;
    };
    const emailLower = (email ?? "").trim().toLowerCase();
    if (!emailLower || !EMAIL_RE.test(emailLower)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }
    if (role !== "ADMIN" && role !== "MANAGER") {
      return res.status(400).json({ error: "Role must be ADMIN or MANAGER." });
    }

    const workspace = await db.query.workspacesTable.findFirst({
      where: eq(workspacesTable.id, workspaceId),
    });
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });

    // Find-or-create the invited user (no password — they will set one via
    // /auth/accept-invite). We never overwrite an existing user's profile.
    let user = await db.query.usersTable.findFirst({
      where: eq(usersTable.email, emailLower),
    });
    if (!user) {
      const [created] = await db.insert(usersTable).values({
        email: emailLower,
        firstName: name?.trim() || null,
        lastName: null,
        passwordHash: null,
      }).returning();
      user = created;
    }

    // Reject if the user is already a member of this workspace.
    const existingMembership = await db.query.workspaceMembersTable.findFirst({
      where: and(
        eq(workspaceMembersTable.workspaceId, workspaceId),
        eq(workspaceMembersTable.userId, user.id),
      ),
    });
    if (existingMembership) {
      return res.status(409).json({
        error: `${emailLower} is already a ${existingMembership.role} of this workspace.`,
      });
    }

    // Create the membership + INVITE_MEMBER audit row atomically so a failure
    // mid-flight cannot wedge the user into the "already a member, but no
    // invite issued" state. The Resend dispatch in sendWorkspaceInvite is
    // best-effort and runs *outside* the txn (Resend latency must not hold
    // an open transaction), so any send failure is captured in the
    // INVITE_SENT row's deliveryStatus rather than rolling back membership.
    let member: typeof workspaceMembersTable.$inferSelect;
    try {
      member = await db.transaction(async (tx) => {
        const [m] = await tx.insert(workspaceMembersTable).values({
          workspaceId,
          userId: user!.id,
          role: role as "ADMIN" | "MANAGER",
        }).returning();
        await tx.insert(workspaceAdminAuditLogTable).values({
          workspaceId,
          changedByUserId: admin.id,
          action: "INVITE_MEMBER",
          entityType: "workspace_member",
          entityId: m.id,
          previousValue: null,
          newValue: { userId: user!.id, email: emailLower, role },
          platformSupportAction,
          notes: null,
        });
        return m;
      });
    } catch (e) {
      req.log.error({ err: e }, "Failed to create workspace membership");
      return res.status(500).json({ error: "Failed to create workspace membership." });
    }

    const invite = await sendWorkspaceInvite({
      workspaceId,
      email: emailLower,
      role: role as InviteRole,
      name: name ?? null,
      changedByUserId: admin.id,
      userIdOverride: user.id,
      platformSupportAction,
      notes: `Post-provision invite for ${role} role`,
    });

    await logAdminAction({
      workspaceId,
      changedByUserId: admin.id,
      action: "INVITE_SENT",
      entityType: "workspace_member",
      entityId: member.id,
      newValue: { userId: user.id, email: emailLower, role, deliveryStatus: invite.deliveryStatus },
      platformSupportAction,
      notes: `Post-provision invite for ${role} role`,
    });

    return res.json({
      member,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      invite: {
        deliveryStatus: invite.deliveryStatus,
        deliveryError: invite.deliveryError,
        expiresAt: invite.expiresAt,
        // The URL is only returned to the platform admin so they can hand-
        // share it if email delivery is queued/failed.
        inviteUrl: invite.inviteUrl,
      },
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─── POST /:workspaceId/members/:userId/resend-invite ────────────────────────
// Re-issues an invite token + email for a member who hasn't accepted yet.
// The member row must already exist; only works when isPending=true.
router.post("/:workspaceId/members/:userId/resend-invite", async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const admin = req.platformAdmin!;
    const platformSupportAction = isPlatformSupportOverride(req);

    const membership = await db.query.workspaceMembersTable.findFirst({
      where: and(
        eq(workspaceMembersTable.workspaceId, workspaceId),
        eq(workspaceMembersTable.userId, userId),
      ),
    });
    if (!membership) return res.status(404).json({ error: "Member not found." });

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });
    if (!user) return res.status(404).json({ error: "User not found." });

    if (user.passwordHash) {
      return res.status(409).json({
        error: "This user has already accepted their invite. Use password reset instead.",
      });
    }

    const role = membership.role as "ADMIN" | "MANAGER" | "MEMBER";
    const inviteRole = (role === "ADMIN" || role === "MANAGER") ? role : "MANAGER";

    const invite = await sendWorkspaceInvite({
      workspaceId,
      email: user.email,
      role: inviteRole as import("../lib/sendWorkspaceInvite").InviteRole,
      name: user.firstName ?? null,
      changedByUserId: admin.id,
      userIdOverride: user.id,
      platformSupportAction,
      notes: `Resent invite for ${role} role`,
    });

    await logAdminAction({
      workspaceId,
      changedByUserId: admin.id,
      action: "INVITE_RESENT",
      entityType: "workspace_member",
      entityId: membership.id,
      newValue: { userId, email: user.email, deliveryStatus: invite.deliveryStatus },
      platformSupportAction,
    });

    return res.json({
      deliveryStatus: invite.deliveryStatus,
      deliveryError: invite.deliveryError,
      inviteUrl: invite.inviteUrl,
      expiresAt: invite.expiresAt,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ─── POST /:workspaceId/members/:userId/password-reset ───────────────────────
// Sends a password-reset link to an active member (one who has already set a
// password). Reuses the INVITE_SENT / accept-invite token flow so the same
// mobile screen handles both invite acceptance and password resets.
router.post("/:workspaceId/members/:userId/password-reset", async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const admin = req.platformAdmin!;
    const platformSupportAction = isPlatformSupportOverride(req);

    const membership = await db.query.workspaceMembersTable.findFirst({
      where: and(
        eq(workspaceMembersTable.workspaceId, workspaceId),
        eq(workspaceMembersTable.userId, userId),
      ),
    });
    if (!membership) return res.status(404).json({ error: "Member not found." });

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });
    if (!user) return res.status(404).json({ error: "User not found." });

    if (!user.passwordHash) {
      return res.status(409).json({
        error: "This user hasn't accepted their invite yet. Use resend invite instead.",
      });
    }

    const role = membership.role as "ADMIN" | "MANAGER" | "MEMBER";
    const inviteRole = (role === "ADMIN" || role === "MANAGER") ? role : "MANAGER";

    const invite = await sendWorkspaceInvite({
      workspaceId,
      email: user.email,
      role: inviteRole as import("../lib/sendWorkspaceInvite").InviteRole,
      name: user.firstName ?? null,
      changedByUserId: admin.id,
      userIdOverride: user.id,
      platformSupportAction,
      notes: `Password reset for ${role}`,
    });

    await logAdminAction({
      workspaceId,
      changedByUserId: admin.id,
      action: "PASSWORD_RESET_SENT",
      entityType: "workspace_member",
      entityId: membership.id,
      newValue: { userId, email: user.email, deliveryStatus: invite.deliveryStatus },
      platformSupportAction,
    });

    return res.json({
      deliveryStatus: invite.deliveryStatus,
      deliveryError: invite.deliveryError,
      inviteUrl: invite.inviteUrl,
      expiresAt: invite.expiresAt,
    });
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

    if (!role || !["OWNER", "ADMIN", "MANAGER", "MEMBER"].includes(role)) {
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

    const validRole = role as "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
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
// P2.4: Enhanced with industryFocus for richer vertical-aware welcome data in launch screen
router.get("/:workspaceId/checklist", async (req, res) => {
  try {
    const [workspace, rawItems] = await Promise.all([
      db.query.workspacesTable.findFirst({
        where: eq(workspacesTable.id, req.params.workspaceId),
        columns: { id: true, name: true, industryFocus: true },  // P2.4: richer data for vertical personalization
      }),
      db
        .select()
        .from(workspaceLaunchChecklistTable)
        .where(eq(workspaceLaunchChecklistTable.workspaceId, req.params.workspaceId))
        .orderBy(workspaceLaunchChecklistTable.createdAt),
    ]);

    const items = rawItems.map(i => ({
      ...i,
      completedByUserEmail: null as string | null,
    }));

    const workspaceMeta = workspace
      ? { id: workspace.id, name: workspace.name, industryFocus: workspace.industryFocus ?? null, clientType: null as string | null }
      : null;

    return res.json({ items, workspace: workspaceMeta });
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

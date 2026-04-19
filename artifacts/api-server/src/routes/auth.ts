import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, workspacesTable, workspaceMembersTable, subscriptionsTable, plansTable, workspaceAdminAuditLogTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { signToken, hashPassword, comparePassword, verifyToken, extractToken } from "../lib/auth";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email.toLowerCase().trim()) });
    if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid email or password." });

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password." });

    // Try owner lookup first, then fall back to workspace_members (for non-owner admins/members)
    let workspace = await db.query.workspacesTable.findFirst({ where: eq(workspacesTable.ownerUserId, user.id) });
    if (!workspace) {
      const [memberWorkspace] = await db
        .select({ id: workspacesTable.id, name: workspacesTable.name, industryFocus: workspacesTable.industryFocus, ownerUserId: workspacesTable.ownerUserId, createdAt: workspacesTable.createdAt, updatedAt: workspacesTable.updatedAt })
        .from(workspaceMembersTable)
        .innerJoin(workspacesTable, eq(workspaceMembersTable.workspaceId, workspacesTable.id))
        .where(eq(workspaceMembersTable.userId, user.id))
        .limit(1);
      workspace = memberWorkspace ?? null;
    }
    if (!workspace) return res.status(400).json({ error: "No workspace found for this account." });

    const token = signToken({ userId: user.id, workspaceId: workspace.id, email: user.email }, !!rememberMe);

    const subscription = await db.select({ plan: plansTable })
      .from(subscriptionsTable)
      .leftJoin(plansTable, eq(subscriptionsTable.planId, plansTable.id))
      .where(and(eq(subscriptionsTable.workspaceId, workspace.id), eq(subscriptionsTable.status, "active")))
      .limit(1);

    res.json({
      token,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      workspace: { id: workspace.id, name: workspace.name, industryFocus: workspace.industryFocus },
      plan: subscription[0]?.plan || null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/signup", async (req, res) => {
  try {
    const { email, password, firstName, lastName, workspaceName } = req.body;
    if (!email || !password || !firstName || !workspaceName)
      return res.status(400).json({ error: "Email, password, first name, and workspace name are required." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email.toLowerCase().trim()) });
    if (existing) return res.status(409).json({ error: "An account with this email already exists." });

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      email: email.toLowerCase().trim(), firstName, lastName, passwordHash,
    }).returning();

    const [workspace] = await db.insert(workspacesTable).values({
      name: workspaceName, ownerUserId: user.id, industryFocus: "Healthcare & Government Contracting",
    }).returning();

    await db.insert(workspaceMembersTable).values({ workspaceId: workspace.id, userId: user.id, role: "OWNER" });

    const [plan] = await db.select().from(plansTable).where(eq(plansTable.slug, "independent")).limit(1);
    if (plan) {
      await db.insert(subscriptionsTable).values({ workspaceId: workspace.id, planId: plan.id, status: "active" });
    }

    const token = signToken({ userId: user.id, workspaceId: workspace.id, email: user.email }, false);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      workspace: { id: workspace.id, name: workspace.name, industryFocus: workspace.industryFocus },
      plan: plan || null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/me", async (req, res) => {
  try {
    const token = extractToken(req as any);
    if (!token) return res.status(401).json({ error: "Not authenticated." });

    const payload = verifyToken(token);
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, payload.userId) });
    if (!user) return res.status(401).json({ error: "User not found." });

    const workspace = await db.query.workspacesTable.findFirst({ where: eq(workspacesTable.id, payload.workspaceId) });
    if (!workspace) return res.status(401).json({ error: "Workspace not found." });

    const membership = await db.query.workspaceMembersTable.findFirst({
      where: and(eq(workspaceMembersTable.workspaceId, workspace.id), eq(workspaceMembersTable.userId, user.id)),
    });

    const subscription = await db.select({ plan: plansTable })
      .from(subscriptionsTable)
      .leftJoin(plansTable, eq(subscriptionsTable.planId, plansTable.id))
      .where(and(eq(subscriptionsTable.workspaceId, workspace.id), eq(subscriptionsTable.status, "active")))
      .limit(1);

    res.json({
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      workspace: { id: workspace.id, name: workspace.name, industryFocus: workspace.industryFocus },
      role: membership?.role || "MEMBER",
      plan: subscription[0]?.plan || null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(401).json({ error: "Invalid or expired session." });
  }
});

router.post("/change-password", async (req, res) => {
  try {
    const token = extractToken(req as any);
    if (!token) return res.status(401).json({ error: "Not authenticated." });

    const payload = verifyToken(token);
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Current and new password required." });
    if (newPassword.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters." });

    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, payload.userId) });
    if (!user || !user.passwordHash) return res.status(401).json({ error: "User not found." });

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect." });

    const passwordHash = await hashPassword(newPassword);
    await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/forgot-password", async (req, res) => {
  res.json({ message: "If an account with that email exists, a reset link will be sent shortly." });
});

// ─── POST /auth/accept-invite ────────────────────────────────────────────────
// Validates an onboarding invite token (issued by SEND_INVITE_EMAILS), sets
// the new user's password, and returns a JWT scoped to their workspace.
router.post("/accept-invite", async (req, res) => {
  try {
    const { token, password } = req.body ?? {};
    if (typeof token !== "string" || token.length < 16) {
      return res.status(400).json({ error: "Invite token is required." });
    }
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    // Atomically consume the token: a single conditional UPDATE that swaps
    // the inviteToken field for a sentinel and returns the prior row. If zero
    // rows are returned, the token was missing or already used — concurrent
    // callers cannot both win this race.
    type InviteNewValue = {
      email?: string;
      role?: string;
      expiresAt?: string;
      userId?: string | null;
    };
    type ConsumedRow = {
      id: string;
      workspace_id: string;
      new_value: InviteNewValue;
    };
    const consumed = await db.execute<ConsumedRow>(sql`
      UPDATE workspace_admin_audit_log
         SET new_value = jsonb_set(new_value, '{inviteToken}',
                                   to_jsonb(('consumed:' || left(${token}, 8))::text))
       WHERE action = 'INVITE_SENT'
         AND entity_type = 'workspace_invite'
         AND new_value->>'inviteToken' = ${token}
      RETURNING id, workspace_id, new_value
    `);
    const row = consumed.rows[0];
    if (!row) {
      return res.status(404).json({ error: "Invite token not found or already used." });
    }

    const match = { id: row.id, workspaceId: row.workspace_id, newValue: row.new_value };
    const v: InviteNewValue = match.newValue;
    if (v.expiresAt && new Date(v.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ error: "Invite has expired. Please ask the platform admin to re-send." });
    }

    const email = (v.email ?? "").toLowerCase();
    if (!email) return res.status(400).json({ error: "Invite is missing an email." });

    let user = v.userId
      ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, v.userId) })
      : null;
    if (!user) {
      user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
    }
    if (!user) return res.status(404).json({ error: "Invited user account not found." });

    const passwordHash = await hashPassword(password);
    await db.update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    // Token already consumed atomically above. Append an INVITE_ACCEPTED row
    // for audit completeness.
    await db.insert(workspaceAdminAuditLogTable).values({
      workspaceId: match.workspaceId,
      changedByUserId: user.id,
      action: "INVITE_ACCEPTED",
      entityType: "workspace_invite",
      entityId: email,
      previousValue: { inviteToken: token },
      newValue: { email, userId: user.id, role: v.role ?? null },
    });

    const workspace = await db.query.workspacesTable.findFirst({
      where: eq(workspacesTable.id, match.workspaceId),
    });
    if (!workspace) return res.status(404).json({ error: "Workspace not found." });

    const jwt = signToken({ userId: user.id, workspaceId: workspace.id, email: user.email }, false);
    return res.json({
      token: jwt,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      workspace: { id: workspace.id, name: workspace.name, industryFocus: workspace.industryFocus },
      role: v.role ?? "MEMBER",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, workspacesTable, workspaceMembersTable, subscriptionsTable, plansTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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

export default router;

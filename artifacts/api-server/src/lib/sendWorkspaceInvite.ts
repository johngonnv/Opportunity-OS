import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  workspacesTable,
  workspaceAdminAuditLogTable,
} from "@workspace/db";
import { getResendClient } from "./resendClient";

export type InviteRole = "ADMIN" | "MANAGER";

export interface SendWorkspaceInviteParams {
  workspaceId: string;
  email: string;
  role: InviteRole;
  name?: string | null;
  changedByUserId: string | null;
  sessionId?: string | null;
  userIdOverride?: string | null;
  platformSupportAction?: boolean;
  notes?: string | null;
}

export interface SendWorkspaceInviteResult {
  token: string;
  inviteUrl: string;
  expiresAt: string;
  deliveryStatus: "delivered" | "queued" | "failed";
  deliveryError: string | null;
  userId: string | null;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getInviteBaseUrl(): string {
  // Prefer explicit env overrides, then fall back to the Replit dev domain
  // so invites work out-of-the-box in development without manual config.
  if (process.env.INVITE_BASE_URL) return process.env.INVITE_BASE_URL;
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL;
  // REPLIT_EXPO_DEV_DOMAIN gives direct access to the Expo web server with no
  // /mobile path prefix — Expo Router then sees /accept-invite correctly.
  if (process.env.REPLIT_EXPO_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
  }
  // Fallback: shared proxy domain with /mobile prefix (routing may not work on web)
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/mobile`;
  }
  return "https://app.opportunity-os.local";
}

export async function sendWorkspaceInvite(
  params: SendWorkspaceInviteParams,
): Promise<SendWorkspaceInviteResult> {
  const email = params.email.trim().toLowerCase();
  const baseUrl = getInviteBaseUrl();

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const inviteUrl = `${baseUrl.replace(/\/$/, "")}/accept-invite?token=${token}`;

  const [userRow, workspace] = await Promise.all([
    params.userIdOverride
      ? db.query.usersTable.findFirst({ where: eq(usersTable.id, params.userIdOverride) })
      : db.query.usersTable.findFirst({ where: eq(usersTable.email, email) }),
    db.query.workspacesTable.findFirst({ where: eq(workspacesTable.id, params.workspaceId) }),
  ]);
  const workspaceName = workspace?.name ?? "your new workspace";

  let deliveryStatus: "delivered" | "queued" | "failed" = "queued";
  let deliveryError: string | null = null;

  // Use the Replit-managed Resend connector (credentials fetched fresh each time).
  const resend = await getResendClient();
  if (resend) {
    try {
      const { error } = await resend.client.emails.send({
        from: resend.fromEmail,
        to: email,
        subject: `You've been invited to ${workspaceName}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#1a1a2e;margin-bottom:8px">You're invited to ${workspaceName}</h2>
            <p style="color:#444;margin-bottom:16px">
              Hi${params.name ? ` ${params.name}` : ""},
            </p>
            <p style="color:#444;margin-bottom:24px">
              You've been added as a${params.role === "ADMIN" ? "n <strong>Admin</strong>" : " <strong>Manager</strong>"}
              on <strong>${workspaceName}</strong> in Opportunity OS.
              Click the button below to set your password and sign in.
            </p>
            <a href="${inviteUrl}"
               style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;
                      padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px">
              Accept invite
            </a>
            <p style="color:#888;font-size:12px;margin-top:24px">
              This link expires in 7 days. If you didn't expect this email, you can ignore it.
            </p>
          </div>
        `,
      });
      if (error) {
        deliveryStatus = "failed";
        deliveryError = error.message ?? JSON.stringify(error);
      } else {
        deliveryStatus = "delivered";
      }
    } catch (e) {
      deliveryStatus = "failed";
      deliveryError = e instanceof Error ? e.message : String(e);
    }
  }

  await db.insert(workspaceAdminAuditLogTable).values({
    workspaceId: params.workspaceId,
    changedByUserId: params.changedByUserId,
    action: "INVITE_SENT",
    entityType: "workspace_invite",
    entityId: email,
    newValue: {
      email,
      role: params.role,
      userId: userRow?.id ?? null,
      inviteToken: token,
      inviteUrl,
      expiresAt,
      sessionId: params.sessionId ?? null,
      deliveryStatus,
      deliveryError,
    },
    platformSupportAction: params.platformSupportAction ?? false,
    notes: params.notes ?? `Workspace invite for ${params.role} role (${deliveryStatus})`,
  });

  return {
    token,
    inviteUrl,
    expiresAt,
    deliveryStatus,
    deliveryError,
    userId: userRow?.id ?? null,
  };
}

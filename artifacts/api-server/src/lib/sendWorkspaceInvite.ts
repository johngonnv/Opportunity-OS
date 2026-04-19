import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  workspacesTable,
  workspaceAdminAuditLogTable,
} from "@workspace/db";

export type InviteRole = "ADMIN" | "MANAGER";

export interface SendWorkspaceInviteParams {
  workspaceId: string;
  email: string;
  role: InviteRole;
  name?: string | null;
  changedByUserId: string | null;
  // Optional metadata to thread back to the originating onboarding session.
  sessionId?: string | null;
  // Optional override; defaults to whatever user already exists for `email`.
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

// Centralizes the "issue an invite" pattern used by onboarding provisioning
// and by the platform-admin Members tab. Generates a one-time invite token,
// writes a durable INVITE_SENT row to the audit-log outbox, and (best-effort)
// dispatches a branded HTML email via Resend when RESEND_API_KEY is set.
export async function sendWorkspaceInvite(
  params: SendWorkspaceInviteParams,
): Promise<SendWorkspaceInviteResult> {
  const email = params.email.trim().toLowerCase();
  const baseUrl =
    process.env.INVITE_BASE_URL ??
    process.env.PUBLIC_APP_URL ??
    "https://app.opportunity-os.local";
  const fromAddress =
    process.env.INVITE_FROM_EMAIL ??
    "Opportunity OS <onboarding@opportunity-os.local>";

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const inviteUrl = `${baseUrl.replace(/\/$/, "")}/accept-invite?token=${token}`;

  const userRow = params.userIdOverride
    ? await db.query.usersTable.findFirst({
        where: eq(usersTable.id, params.userIdOverride),
      })
    : await db.query.usersTable.findFirst({
        where: eq(usersTable.email, email),
      });

  const workspace = await db.query.workspacesTable.findFirst({
    where: eq(workspacesTable.id, params.workspaceId),
  });
  const workspaceName = workspace?.name ?? "your new workspace";

  let deliveryStatus: "delivered" | "queued" | "failed" = "queued";
  let deliveryError: string | null = null;
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: email,
          subject: `You've been invited to ${workspaceName}`,
          html: `
            <p>Hi${params.name ? ` ${params.name}` : ""},</p>
            <p>You've been added as a${
              params.role === "ADMIN" ? "n Admin" : " Manager"
            } on <strong>${workspaceName}</strong> in Opportunity OS.</p>
            <p>Click the link below to set your password and sign in:</p>
            <p><a href="${inviteUrl}">${inviteUrl}</a></p>
            <p>This link expires in 7 days.</p>
          `,
        }),
      });
      if (resp.ok) {
        deliveryStatus = "delivered";
      } else {
        deliveryStatus = "failed";
        deliveryError = `Resend ${resp.status}`;
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

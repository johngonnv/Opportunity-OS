import { db } from "@workspace/db";
import { workspaceAdminAuditLogTable } from "@workspace/db";

export interface LogAdminActionParams {
  workspaceId: string;
  changedByUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  platformSupportAction?: boolean;
  notes?: string;
}

export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
  await db.insert(workspaceAdminAuditLogTable).values({
    workspaceId: params.workspaceId,
    changedByUserId: params.changedByUserId ?? null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    previousValue: params.previousValue !== undefined ? params.previousValue : null,
    newValue: params.newValue !== undefined ? params.newValue : null,
    platformSupportAction: params.platformSupportAction ?? false,
    notes: params.notes ?? null,
  });
}

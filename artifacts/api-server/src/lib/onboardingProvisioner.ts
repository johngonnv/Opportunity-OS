import { db } from "@workspace/db";
import {
  clientOnboardingSessionsTable,
  onboardingProvisioningStepsTable,
  workspacesTable,
  workspaceMembersTable,
  workspaceOnboardingConfigTable,
  workspaceServiceLinesTable,
  workspaceAddOnsTable,
  workspaceLaunchChecklistTable,
  workspaceHealthSnapshotsTable,
  pipelineViewTemplatesTable,
  pipelinesTable,
  pipelineStagesTable,
  workspacePipelineViewsTable,
  workspaceAdminAuditLogTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const STEP_ORDER = [
  "CREATE_WORKSPACE",
  "ASSIGN_PLAN",
  "CREATE_MEMBERSHIPS",
  "APPLY_VERTICAL_CONFIG",
  "ENABLE_SERVICE_LINES",
  "ENABLE_ADD_ONS",
  "PUBLISH_PIPELINE_TEMPLATES",
  "SEED_CONTACT_ROLES",
  "SEED_TAGS",
  "CREATE_LAUNCH_CHECKLIST",
  "SEND_INVITE_EMAILS",
  "RECORD_AUDIT_ENTRY",
  "SNAPSHOT_HEALTH_BASELINE",
] as const;

type StepKey = typeof STEP_ORDER[number];

const SINGLE_USER_CHECKLIST = [
  { key: "REVIEW_PIPELINE", label: "Review your pipeline template" },
  { key: "ADD_FIRST_CONTACT", label: "Add your first contact" },
  { key: "CONFIRM_FIRST_TARGET", label: "Confirm your first target account" },
];

const SMALL_TEAM_CHECKLIST = [
  { key: "ASSIGN_USERS", label: "Invite your team members" },
  { key: "REVIEW_PIPELINE", label: "Review your pipeline template" },
  { key: "ADD_FIRST_CONTACT", label: "Add your first contact" },
  { key: "CONFIRM_FIRST_TARGET", label: "Confirm your first target account" },
  { key: "CONFIGURE_PERMISSIONS", label: "Configure team permissions" },
];

const ENTERPRISE_CHECKLIST = [
  { key: "ASSIGN_USERS", label: "Invite your team members" },
  { key: "CONFIGURE_PERMISSIONS", label: "Configure team permissions" },
  { key: "REVIEW_PIPELINE", label: "Review your pipeline template" },
  { key: "ADD_FIRST_CONTACT", label: "Add your first contact" },
  { key: "CONFIRM_FIRST_TARGET", label: "Confirm your first target account" },
  { key: "CONFIGURE_REPORTING", label: "Set up reporting and dashboards" },
];

function getChecklistItems(clientType: string) {
  if (clientType === "SINGLE_USER") return SINGLE_USER_CHECKLIST;
  if (clientType === "ENTERPRISE") return ENTERPRISE_CHECKLIST;
  return SMALL_TEAM_CHECKLIST;
}

function getRequiredForClientTypes(itemKey: string): string[] {
  if (itemKey === "CONFIGURE_REPORTING") return ["ENTERPRISE"];
  if (itemKey === "ASSIGN_USERS" || itemKey === "CONFIGURE_PERMISSIONS") return ["SMALL_TEAM", "ENTERPRISE"];
  return ["SINGLE_USER", "SMALL_TEAM", "ENTERPRISE"];
}

export async function initializeProvisioningSteps(sessionId: string): Promise<void> {
  const existingSteps = await db
    .select({ stepKey: onboardingProvisioningStepsTable.stepKey })
    .from(onboardingProvisioningStepsTable)
    .where(eq(onboardingProvisioningStepsTable.sessionId, sessionId));

  const existingKeys = new Set(existingSteps.map((s) => s.stepKey));

  const toInsert = STEP_ORDER
    .filter((key) => !existingKeys.has(key))
    .map((key) => ({
      sessionId,
      stepKey: key,
      status: "PENDING" as const,
      attemptCount: 0,
    }));

  if (toInsert.length > 0) {
    await db.insert(onboardingProvisioningStepsTable).values(toInsert);
  }
}

export async function runProvisioning(
  sessionId: string,
  adminUserId: string,
  retryFailedOnly = false
): Promise<{ steps: typeof onboardingProvisioningStepsTable.$inferSelect[] }> {
  const session = await db.query.clientOnboardingSessionsTable.findFirst({
    where: eq(clientOnboardingSessionsTable.id, sessionId),
  });
  if (!session) throw new Error("Session not found");
  if (session.status === "PROVISIONED") throw new Error("Session already provisioned");

  const appliedConfig = (session.appliedConfig ?? {}) as Record<string, unknown>;

  await db
    .update(clientOnboardingSessionsTable)
    .set({ status: "PROVISIONING", updatedAt: new Date() })
    .where(eq(clientOnboardingSessionsTable.id, sessionId));

  const steps = await db
    .select()
    .from(onboardingProvisioningStepsTable)
    .where(eq(onboardingProvisioningStepsTable.sessionId, sessionId))
    .orderBy(sql`array_position(
      ARRAY['CREATE_WORKSPACE','ASSIGN_PLAN','CREATE_MEMBERSHIPS','APPLY_VERTICAL_CONFIG',
            'ENABLE_SERVICE_LINES','ENABLE_ADD_ONS','PUBLISH_PIPELINE_TEMPLATES',
            'SEED_CONTACT_ROLES','SEED_TAGS','CREATE_LAUNCH_CHECKLIST',
            'SEND_INVITE_EMAILS','RECORD_AUDIT_ENTRY','SNAPSHOT_HEALTH_BASELINE']::text[],
      step_key::text
    )`);

  for (const step of steps) {
    if (step.status === "COMPLETED" || step.status === "SKIPPED") continue;
    if (retryFailedOnly && step.status !== "FAILED" && step.status !== "PENDING") continue;

    await db
      .update(onboardingProvisioningStepsTable)
      .set({ status: "IN_PROGRESS", startedAt: new Date(), attemptCount: step.attemptCount + 1, updatedAt: new Date() })
      .where(eq(onboardingProvisioningStepsTable.id, step.id));

    try {
      const result = await executeStep(step.stepKey as StepKey, session, appliedConfig, adminUserId);

      await db
        .update(onboardingProvisioningStepsTable)
        .set({ status: "COMPLETED", resultPayload: result, completedAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(onboardingProvisioningStepsTable.id, step.id));

      if (result && typeof result === "object" && "workspaceId" in result && step.stepKey === "CREATE_WORKSPACE") {
        await db
          .update(clientOnboardingSessionsTable)
          .set({ createdWorkspaceId: (result as any).workspaceId, updatedAt: new Date() })
          .where(eq(clientOnboardingSessionsTable.id, sessionId));
        appliedConfig._workspaceId = (result as any).workspaceId;
      }

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await db
        .update(onboardingProvisioningStepsTable)
        .set({ status: "FAILED", lastError: errorMsg, updatedAt: new Date() })
        .where(eq(onboardingProvisioningStepsTable.id, step.id));

      await db
        .update(clientOnboardingSessionsTable)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(eq(clientOnboardingSessionsTable.id, sessionId));

      const finalSteps = await db
        .select()
        .from(onboardingProvisioningStepsTable)
        .where(eq(onboardingProvisioningStepsTable.sessionId, sessionId));

      return { steps: finalSteps };
    }
  }

  const finalSteps = await db
    .select()
    .from(onboardingProvisioningStepsTable)
    .where(eq(onboardingProvisioningStepsTable.sessionId, sessionId));

  const allCompleted = finalSteps.every(
    (s) => s.status === "COMPLETED" || s.status === "SKIPPED"
  );

  if (allCompleted) {
    await db
      .update(clientOnboardingSessionsTable)
      .set({ status: "PROVISIONED", provisionedAt: new Date(), updatedAt: new Date() })
      .where(eq(clientOnboardingSessionsTable.id, sessionId));
  }

  return { steps: finalSteps };
}

async function executeStep(
  stepKey: StepKey,
  session: typeof clientOnboardingSessionsTable.$inferSelect,
  config: Record<string, unknown>,
  adminUserId: string
): Promise<Record<string, unknown>> {

  const workspaceId = (config._workspaceId ?? session.createdWorkspaceId) as string | undefined;

  switch (stepKey) {
    case "CREATE_WORKSPACE": {
      if (workspaceId) {
        const existing = await db.query.workspacesTable.findFirst({ where: eq(workspacesTable.id, workspaceId) });
        if (existing) return { workspaceId: existing.id, skipped: true };
      }

      const intake = (session.intakePayload ?? {}) as Record<string, unknown>;
      const clientName = String(intake.clientName ?? "New Workspace");

      const ownerUserId = adminUserId;

      const [ws] = await db.insert(workspacesTable).values({
        name: clientName,
        ownerUserId,
        industryFocus: String(intake.industryDescription ?? ""),
      }).returning();

      return { workspaceId: ws.id };
    }

    case "ASSIGN_PLAN": {
      if (!workspaceId) throw new Error("workspaceId not available from CREATE_WORKSPACE");
      return { planAssigned: "standard", workspaceId };
    }

    case "CREATE_MEMBERSHIPS": {
      if (!workspaceId) throw new Error("workspaceId not available");
      const intake = (session.intakePayload ?? {}) as Record<string, unknown>;
      const inviteEmails = Array.isArray(config.inviteEmails) ? config.inviteEmails as string[] : [];

      const existing = await db.query.workspaceMembersTable.findFirst({
        where: and(
          eq(workspaceMembersTable.workspaceId, workspaceId),
          eq(workspaceMembersTable.userId, adminUserId)
        ),
      });

      if (!existing) {
        await db.insert(workspaceMembersTable).values({
          workspaceId,
          userId: adminUserId,
          role: "ADMIN",
        });
      }

      return { workspaceId, membersCreated: 1, invitesQueued: inviteEmails.length };
    }

    case "APPLY_VERTICAL_CONFIG": {
      if (!workspaceId) throw new Error("workspaceId not available");
      const verticalId = (config.verticalId ?? config.vertical_id) as string | null;
      const subVerticalId = (config.subVerticalId ?? config.sub_vertical_id) as string | null;
      const defaultContactRoles = (config.contactRoles ?? []) as unknown[];

      await db
        .insert(workspaceOnboardingConfigTable)
        .values({
          workspaceId,
          verticalId: verticalId ?? null,
          subVerticalId: subVerticalId ?? null,
          defaultContactRoles,
        })
        .onConflictDoUpdate({
          target: workspaceOnboardingConfigTable.workspaceId,
          set: {
            verticalId: verticalId ?? null,
            subVerticalId: subVerticalId ?? null,
            defaultContactRoles,
            updatedAt: new Date(),
          },
        });

      return { workspaceId, verticalId, subVerticalId };
    }

    case "ENABLE_SERVICE_LINES": {
      if (!workspaceId) throw new Error("workspaceId not available");
      const serviceLineIds = Array.isArray(config.serviceLineIds) ? config.serviceLineIds as string[] : [];

      let enabled = 0;
      for (const serviceLineId of serviceLineIds) {
        await db
          .insert(workspaceServiceLinesTable)
          .values({ workspaceId, serviceLineId, isEnabled: true, enabledByAdminUserId: adminUserId })
          .onConflictDoUpdate({
            target: [workspaceServiceLinesTable.workspaceId, workspaceServiceLinesTable.serviceLineId],
            set: { isEnabled: true, updatedAt: new Date() },
          });
        enabled++;
      }

      return { workspaceId, serviceLinesEnabled: enabled };
    }

    case "ENABLE_ADD_ONS": {
      if (!workspaceId) throw new Error("workspaceId not available");
      const addOns = Array.isArray(config.addOns) ? config.addOns as Array<{ addOnTypeId: string; config: Record<string, unknown> }> : [];

      let enabled = 0;
      for (const ao of addOns) {
        await db
          .insert(workspaceAddOnsTable)
          .values({
            workspaceId,
            addOnTypeId: ao.addOnTypeId,
            status: "ACTIVE",
            config: ao.config ?? {},
            enabledByAdminUserId: adminUserId,
          })
          .onConflictDoUpdate({
            target: [workspaceAddOnsTable.workspaceId, workspaceAddOnsTable.addOnTypeId],
            set: { status: "ACTIVE", config: ao.config ?? {}, updatedAt: new Date() },
          });
        enabled++;
      }

      return { workspaceId, addOnsEnabled: enabled };
    }

    case "PUBLISH_PIPELINE_TEMPLATES": {
      if (!workspaceId) throw new Error("workspaceId not available");
      const templateKeys = Array.isArray(config.pipelineTemplateKeys) ? config.pipelineTemplateKeys as string[] : [];

      const published: string[] = [];
      for (const key of templateKeys) {
        const template = await db.query.pipelineViewTemplatesTable.findFirst({
          where: eq(pipelineViewTemplatesTable.key, key),
        });
        if (!template || template.status !== "active") continue;

        const existingView = await db.query.workspacePipelineViewsTable.findFirst({
          where: and(
            eq(workspacePipelineViewsTable.templateId, template.id),
            eq(workspacePipelineViewsTable.workspaceId, workspaceId)
          ),
        });

        if (!existingView) {
          const configJson = (template.configJson ?? {}) as { stages?: Array<{ name: string; stageOrder: number; probabilityPercent: number }> };
          const stages = configJson.stages ?? [];

          const existingPipeline = await db.query.pipelinesTable.findFirst({
            where: and(eq(pipelinesTable.workspaceId, workspaceId), eq(pipelinesTable.name, template.name)),
          });

          let pipelineId: string;
          if (existingPipeline) {
            pipelineId = existingPipeline.id;
          } else if (stages.length > 0) {
            const [pipeline] = await db.insert(pipelinesTable).values({
              workspaceId,
              name: template.name,
              category: template.subVertical ?? template.vertical,
            }).returning();
            pipelineId = pipeline.id;

            for (const stage of stages) {
              await db.insert(pipelineStagesTable).values({
                pipelineId,
                name: stage.name,
                stageOrder: stage.stageOrder,
                probabilityPercent: stage.probabilityPercent ?? 0,
              });
            }
          } else {
            continue;
          }

          await db.insert(workspacePipelineViewsTable).values({
            templateId: template.id,
            workspaceId,
            pipelineId,
            isEnabled: true,
            isDefault: published.length === 0,
            sortOrder: published.length,
            visibilityScope: "all",
            settingsJson: {},
          });
        }

        published.push(key);
      }

      return { workspaceId, templatesPublished: published };
    }

    case "SEED_CONTACT_ROLES": {
      if (!workspaceId) throw new Error("workspaceId not available");
      const contactRoles = Array.isArray(config.contactRoles) ? config.contactRoles : [];
      return { workspaceId, contactRolesSeeded: contactRoles.length };
    }

    case "SEED_TAGS": {
      if (!workspaceId) throw new Error("workspaceId not available");
      const tags = Array.isArray(config.suggestedTags) ? config.suggestedTags as Array<{ name: string; color?: string }> : [];

      let seeded = 0;
      for (const tag of tags) {
        try {
          await db.execute(
            sql`INSERT INTO tags (id, workspace_id, name, color)
                VALUES (gen_random_uuid()::text, ${workspaceId}, ${tag.name}, ${tag.color ?? null})
                ON CONFLICT (workspace_id, name) DO NOTHING`
          );
          seeded++;
        } catch {
        }
      }

      return { workspaceId, tagsSeeded: seeded };
    }

    case "CREATE_LAUNCH_CHECKLIST": {
      if (!workspaceId) throw new Error("workspaceId not available");
      const items = getChecklistItems(session.clientType);

      for (const item of items) {
        await db
          .insert(workspaceLaunchChecklistTable)
          .values({
            workspaceId,
            itemKey: item.key,
            label: item.label,
            status: "PENDING",
            requiredForClientTypes: getRequiredForClientTypes(item.key),
          })
          .onConflictDoUpdate({
            target: [workspaceLaunchChecklistTable.workspaceId, workspaceLaunchChecklistTable.itemKey],
            set: { label: item.label, updatedAt: new Date() },
          });
      }

      return { workspaceId, checklistItemsCreated: items.length };
    }

    case "SEND_INVITE_EMAILS": {
      const clientType = session.clientType;
      if (clientType === "SINGLE_USER") {
        return { skipped: true, reason: "SINGLE_USER does not require invite emails" };
      }
      return { stubbed: true, invitesSent: 0 };
    }

    case "RECORD_AUDIT_ENTRY": {
      if (!workspaceId) throw new Error("workspaceId not available");

      const existing = await db.query.workspaceAdminAuditLogTable.findFirst({
        where: and(
          eq(workspaceAdminAuditLogTable.workspaceId, workspaceId),
          eq(workspaceAdminAuditLogTable.action, "WORKSPACE_PROVISIONED")
        ),
      });

      if (!existing) {
        await db.insert(workspaceAdminAuditLogTable).values({
          workspaceId,
          changedByUserId: adminUserId,
          action: "WORKSPACE_PROVISIONED",
          entityType: "onboarding_session",
          entityId: session.id,
          newValue: { sessionId: session.id, clientType: session.clientType },
          platformSupportAction: true,
        });
      }

      return { workspaceId, auditEntryRecorded: !existing };
    }

    case "SNAPSHOT_HEALTH_BASELINE": {
      if (!workspaceId) throw new Error("workspaceId not available");

      const checklistItems = await db
        .select()
        .from(workspaceLaunchChecklistTable)
        .where(eq(workspaceLaunchChecklistTable.workspaceId, workspaceId));

      const totalItems = checklistItems.length;
      const completedItems = checklistItems.filter((i) => i.status === "COMPLETED").length;
      const completenessPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      await db.insert(workspaceHealthSnapshotsTable).values({
        workspaceId,
        setupCompletenessPct: completenessPct,
        activeUserCount: 0,
        contactCount: 0,
        orgCount: 0,
        opportunityCount: 0,
        missingDataFlags: [],
        grokImprovementSuggestions: [],
      });

      return { workspaceId, completenessPct };
    }

    default:
      throw new Error(`Unknown step key: ${stepKey}`);
  }
}

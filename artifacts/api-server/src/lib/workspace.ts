import { db } from "@workspace/db";
import { workspacesTable, workspaceMembersTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEMO_USER_EMAIL = "demo@opportunityos.com";

export async function getOrCreateDemoUser() {
  const [user] = await db
    .insert(usersTable)
    .values({ email: DEMO_USER_EMAIL, firstName: "Demo", lastName: "User" })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: { email: DEMO_USER_EMAIL },
    })
    .returning();
  return user;
}

export async function getOrCreateDemoWorkspace(userId: string) {
  let workspace = await db.query.workspacesTable.findFirst({
    where: eq(workspacesTable.ownerUserId, userId),
  });
  if (!workspace) {
    const [created] = await db.insert(workspacesTable).values({
      name: "Opportunity OS",
      industryFocus: "Healthcare & GovCon",
      ownerUserId: userId,
    }).returning();
    workspace = created;

    await db.insert(workspaceMembersTable).values({
      workspaceId: workspace.id,
      userId,
      role: "OWNER",
    });

    await seedWorkspace(workspace.id, userId);
  }
  return workspace;
}

async function seedWorkspace(workspaceId: string, userId: string) {
  const { pipelinesTable, pipelineStagesTable, tagsTable } = await import("@workspace/db");

  const [relPipeline] = await db.insert(pipelinesTable).values({
    workspaceId,
    name: "Relationship Pipeline",
    category: "relationship",
  }).returning();

  const [salesPipeline] = await db.insert(pipelinesTable).values({
    workspaceId,
    name: "Sales Pipeline",
    category: "sales",
  }).returning();

  const relStages = [
    { name: "Identified", stageOrder: 1, probabilityPercent: 5 },
    { name: "Scanned", stageOrder: 2, probabilityPercent: 10 },
    { name: "Reviewed", stageOrder: 3, probabilityPercent: 20 },
    { name: "Contacted", stageOrder: 4, probabilityPercent: 30 },
    { name: "Engaged", stageOrder: 5, probabilityPercent: 50 },
    { name: "Meeting Scheduled", stageOrder: 6, probabilityPercent: 70 },
    { name: "Active Relationship", stageOrder: 7, probabilityPercent: 90 },
  ];

  const salesStages = [
    { name: "Lead", stageOrder: 1, probabilityPercent: 5 },
    { name: "Outreach", stageOrder: 2, probabilityPercent: 15 },
    { name: "Discovery", stageOrder: 3, probabilityPercent: 25 },
    { name: "Scoped", stageOrder: 4, probabilityPercent: 40 },
    { name: "Proposal Sent", stageOrder: 5, probabilityPercent: 60 },
    { name: "Negotiation", stageOrder: 6, probabilityPercent: 75 },
    { name: "Won", stageOrder: 7, probabilityPercent: 100 },
    { name: "Lost", stageOrder: 8, probabilityPercent: 0 },
  ];

  await db.insert(pipelineStagesTable).values(relStages.map(s => ({ ...s, pipelineId: relPipeline.id })));
  await db.insert(pipelineStagesTable).values(salesStages.map(s => ({ ...s, pipelineId: salesPipeline.id })));

  const tagData = [
    { name: "healthcare", color: "#10b981", category: "vertical" },
    { name: "govcon", color: "#3b82f6", category: "vertical" },
    { name: "hot_lead", color: "#ef4444", category: "status" },
    { name: "case_management", color: "#8b5cf6", category: "specialty" },
    { name: "hospital", color: "#f59e0b", category: "org_type" },
    { name: "teaming_partner", color: "#06b6d4", category: "relationship" },
  ];

  await db.insert(tagsTable).values(tagData.map(t => ({ ...t, workspaceId })));
}

export async function getCurrentWorkspace(req: { headers: { [key: string]: string | string[] | undefined } }) {
  const user = await getOrCreateDemoUser();
  const workspace = await getOrCreateDemoWorkspace(user.id);
  return { user, workspace };
}

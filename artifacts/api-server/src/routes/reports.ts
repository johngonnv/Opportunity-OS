import { Router } from "express";
import { db } from "@workspace/db";
import {
  contactsTable, tasksTable, opportunitiesTable, activitiesTable, businessCardsTable
} from "@workspace/db";
import { eq, and, gte, lte, lt, sql, desc } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

router.get("/dashboard", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      pendingCards,
      contactsThisWeek,
      tasksDueToday,
      tasksOverdue,
      openOpportunities,
      recentActivities,
      totalContacts,
      totalOrganizations,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(businessCardsTable)
        .where(and(eq(businessCardsTable.workspaceId, workspace.id), eq(businessCardsTable.reviewStatus, "PENDING_REVIEW"))),
      db.select({ count: sql<number>`count(*)` }).from(contactsTable)
        .where(and(eq(contactsTable.workspaceId, workspace.id), gte(contactsTable.createdAt, weekAgo))),
      db.select({ count: sql<number>`count(*)` }).from(tasksTable)
        .where(and(eq(tasksTable.workspaceId, workspace.id), eq(tasksTable.status, "OPEN"), gte(tasksTable.dueDate, startOfToday), lte(tasksTable.dueDate, endOfToday))),
      db.select({ count: sql<number>`count(*)` }).from(tasksTable)
        .where(and(eq(tasksTable.workspaceId, workspace.id), eq(tasksTable.status, "OPEN"), lt(tasksTable.dueDate, startOfToday))),
      db.select({ count: sql<number>`count(*)` }).from(opportunitiesTable)
        .where(and(eq(opportunitiesTable.workspaceId, workspace.id), eq(opportunitiesTable.status, "OPEN"))),
      db.select().from(activitiesTable)
        .where(eq(activitiesTable.workspaceId, workspace.id))
        .orderBy(desc(activitiesTable.occurredAt)).limit(10),
      db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(eq(contactsTable.workspaceId, workspace.id)),
      db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(eq(contactsTable.workspaceId, workspace.id)),
    ]);

    res.json({
      cardsPendingReview: Number(pendingCards[0].count),
      contactsThisWeek: Number(contactsThisWeek[0].count),
      tasksDueToday: Number(tasksDueToday[0].count),
      tasksOverdue: Number(tasksOverdue[0].count),
      openOpportunities: Number(openOpportunities[0].count),
      recentActivities,
      totalContacts: Number(totalContacts[0].count),
      totalOrganizations: Number(totalOrganizations[0].count),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/activities", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const days = parseInt((req.query.days as string) || "30");
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [byType, total] = await Promise.all([
      db.select({ type: activitiesTable.type, count: sql<number>`count(*)` })
        .from(activitiesTable)
        .where(and(eq(activitiesTable.workspaceId, workspace.id), gte(activitiesTable.occurredAt, since)))
        .groupBy(activitiesTable.type),
      db.select({ count: sql<number>`count(*)` }).from(activitiesTable)
        .where(and(eq(activitiesTable.workspaceId, workspace.id), gte(activitiesTable.occurredAt, since))),
    ]);

    const byDay: { date: string; count: number }[] = [];

    res.json({
      byType: byType.map(r => ({ type: r.type, count: Number(r.count) })),
      byDay,
      total: Number(total[0].count),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

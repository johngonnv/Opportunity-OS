import { Router } from "express";
import { db } from "@workspace/db";
import {
  contactsTable, organizationsTable, contactTagsTable, tagsTable,
  activitiesTable, tasksTable, notesTable, opportunityContactsTable, opportunitiesTable, businessCardsTable
} from "@workspace/db";
import { eq, and, ilike, or, desc, sql, inArray } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { search, status, organizationId, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(contactsTable.workspaceId, workspace.id)];
    if (search) conditions.push(or(ilike(contactsTable.fullName, `%${search}%`), ilike(contactsTable.email, `%${search}%`)) as ReturnType<typeof eq>);
    if (status) conditions.push(eq(contactsTable.status, status as "NEW" | "REVIEWED" | "ACTIVE" | "INACTIVE"));
    if (organizationId) conditions.push(eq(contactsTable.organizationId, organizationId));

    const [contacts, totalResult] = await Promise.all([
      db.select().from(contactsTable)
        .leftJoin(organizationsTable, eq(contactsTable.organizationId, organizationsTable.id))
        .where(and(...conditions))
        .orderBy(desc(contactsTable.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(and(...conditions)),
    ]);

    const contactIds = contacts.map(c => c.contacts.id);
    const tagRows = contactIds.length > 0 ? await db.select({ contactId: contactTagsTable.contactId, tag: tagsTable })
      .from(contactTagsTable).innerJoin(tagsTable, eq(contactTagsTable.tagId, tagsTable.id))
      .where(inArray(contactTagsTable.contactId, contactIds)) : [];

    const tagsByContact = tagRows.reduce((acc, r) => {
      if (!acc[r.contactId]) acc[r.contactId] = [];
      acc[r.contactId].push(r.tag);
      return acc;
    }, {} as Record<string, typeof tagsTable.$inferSelect[]>);

    const result = contacts.map(c => ({
      ...c.contacts,
      organization: c.organizations ? { id: c.organizations.id, name: c.organizations.name, organizationType: c.organizations.organizationType, industry: c.organizations.industry } : null,
      tags: tagsByContact[c.contacts.id] || [],
    }));

    res.json({ contacts: result, total: Number(totalResult[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const { tagIds, ...data } = req.body;
    const [contact] = await db.insert(contactsTable).values({ ...data, workspaceId: workspace.id, ownerUserId: user.id }).returning();
    if (tagIds?.length) {
      await db.insert(contactTagsTable).values(tagIds.map((tid: string) => ({ contactId: contact.id, tagId: tid })));
    }
    res.status(201).json(contact);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const contact = await db.query.contactsTable.findFirst({
      where: and(eq(contactsTable.id, req.params.id), eq(contactsTable.workspaceId, workspace.id)),
    });
    if (!contact) return res.status(404).json({ error: "Not found" });

    const [org, tags, activities, tasks, notes, businessCards] = await Promise.all([
      contact.organizationId ? db.query.organizationsTable.findFirst({ where: eq(organizationsTable.id, contact.organizationId!) }) : Promise.resolve(null),
      db.select({ tag: tagsTable }).from(contactTagsTable).innerJoin(tagsTable, eq(contactTagsTable.tagId, tagsTable.id)).where(eq(contactTagsTable.contactId, contact.id)),
      db.select().from(activitiesTable).where(eq(activitiesTable.contactId, contact.id)).orderBy(desc(activitiesTable.occurredAt)).limit(20),
      db.select().from(tasksTable).where(eq(tasksTable.contactId, contact.id)).orderBy(desc(tasksTable.createdAt)).limit(20),
      db.select().from(notesTable).where(eq(notesTable.contactId, contact.id)).orderBy(desc(notesTable.createdAt)).limit(20),
      db.select({ id: businessCardsTable.id, imageUrlFront: businessCardsTable.imageUrlFront, imageUrlBack: businessCardsTable.imageUrlBack, scannedAt: businessCardsTable.createdAt })
        .from(businessCardsTable).where(eq(businessCardsTable.linkedContactId, contact.id)).orderBy(desc(businessCardsTable.createdAt)).limit(5),
    ]);

    res.json({ ...contact, organization: org ? { id: org.id, name: org.name, organizationType: org.organizationType, industry: org.industry } : null, tags: tags.map(t => t.tag), activities, tasks, notes, businessCards });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { tagIds, ...data } = req.body;
    const [contact] = await db.update(contactsTable).set({ ...data, updatedAt: new Date() })
      .where(and(eq(contactsTable.id, req.params.id), eq(contactsTable.workspaceId, workspace.id))).returning();
    if (!contact) return res.status(404).json({ error: "Not found" });
    if (tagIds !== undefined) {
      await db.delete(contactTagsTable).where(eq(contactTagsTable.contactId, contact.id));
      if (tagIds.length) await db.insert(contactTagsTable).values(tagIds.map((tid: string) => ({ contactId: contact.id, tagId: tid })));
    }
    res.json(contact);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    await db.delete(contactsTable).where(and(eq(contactsTable.id, req.params.id), eq(contactsTable.workspaceId, workspace.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

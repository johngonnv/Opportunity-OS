import { Router } from "express";
import { db } from "@workspace/db";
import {
  businessCardsTable, contactsTable, organizationsTable, contactTagsTable, tagsTable, activitiesTable
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

function parseBusinessCardFallback(imageUrl: string): Record<string, string> {
  return {
    fullName: "",
    firstName: "",
    lastName: "",
    title: "",
    organizationName: "",
    email: "",
    phone: "",
    mobile: "",
    website: "",
    address: "",
    rawText: `Image: ${imageUrl}`,
  };
}

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { processingStatus, reviewStatus, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(businessCardsTable.workspaceId, workspace.id)];
    if (processingStatus) conditions.push(eq(businessCardsTable.processingStatus, processingStatus as any));
    if (reviewStatus) conditions.push(eq(businessCardsTable.reviewStatus, reviewStatus as any));

    const [cards, totalResult] = await Promise.all([
      db.select().from(businessCardsTable)
        .leftJoin(contactsTable, eq(businessCardsTable.linkedContactId, contactsTable.id))
        .leftJoin(organizationsTable, eq(businessCardsTable.linkedOrganizationId, organizationsTable.id))
        .where(and(...conditions))
        .orderBy(desc(businessCardsTable.createdAt))
        .limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(businessCardsTable).where(and(...conditions)),
    ]);

    const result = cards.map(c => ({
      ...c.business_cards,
      linkedContact: c.contacts,
      linkedOrganization: c.organizations ? { id: c.organizations.id, name: c.organizations.name, organizationType: c.organizations.organizationType, industry: c.organizations.industry } : null,
    }));

    res.json({ businessCards: result, total: Number(totalResult[0].count), page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const [card] = await db.insert(businessCardsTable).values({
      ...req.body,
      workspaceId: workspace.id,
      uploadedByUserId: user.id,
    }).returning();
    res.status(201).json(card);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [row] = await db.select().from(businessCardsTable)
      .leftJoin(contactsTable, eq(businessCardsTable.linkedContactId, contactsTable.id))
      .leftJoin(organizationsTable, eq(businessCardsTable.linkedOrganizationId, organizationsTable.id))
      .where(and(eq(businessCardsTable.id, req.params.id), eq(businessCardsTable.workspaceId, workspace.id)));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({
      ...row.business_cards,
      linkedContact: row.contacts,
      linkedOrganization: row.organizations ? { id: row.organizations.id, name: row.organizations.name, organizationType: row.organizations.organizationType, industry: row.organizations.industry } : null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [card] = await db.update(businessCardsTable).set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(businessCardsTable.id, req.params.id), eq(businessCardsTable.workspaceId, workspace.id))).returning();
    if (!card) return res.status(404).json({ error: "Not found" });
    res.json(card);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/parse", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const card = await db.query.businessCardsTable.findFirst({
      where: and(eq(businessCardsTable.id, req.params.id), eq(businessCardsTable.workspaceId, workspace.id)),
    });
    if (!card) return res.status(404).json({ error: "Not found" });

    await db.update(businessCardsTable).set({ processingStatus: "PARSING", updatedAt: new Date() })
      .where(eq(businessCardsTable.id, card.id));

    const parsed = parseBusinessCardFallback(card.imageUrlFront);
    const [updated] = await db.update(businessCardsTable).set({
      parsedJson: parsed,
      rawOcrText: parsed.rawText,
      processingStatus: "PARSED",
      updatedAt: new Date(),
    }).where(eq(businessCardsTable.id, card.id)).returning();

    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const card = await db.query.businessCardsTable.findFirst({
      where: and(eq(businessCardsTable.id, req.params.id), eq(businessCardsTable.workspaceId, workspace.id)),
    });
    if (!card) return res.status(404).json({ error: "Not found" });

    const { contactData, organizationData, mergeWithContactId } = req.body;
    let contact;
    let org = null;

    if (mergeWithContactId) {
      const [updated] = await db.update(contactsTable).set({ ...contactData, updatedAt: new Date() })
        .where(eq(contactsTable.id, mergeWithContactId)).returning();
      contact = updated;
    } else {
      if (organizationData) {
        const [createdOrg] = await db.insert(organizationsTable).values({ ...organizationData, workspaceId: workspace.id }).returning();
        org = createdOrg;
        contactData.organizationId = createdOrg.id;
      }
      const [created] = await db.insert(contactsTable).values({ ...contactData, workspaceId: workspace.id, ownerUserId: user.id }).returning();
      contact = created;
    }

    const [updatedCard] = await db.update(businessCardsTable).set({
      reviewStatus: "APPROVED",
      linkedContactId: contact.id,
      linkedOrganizationId: org?.id || null,
      updatedAt: new Date(),
    }).where(eq(businessCardsTable.id, card.id)).returning();

    await db.insert(activitiesTable).values({
      workspaceId: workspace.id,
      contactId: contact.id,
      organizationId: org?.id || null,
      type: "CARD_SCAN",
      subject: `Business card scanned for ${contact.fullName}`,
      createdByUserId: user.id,
    });

    res.json({ businessCard: updatedCard, contact, organization: org });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/reject", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [card] = await db.update(businessCardsTable).set({ reviewStatus: "REJECTED", updatedAt: new Date() })
      .where(and(eq(businessCardsTable.id, req.params.id), eq(businessCardsTable.workspaceId, workspace.id))).returning();
    if (!card) return res.status(404).json({ error: "Not found" });
    res.json(card);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  businessCardsTable, contactsTable, organizationsTable, activitiesTable
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { objectStorageClient } from "../lib/objectStorage";
import { parseBusinessCardImage, isOcrAvailable } from "../lib/ocr";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function getGcsBucketAndPath(objectPath: string): { bucketName: string; objectName: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const parts = dir.startsWith("/") ? dir.slice(1).split("/") : dir.split("/");
  const bucketName = parts[0];
  const prefix = parts.slice(1).join("/");
  const objectName = prefix ? `${prefix}/${objectPath}` : objectPath;
  return { bucketName, objectName };
}

router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    req.log.info({ originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size }, "[CARD] file received");

    const ext = req.file.mimetype.includes("png") ? "png" : "jpg";
    const objectId = crypto.randomUUID();
    const objectPath = `business-cards/${objectId}.${ext}`;
    const { bucketName, objectName } = getGcsBucketAndPath(objectPath);

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(req.file.buffer, {
      contentType: req.file.mimetype,
      metadata: { cacheControl: "private, max-age=86400" },
    });

    const servingPath = `/objects/${objectPath}`;
    req.log.info({ servingPath }, "[CARD] image stored in GCS");

    res.json({ objectPath: servingPath, imageUrl: servingPath });
  } catch (err) {
    req.log.error({ err }, "[CARD] upload failed");
    res.status(500).json({ error: "Image upload failed" });
  }
});

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
  const cardId = req.params.id;
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const card = await db.query.businessCardsTable.findFirst({
      where: and(eq(businessCardsTable.id, cardId), eq(businessCardsTable.workspaceId, workspace.id)),
    });
    if (!card) return res.status(404).json({ error: "Not found" });

    await db.update(businessCardsTable).set({ processingStatus: "PARSING", updatedAt: new Date() })
      .where(eq(businessCardsTable.id, cardId));

    req.log.info({ cardId }, "[CARD] parse started");

    if (!isOcrAvailable()) {
      req.log.warn({ cardId }, "[CARD] OCR not configured, setting FAILED");
      const [updated] = await db.update(businessCardsTable).set({
        processingStatus: "FAILED",
        parsedJson: { ocrError: "OCR_NOT_CONFIGURED", message: "OCR provider not configured. Image captured successfully, but text extraction is unavailable." },
        updatedAt: new Date(),
      }).where(eq(businessCardsTable.id, cardId)).returning();
      return res.json(updated);
    }

    const imageUrlFront = card.imageUrlFront;
    req.log.info({ cardId, imageUrlFront }, "[CARD] OCR called");

    let imageBuffer: Buffer;
    let contentType = "image/jpeg";

    if (imageUrlFront.startsWith("/objects/")) {
      const objectPath = imageUrlFront;
      const dir = process.env.PRIVATE_OBJECT_DIR || "";
      const parts = dir.startsWith("/") ? dir.slice(1).split("/") : dir.split("/");
      const bucketName = parts[0];
      const prefix = parts.slice(1).join("/");
      const entityId = objectPath.slice("/objects/".length);
      const objectName = prefix ? `${prefix}/${entityId}` : entityId;

      req.log.info({ cardId, bucketName, objectName }, "[CARD] downloading from GCS for OCR");

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [metadata] = await file.getMetadata();
      contentType = (metadata.contentType as string) || "image/jpeg";

      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const stream = file.createReadStream();
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      imageBuffer = Buffer.concat(chunks);
      req.log.info({ cardId, size: imageBuffer.length }, "[CARD] image downloaded from GCS");
    } else {
      const imgRes = await fetch(imageUrlFront);
      if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
      contentType = imgRes.headers.get("content-type") || "image/jpeg";
      imageBuffer = Buffer.from(await imgRes.arrayBuffer());
      req.log.info({ cardId, size: imageBuffer.length }, "[CARD] image fetched from URL");
    }

    const { parsed, rawText } = await parseBusinessCardImage(imageBuffer, contentType);
    req.log.info({ cardId, parsed }, "[CARD] parsedJson saved");

    const [updated] = await db.update(businessCardsTable).set({
      parsedJson: parsed,
      rawOcrText: rawText,
      processingStatus: "PARSED",
      updatedAt: new Date(),
    }).where(eq(businessCardsTable.id, cardId)).returning();

    res.json(updated);
  } catch (err: any) {
    req.log.error({ err, cardId }, "[CARD] parse failed");
    await db.update(businessCardsTable).set({
      processingStatus: "FAILED",
      parsedJson: { ocrError: err?.message || "UNKNOWN_ERROR", message: err?.message === "OCR_NOT_CONFIGURED" ? "OCR provider not configured. Image captured successfully, but text extraction is unavailable." : "Failed to extract text from card. Please fill in the fields manually." },
      updatedAt: new Date(),
    }).where(eq(businessCardsTable.id, cardId)).catch(() => {});
    res.status(500).json({ error: "Parse failed", details: err?.message });
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

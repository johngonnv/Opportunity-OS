import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  businessCardsTable, contactsTable, organizationsTable, activitiesTable, notesTable
} from "@workspace/db";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { objectStorageClient } from "../lib/objectStorage";
import { parseBusinessCardImage, isOcrAvailable } from "../lib/ocr";
import { syncContactChannels, normalizedPhoneFor } from "../lib/contactIdentity";
import { processContactPromotion, REJECTION_MESSAGES } from "../lib/contactPromotion";

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

    async function downloadCardImage(objectPath: string, label: string): Promise<{ buffer: Buffer; contentType: string }> {
      if (objectPath.startsWith("/objects/")) {
        const dir = process.env.PRIVATE_OBJECT_DIR || "";
        const parts = dir.startsWith("/") ? dir.slice(1).split("/") : dir.split("/");
        const bucketName = parts[0];
        const prefix = parts.slice(1).join("/");
        const entityId = objectPath.slice("/objects/".length);
        const objectName = prefix ? `${prefix}/${entityId}` : entityId;
        req.log.info({ cardId, bucketName, objectName }, `[CARD] downloading ${label} from GCS`);
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        const [metadata] = await file.getMetadata();
        const contentType = (metadata.contentType as string) || "image/jpeg";
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          const stream = file.createReadStream();
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", resolve);
          stream.on("error", reject);
        });
        const buffer = Buffer.concat(chunks);
        req.log.info({ cardId, size: buffer.length }, `[CARD] ${label} downloaded from GCS`);
        return { buffer, contentType };
      } else {
        const imgRes = await fetch(objectPath);
        if (!imgRes.ok) throw new Error(`Failed to fetch ${label}: ${imgRes.status}`);
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        req.log.info({ cardId, size: buffer.length }, `[CARD] ${label} fetched from URL`);
        return { buffer, contentType };
      }
    }

    const images = [await downloadCardImage(imageUrlFront, "front image")];
    if (card.imageUrlBack) {
      req.log.info({ cardId }, "[CARD] back image present, including in OCR");
      images.push(await downloadCardImage(card.imageUrlBack, "back image"));
    }

    const { parsed, rawText } = await parseBusinessCardImage(images);
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

    const { contactData, organizationData, mergeWithContactId, cardNotes, force } = req.body;
    let contact;
    let org = null;
    let changeType: "CREATED" | "UPDATED" = "CREATED";

    if (mergeWithContactId) {
      const phoneUpdate = contactData?.phone !== undefined
        ? { normalizedPhone: normalizedPhoneFor(contactData.phone) }
        : {};
      const [updated] = await db.update(contactsTable).set({ ...contactData, ...phoneUpdate, updatedAt: new Date() })
        .where(eq(contactsTable.id, mergeWithContactId)).returning();
      contact = updated;
      changeType = "UPDATED";
    } else {
      // Duplicate contact check (skip if force=true)
      if (!force && (contactData?.email?.trim() || contactData?.fullName?.trim())) {
        const orConditions: ReturnType<typeof eq>[] = [];
        if (contactData.email?.trim()) orConditions.push(ilike(contactsTable.email, contactData.email.trim()));
        if (contactData.fullName?.trim()) orConditions.push(ilike(contactsTable.fullName, contactData.fullName.trim()));
        const existing = await db.select({ id: contactsTable.id, fullName: contactsTable.fullName, email: contactsTable.email })
          .from(contactsTable)
          .where(and(eq(contactsTable.workspaceId, workspace.id), or(...orConditions)))
          .limit(1);
        if (existing.length > 0) {
          return res.status(409).json({
            error: "DUPLICATE",
            message: `A contact named "${existing[0].fullName}" already exists${existing[0].email ? ` (${existing[0].email})` : ""}.`,
            existing: existing[0],
          });
        }
      }

      if (organizationData?.name?.trim()) {
        // Re-use existing org with same name instead of creating a duplicate
        const existingOrg = await db.select({ id: organizationsTable.id, name: organizationsTable.name })
          .from(organizationsTable)
          .where(and(eq(organizationsTable.workspaceId, workspace.id), ilike(organizationsTable.name, organizationData.name.trim())))
          .limit(1);
        if (existingOrg.length > 0) {
          org = existingOrg[0] as typeof org;
          contactData.organizationId = existingOrg[0].id;
        } else {
          const [createdOrg] = await db.insert(organizationsTable).values({ ...organizationData, workspaceId: workspace.id }).returning();
          org = createdOrg;
          contactData.organizationId = createdOrg.id;
        }
      }
      const [created] = await db.insert(contactsTable).values({
        ...contactData,
        workspaceId: workspace.id,
        ownerUserId: user.id,
        normalizedPhone: normalizedPhoneFor(contactData?.phone ?? null),
      }).returning();
      contact = created;
    }

    // Card scans are a high-trust source: the user physically saw the card and
    // typed/confirmed the details, so the WORK email/phone is treated as
    // verified at write time. syncContactChannels handles both branches —
    // re-syncing ensures stale verified WORK rows from the prior email/phone
    // are soft-deleted when a merge changes the value (Task #57: no stale
    // channel rows continue to satisfy the promotion gate).
    await syncContactChannels({
      contactId: contact.id,
      email: contact.email,
      phone: contact.phone,
      mobile: contact.mobile,
      emailLabel: "WORK",
      phoneLabel: contact.phoneType === "personal" ? "PERSONAL" : "WORK",
    });

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

    if (cardNotes && typeof cardNotes === "string" && cardNotes.trim()) {
      await db.insert(notesTable).values({
        workspaceId: workspace.id,
        contactId: contact.id,
        organizationId: org?.id || null,
        content: cardNotes.trim(),
        createdByUserId: user.id,
      });
    }

    // Run the promotion gate now that channels are in place — a verified
    // WORK email/phone from the card is the prototypical case for entering
    // the master directory. Mirrors the contacts.ts POST/PATCH pattern.
    const promotion = await processContactPromotion({
      contact, workspaceId: workspace.id, changeType, userId: user.id,
    });

    res.json({
      businessCard: updatedCard,
      contact: {
        ...contact,
        promotionStatus: promotion.status,
        promotionReason: promotion.status === "REJECTED" ? promotion.reason : null,
        promotionMessage: promotion.status === "REJECTED" ? REJECTION_MESSAGES[promotion.reason] : null,
      },
      organization: org,
    });
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

router.post("/:id/review-save", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const cardId = req.params.id;

    const card = await db.query.businessCardsTable.findFirst({
      where: and(eq(businessCardsTable.id, cardId), eq(businessCardsTable.workspaceId, workspace.id)),
    });
    if (!card) return res.status(404).json({ error: "Not found" });

    const { approvedContact, approvedOrg, approvedNotes, contactData, organizationData, cardNotes, force } = req.body;

    let contact: typeof contactsTable.$inferSelect | null = null;
    let org: { id: string; name: string } | null = null;

    if (approvedOrg && organizationData?.name?.trim()) {
      const existingOrg = await db
        .select({ id: organizationsTable.id, name: organizationsTable.name })
        .from(organizationsTable)
        .where(and(eq(organizationsTable.workspaceId, workspace.id), ilike(organizationsTable.name, organizationData.name.trim())))
        .limit(1);
      if (existingOrg.length > 0) {
        org = existingOrg[0];
      } else {
        const [createdOrg] = await db.insert(organizationsTable).values({
          name: organizationData.name.trim(),
          website: organizationData.website || null,
          organizationType: (organizationData.organizationType as any) || "OTHER",
          vertical: (organizationData.vertical as any) || "healthcare",
          workspaceId: workspace.id,
        }).returning();
        org = createdOrg;
      }
    }

    if (approvedContact && contactData?.fullName?.trim()) {
      if (!force) {
        const orConditions: ReturnType<typeof eq>[] = [];
        if (contactData.email?.trim()) orConditions.push(ilike(contactsTable.email, contactData.email.trim()));
        if (contactData.fullName?.trim()) orConditions.push(ilike(contactsTable.fullName, contactData.fullName.trim()));
        if (orConditions.length > 0) {
          const existing = await db
            .select({ id: contactsTable.id, fullName: contactsTable.fullName, email: contactsTable.email })
            .from(contactsTable)
            .where(and(eq(contactsTable.workspaceId, workspace.id), or(...orConditions)))
            .limit(1);
          if (existing.length > 0) {
            return res.status(409).json({
              error: "DUPLICATE",
              message: `A contact named "${existing[0].fullName}" already exists${existing[0].email ? ` (${existing[0].email})` : ""}.`,
              existing: existing[0],
            });
          }
        }
      }

      const [created] = await db.insert(contactsTable).values({
        ...contactData,
        organizationId: org?.id || null,
        workspaceId: workspace.id,
        ownerUserId: user.id,
        normalizedPhone: normalizedPhoneFor(contactData?.phone ?? null),
      }).returning();
      contact = created;

      await syncContactChannels({
        contactId: contact.id,
        email: contact.email,
        phone: contact.phone,
        mobile: contact.mobile,
        emailLabel: "WORK",
        phoneLabel: contact.phoneType === "personal" ? "PERSONAL" : "WORK",
      });

      await processContactPromotion({ contact, workspaceId: workspace.id, changeType: "CREATED", userId: user.id });
    }

    await db.update(businessCardsTable).set({
      reviewStatus: approvedContact || approvedOrg ? "APPROVED" : "REJECTED",
      linkedContactId: contact?.id || null,
      linkedOrganizationId: org?.id || null,
      updatedAt: new Date(),
    }).where(eq(businessCardsTable.id, cardId));

    if (contact || org) {
      await db.insert(activitiesTable).values({
        workspaceId: workspace.id,
        contactId: contact?.id || null,
        organizationId: org?.id || null,
        type: "CARD_SCAN",
        subject: contact
          ? `Business card scanned for ${contact.fullName}`
          : `Card scan saved for ${(org as any)?.name}`,
        createdByUserId: user.id,
      });
    }

    if (approvedNotes && cardNotes?.trim() && (contact || org)) {
      await db.insert(notesTable).values({
        workspaceId: workspace.id,
        contactId: contact?.id || null,
        organizationId: org?.id || null,
        content: cardNotes.trim(),
        createdByUserId: user.id,
      });
    }

    res.json({ contact, organization: org });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Save failed" });
  }
});

router.post("/:id/link-org", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const cardId = req.params.id;
    const { organizationId } = req.body;

    if (!organizationId) return res.status(400).json({ error: "organizationId required" });

    const card = await db.query.businessCardsTable.findFirst({
      where: and(eq(businessCardsTable.id, cardId), eq(businessCardsTable.workspaceId, workspace.id)),
    });
    if (!card) return res.status(404).json({ error: "Not found" });

    const org = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, organizationId), eq(organizationsTable.workspaceId, workspace.id)))
      .limit(1);
    if (org.length === 0) return res.status(404).json({ error: "Organization not found" });

    await db.update(businessCardsTable)
      .set({ linkedOrganizationId: organizationId, updatedAt: new Date() })
      .where(eq(businessCardsTable.id, cardId));

    if (card.linkedContactId) {
      await db.update(contactsTable)
        .set({ organizationId, updatedAt: new Date() })
        .where(and(eq(contactsTable.id, card.linkedContactId), eq(contactsTable.workspaceId, workspace.id)));
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

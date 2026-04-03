import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  organizationScansTable, organizationsTable, workspacesTable,
  activitiesTable, auditLogsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { objectStorageClient } from "../lib/objectStorage";
import { parseStorefrontImage, isOcrAvailable } from "../lib/ocr";

const router = Router({ mergeParams: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function getGcsBucketAndPath(objectPath: string) {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const parts = dir.startsWith("/") ? dir.slice(1).split("/") : dir.split("/");
  const bucketName = parts[0];
  const prefix = parts.slice(1).join("/");
  const objectName = prefix ? `${prefix}/${objectPath}` : objectPath;
  return { bucketName, objectName };
}

async function downloadScanImage(objectPath: string, log: any) {
  if (!objectPath.startsWith("/objects/")) throw new Error("Only /objects/ paths are permitted");
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  const parts = dir.startsWith("/") ? dir.slice(1).split("/") : dir.split("/");
  const bucketName = parts[0];
  const prefix = parts.slice(1).join("/");
  const entityId = objectPath.slice("/objects/".length);
  const objectName = prefix ? `${prefix}/${entityId}` : entityId;
  log.info({ bucketName, objectName }, "[ADMIN-SCAN] downloading image");
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
  return { buffer: Buffer.concat(chunks), contentType };
}

function computeConfidence(name: string, address: string | null, website: string | null, phone: string | null, query: string) {
  let score = 0;
  const nameLower = name.toLowerCase();
  const queryLower = query.toLowerCase();
  if (nameLower === queryLower) score += 0.5;
  else if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) score += 0.3;
  else {
    const words = queryLower.split(/\s+/).filter(Boolean);
    score += (words.filter(w => nameLower.includes(w)).length / Math.max(words.length, 1)) * 0.2;
  }
  if (address) score += 0.2;
  if (website) score += 0.15;
  if (phone) score += 0.1;
  return Math.min(score, 1);
}

async function requireWorkspace(workspaceId: string) {
  const [ws] = await db.select({ id: workspacesTable.id, name: workspacesTable.name })
    .from(workspacesTable)
    .where(eq(workspacesTable.id, workspaceId))
    .limit(1);
  if (!ws) throw Object.assign(new Error("Workspace not found"), { status: 404 });
  return ws;
}

router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const { workspaceId } = req.params;
    await requireWorkspace(workspaceId);
    if (!req.file) return res.status(400).json({ error: "No image file provided" });

    const ext = req.file.mimetype.includes("png") ? "png" : "jpg";
    const objectId = crypto.randomUUID();
    const objectPath = `organization-scans/${objectId}.${ext}`;
    const { bucketName, objectName } = getGcsBucketAndPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    await bucket.file(objectName).save(req.file.buffer, {
      contentType: req.file.mimetype,
      metadata: { cacheControl: "private, max-age=86400" },
    });

    const imageUrl = `/objects/${objectPath}`;
    const [scan] = await db.insert(organizationScansTable).values({
      workspaceId,
      uploadedByUserId: req.platformAdmin!.id,
      imageUrl,
      processingStatus: "UPLOADED",
      reviewStatus: "PENDING_REVIEW",
    }).returning();

    return res.json({ id: scan.id, imageUrl: scan.imageUrl, scan });
  } catch (err: any) {
    req.log.error({ err }, "[ADMIN-SCAN] upload failed");
    return res.status(err.status || 500).json({ error: err.message || "Upload failed" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const [row] = await db.select({
      scan: organizationScansTable,
      orgName: organizationsTable.name,
    })
      .from(organizationScansTable)
      .leftJoin(organizationsTable, and(
        eq(organizationScansTable.organizationId, organizationsTable.id),
        eq(organizationsTable.workspaceId, workspaceId),
      ))
      .where(and(
        eq(organizationScansTable.id, req.params.id),
        eq(organizationScansTable.workspaceId, workspaceId),
      ));
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json({ ...row.scan, linkedOrganizationName: row.orgName ?? null });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-SCAN] get failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/parse", async (req, res) => {
  const scanId = req.params.id;
  try {
    const { workspaceId } = req.params;
    const scan = await db.query.organizationScansTable.findFirst({
      where: and(eq(organizationScansTable.id, scanId), eq(organizationScansTable.workspaceId, workspaceId)),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });
    if (!scan.imageUrl.startsWith("/objects/")) return res.status(400).json({ error: "Invalid image URL" });

    await db.update(organizationScansTable).set({ processingStatus: "PARSING", updatedAt: new Date() })
      .where(eq(organizationScansTable.id, scanId));

    if (!isOcrAvailable()) {
      const [updated] = await db.update(organizationScansTable).set({
        processingStatus: "FAILED",
        rawOcrText: "OCR_NOT_CONFIGURED",
        updatedAt: new Date(),
      }).where(eq(organizationScansTable.id, scanId)).returning();
      return res.json(updated);
    }

    const image = await downloadScanImage(scan.imageUrl, req.log);
    const { parsed, rawText } = await parseStorefrontImage([image]);
    const [updated] = await db.update(organizationScansTable).set({
      rawOcrText: rawText,
      parsedBusinessName: parsed.businessName || null,
      confidenceScore: parsed.confidence,
      processingStatus: "PARSED",
      updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scanId)).returning();

    return res.json(updated);
  } catch (err: any) {
    req.log.error({ err, scanId }, "[ADMIN-SCAN] parse failed");
    await db.update(organizationScansTable).set({
      processingStatus: "FAILED",
      rawOcrText: err.message || "UNKNOWN_ERROR",
      updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scanId)).catch(() => {});
    return res.status(500).json({ error: "Parse failed", details: err.message });
  }
});

router.post("/:id/match", async (req, res) => {
  const scanId = req.params.id;
  try {
    const { workspaceId } = req.params;
    const scan = await db.query.organizationScansTable.findFirst({
      where: and(eq(organizationScansTable.id, scanId), eq(organizationScansTable.workspaceId, workspaceId)),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      return res.status(503).json({ error: "PLACES_NOT_CONFIGURED" });
    }

    const query = ((req.body.query as string | undefined) || scan.parsedBusinessName)?.trim();
    if (!query) return res.status(400).json({ error: "No query text available" });

    const latitude = typeof req.body.latitude === "number" ? req.body.latitude : null;
    const longitude = typeof req.body.longitude === "number" ? req.body.longitude : null;

    const searchBody: any = { textQuery: query, maxResultCount: 5 };
    if (latitude !== null && longitude !== null) {
      searchBody.locationBias = { circle: { center: { latitude, longitude }, radius: 50000.0 } };
    }

    const placesRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.primaryType,places.location",
      },
      body: JSON.stringify(searchBody),
    });

    if (!placesRes.ok) {
      const errBody = await placesRes.json().catch(() => ({})) as any;
      return res.status(502).json({ error: "PLACES_API_ERROR", message: errBody?.error?.message ?? `HTTP ${placesRes.status}` });
    }

    const placesData = await placesRes.json() as any;
    const candidates = (placesData.places ?? []).slice(0, 5).map((place: any) => {
      const name = place.displayName?.text ?? "";
      const formattedAddress = place.formattedAddress ?? null;
      const phoneNumber = place.nationalPhoneNumber ?? null;
      const website = place.websiteUri ?? null;
      return {
        placeId: place.id,
        name,
        formattedAddress,
        phoneNumber,
        website,
        placeCategory: place.primaryType ?? null,
        mapLink: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        geometry: place.location ? { lat: place.location.latitude, lng: place.location.longitude } : null,
        confidence: computeConfidence(name, formattedAddress, website, phoneNumber, query),
      };
    }).sort((a: any, b: any) => b.confidence - a.confidence);

    const [updated] = await db.update(organizationScansTable).set({
      matchedPlaceJson: candidates,
      processingStatus: "MATCHED",
      updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scanId)).returning();

    return res.json({ scan: updated, candidates });
  } catch (err) {
    req.log.error({ err, scanId }, "[ADMIN-SCAN] match failed");
    return res.status(500).json({ error: "Match failed" });
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const adminId = req.platformAdmin!.id;
    const scan = await db.query.organizationScansTable.findFirst({
      where: and(eq(organizationScansTable.id, req.params.id), eq(organizationScansTable.workspaceId, workspaceId)),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });

    const selectedMatch = req.body.selectedMatch as any;
    const targetOrganizationId: string | undefined = req.body.targetOrganizationId;
    const forceFields: string[] = Array.isArray(req.body.forceFields) ? req.body.forceFields : [];

    const fieldsFromMatch: Record<string, any> = {};
    if (selectedMatch) {
      if (selectedMatch.name) fieldsFromMatch.name = selectedMatch.name;
      if (selectedMatch.formattedAddress) fieldsFromMatch.formattedAddress = selectedMatch.formattedAddress;
      if (selectedMatch.phoneNumber) fieldsFromMatch.phone = selectedMatch.phoneNumber;
      if (selectedMatch.website) {
        fieldsFromMatch.website = selectedMatch.website;
        try { fieldsFromMatch.websiteDomain = new URL(selectedMatch.website).hostname.replace(/^www\./, ""); } catch {}
      }
      if (selectedMatch.placeId) fieldsFromMatch.googlePlaceId = selectedMatch.placeId;
      if (selectedMatch.placeCategory) fieldsFromMatch.placeCategory = selectedMatch.placeCategory;
      if (selectedMatch.geometry?.lat != null) fieldsFromMatch.latitude = selectedMatch.geometry.lat;
      if (selectedMatch.geometry?.lng != null) fieldsFromMatch.longitude = selectedMatch.geometry.lng;
    }

    let organization: any;

    if (targetOrganizationId) {
      const [existingOrg] = await db.select().from(organizationsTable)
        .where(and(eq(organizationsTable.id, targetOrganizationId), eq(organizationsTable.workspaceId, workspaceId)));
      if (!existingOrg) return res.status(404).json({ error: "Target organization not found" });

      const updatePayload: any = { lastEnrichedAt: new Date(), enrichmentSource: "logo_scan", updatedAt: new Date() };
      const fieldMap = ["formattedAddress", "phone", "website", "websiteDomain", "googlePlaceId", "placeCategory", "latitude", "longitude"];
      for (const col of fieldMap) {
        if (fieldsFromMatch[col] == null) continue;
        if (!existingOrg[col as keyof typeof existingOrg] || forceFields.includes(col)) {
          updatePayload[col] = fieldsFromMatch[col];
        }
      }
      const [enriched] = await db.update(organizationsTable).set(updatePayload).where(eq(organizationsTable.id, targetOrganizationId)).returning();
      organization = enriched;

      await db.insert(activitiesTable).values({
        workspaceId, organizationId: organization.id, type: "ORG_ENRICHMENT",
        subject: `Organization enriched via admin logo scan: ${organization.name}`,
        createdByUserId: adminId,
      });
      await db.insert(auditLogsTable).values({
        workspaceId, userId: adminId, entityType: "organization", entityId: organization.id,
        action: "ORG_ENRICHMENT_VIA_ADMIN_LOGO_SCAN",
        beforeJson: { id: existingOrg.id, enrichmentSource: existingOrg.enrichmentSource },
        afterJson: { id: organization.id, enrichmentSource: "logo_scan", adminScan: true },
      });
    } else {
      if (!fieldsFromMatch.name) return res.status(400).json({ error: "selectedMatch.name is required" });
      const [created] = await db.insert(organizationsTable).values({
        workspaceId, ownerUserId: adminId, ...fieldsFromMatch,
        lastEnrichedAt: new Date(), enrichmentSource: "logo_scan",
      }).returning();
      organization = created;

      await db.insert(activitiesTable).values({
        workspaceId, organizationId: organization.id, type: "LOGO_SCAN",
        subject: `Organization created via admin logo scan: ${organization.name}`,
        createdByUserId: adminId,
      });
      await db.insert(auditLogsTable).values({
        workspaceId, userId: adminId, entityType: "organization", entityId: organization.id,
        action: "ORG_CREATED_VIA_ADMIN_LOGO_SCAN",
        beforeJson: null,
        afterJson: { id: organization.id, name: organization.name, adminScan: true },
      });
    }

    const [updatedScan] = await db.update(organizationScansTable).set({
      reviewStatus: "APPROVED", organizationId: organization.id,
      selectedMatchJson: selectedMatch ?? null, updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scan.id)).returning();

    return res.json({ organization, scan: updatedScan });
  } catch (err) {
    req.log.error({ err }, "[ADMIN-SCAN] approve failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/reject", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const [scan] = await db.update(organizationScansTable).set({
      reviewStatus: "REJECTED", updatedAt: new Date(),
    }).where(and(
      eq(organizationScansTable.id, req.params.id),
      eq(organizationScansTable.workspaceId, workspaceId),
    )).returning();
    if (!scan) return res.status(404).json({ error: "Not found" });
    return res.json(scan);
  } catch (err) {
    req.log.error({ err }, "[ADMIN-SCAN] reject failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

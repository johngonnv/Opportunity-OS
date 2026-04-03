import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  adminOrgScanAttemptsTable,
  masterOrganizationsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { objectStorageClient } from "../lib/objectStorage";
import { parseStorefrontImage, isOcrAvailable } from "../lib/ocr";
import { normalizeOrgName, normalizeDomain } from "../lib/orgNameNormalization";

const router = Router();

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
  log.info({ bucketName, objectName }, "[MASTER-SCAN] downloading image");
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

router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const adminId = req.platformAdmin!.id;
    if (!req.file) return res.status(400).json({ error: "No image file provided" });

    const ext = req.file.mimetype.includes("png") ? "png" : "jpg";
    const objectId = crypto.randomUUID();
    const objectPath = `master-org-scans/${objectId}.${ext}`;
    const { bucketName, objectName } = getGcsBucketAndPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    await bucket.file(objectName).save(req.file.buffer, {
      contentType: req.file.mimetype,
      metadata: { cacheControl: "private, max-age=86400" },
    });

    const imageUrl = `/objects/${objectPath}`;
    const [scan] = await db.insert(adminOrgScanAttemptsTable).values({
      uploadedByAdminId: adminId,
      imageUrl,
      processingStatus: "UPLOADED",
      reviewStatus: "PENDING_REVIEW",
    }).returning();

    req.log.info({ scanId: scan.id, imageUrl }, "[MASTER-SCAN] uploaded");
    return res.json({ id: scan.id, imageUrl: scan.imageUrl, scan });
  } catch (err: any) {
    req.log.error({ err }, "[MASTER-SCAN] upload failed");
    return res.status(err.status || 500).json({ error: err.message || "Upload failed" });
  }
});

router.get("/", async (req, res) => {
  try {
    const rows = await db
      .select({
        scan: adminOrgScanAttemptsTable,
        masterOrgName: masterOrganizationsTable.canonicalName,
      })
      .from(adminOrgScanAttemptsTable)
      .leftJoin(masterOrganizationsTable, eq(adminOrgScanAttemptsTable.createdMasterOrgId, masterOrganizationsTable.id))
      .orderBy(desc(adminOrgScanAttemptsTable.createdAt))
      .limit(50);

    const result = rows.map(r => ({ ...r.scan, createdMasterOrgName: r.masterOrgName ?? null }));
    return res.json({ scans: result });
  } catch (err) {
    req.log.error({ err }, "[MASTER-SCAN] list failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [row] = await db
      .select({
        scan: adminOrgScanAttemptsTable,
        masterOrgName: masterOrganizationsTable.canonicalName,
      })
      .from(adminOrgScanAttemptsTable)
      .leftJoin(masterOrganizationsTable, eq(adminOrgScanAttemptsTable.createdMasterOrgId, masterOrganizationsTable.id))
      .where(eq(adminOrgScanAttemptsTable.id, req.params.id));
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json({ ...row.scan, createdMasterOrgName: row.masterOrgName ?? null });
  } catch (err) {
    req.log.error({ err }, "[MASTER-SCAN] get failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/parse", async (req, res) => {
  const scanId = req.params.id;
  try {
    const scan = await db.query.adminOrgScanAttemptsTable.findFirst({
      where: eq(adminOrgScanAttemptsTable.id, scanId),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });
    if (!scan.imageUrl.startsWith("/objects/")) return res.status(400).json({ error: "Invalid image URL" });

    await db.update(adminOrgScanAttemptsTable).set({ processingStatus: "PARSING", updatedAt: new Date() })
      .where(eq(adminOrgScanAttemptsTable.id, scanId));

    if (!isOcrAvailable()) {
      const [updated] = await db.update(adminOrgScanAttemptsTable).set({
        processingStatus: "FAILED",
        rawOcrText: "OCR_NOT_CONFIGURED",
        updatedAt: new Date(),
      }).where(eq(adminOrgScanAttemptsTable.id, scanId)).returning();
      return res.json(updated);
    }

    const image = await downloadScanImage(scan.imageUrl, req.log);
    const { parsed, rawText } = await parseStorefrontImage([image]);
    const [updated] = await db.update(adminOrgScanAttemptsTable).set({
      rawOcrText: rawText,
      parsedBusinessName: parsed.businessName || null,
      confidenceScore: parsed.confidence,
      processingStatus: "PARSED",
      updatedAt: new Date(),
    }).where(eq(adminOrgScanAttemptsTable.id, scanId)).returning();

    req.log.info({ scanId, parsed }, "[MASTER-SCAN] parsed");
    return res.json(updated);
  } catch (err: any) {
    req.log.error({ err, scanId }, "[MASTER-SCAN] parse failed");
    await db.update(adminOrgScanAttemptsTable).set({
      processingStatus: "FAILED",
      rawOcrText: err.message || "UNKNOWN_ERROR",
      updatedAt: new Date(),
    }).where(eq(adminOrgScanAttemptsTable.id, scanId)).catch(() => {});
    return res.status(500).json({ error: "Parse failed", details: err.message });
  }
});

router.post("/:id/match", async (req, res) => {
  const scanId = req.params.id;
  try {
    const scan = await db.query.adminOrgScanAttemptsTable.findFirst({
      where: eq(adminOrgScanAttemptsTable.id, scanId),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      return res.status(503).json({ error: "PLACES_NOT_CONFIGURED" });
    }

    const query = ((req.body.query as string | undefined) || scan.parsedBusinessName)?.trim();
    if (!query) return res.status(400).json({ error: "No query text available. Run parse first or provide a query." });

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

    const [updated] = await db.update(adminOrgScanAttemptsTable).set({
      matchedPlaceJson: candidates,
      processingStatus: "MATCHED",
      updatedAt: new Date(),
    }).where(eq(adminOrgScanAttemptsTable.id, scanId)).returning();

    req.log.info({ scanId, candidateCount: candidates.length }, "[MASTER-SCAN] matched");
    return res.json({ scan: updated, candidates });
  } catch (err) {
    req.log.error({ err, scanId }, "[MASTER-SCAN] match failed");
    return res.status(500).json({ error: "Match failed" });
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    const adminId = req.platformAdmin!.id;
    const scan = await db.query.adminOrgScanAttemptsTable.findFirst({
      where: eq(adminOrgScanAttemptsTable.id, req.params.id),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });
    if (scan.reviewStatus === "APPROVED") {
      return res.status(409).json({ error: "Scan already approved" });
    }

    const selectedMatch = req.body.selectedMatch as {
      placeId?: string;
      name?: string;
      formattedAddress?: string;
      phoneNumber?: string;
      website?: string;
      placeCategory?: string;
      geometry?: { lat?: number; lng?: number };
    } | undefined;

    const targetMasterOrgId: string | undefined = req.body.targetMasterOrgId;

    let masterOrg: typeof masterOrganizationsTable.$inferSelect;

    if (targetMasterOrgId) {
      const [existing] = await db.select().from(masterOrganizationsTable)
        .where(eq(masterOrganizationsTable.id, targetMasterOrgId));
      if (!existing) return res.status(404).json({ error: "Target master organization not found" });

      const updatePayload: Partial<typeof masterOrganizationsTable.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (selectedMatch?.website) {
        try {
          const domain = normalizeDomain(selectedMatch.website);
          if (domain && !existing.websiteDomain) updatePayload.websiteDomain = domain;
        } catch {}
      }

      if (selectedMatch?.placeId) {
        const currentPlaceIds = (existing.placeIds as string[]) ?? [];
        if (!currentPlaceIds.includes(selectedMatch.placeId)) {
          updatePayload.placeIds = [...currentPlaceIds, selectedMatch.placeId];
        }
      }

      if (selectedMatch?.formattedAddress && !existing.headquartersAddress) {
        updatePayload.headquartersAddress = selectedMatch.formattedAddress;
      }

      const [enriched] = await db.update(masterOrganizationsTable).set(updatePayload)
        .where(eq(masterOrganizationsTable.id, targetMasterOrgId)).returning();
      masterOrg = enriched;

      req.log.info({ scanId: scan.id, masterOrgId: masterOrg.id }, "[MASTER-SCAN] enriched existing master org");
    } else {
      if (!selectedMatch?.name) {
        return res.status(400).json({ error: "selectedMatch.name is required to create a new master organization" });
      }

      const canonicalName = selectedMatch.name.trim();
      const normalizedName = normalizeOrgName(canonicalName) || canonicalName.toLowerCase();
      let websiteDomain: string | null = null;

      if (selectedMatch.website) {
        try { websiteDomain = normalizeDomain(selectedMatch.website); } catch {}
      }

      const placeIds: string[] = selectedMatch.placeId ? [selectedMatch.placeId] : [];

      const [created] = await db.insert(masterOrganizationsTable).values({
        canonicalName,
        normalizedName,
        websiteDomain,
        placeIds,
        headquartersAddress: selectedMatch.formattedAddress ?? null,
        sourceType: "LOGO_SCAN",
        sourceConfidence: scan.confidenceScore ?? 0.7,
      }).returning();
      masterOrg = created;

      req.log.info({ scanId: scan.id, masterOrgId: masterOrg.id, name: masterOrg.canonicalName }, "[MASTER-SCAN] created new master org");
    }

    const [updatedScan] = await db.update(adminOrgScanAttemptsTable).set({
      reviewStatus: "APPROVED",
      createdMasterOrgId: masterOrg.id,
      selectedMatchJson: selectedMatch ?? null,
      updatedAt: new Date(),
    }).where(eq(adminOrgScanAttemptsTable.id, scan.id)).returning();

    return res.json({ masterOrg, scan: updatedScan });
  } catch (err) {
    req.log.error({ err }, "[MASTER-SCAN] approve failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/reject", async (req, res) => {
  try {
    const [scan] = await db.update(adminOrgScanAttemptsTable).set({
      reviewStatus: "REJECTED", updatedAt: new Date(),
    }).where(eq(adminOrgScanAttemptsTable.id, req.params.id)).returning();
    if (!scan) return res.status(404).json({ error: "Not found" });
    req.log.info({ scanId: scan.id }, "[MASTER-SCAN] rejected");
    return res.json(scan);
  } catch (err) {
    req.log.error({ err }, "[MASTER-SCAN] reject failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

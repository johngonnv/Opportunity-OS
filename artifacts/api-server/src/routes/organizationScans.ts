import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  organizationScansTable, organizationsTable, activitiesTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { objectStorageClient } from "../lib/objectStorage";
import { parseStorefrontImage, isOcrAvailable } from "../lib/ocr";

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

async function downloadScanImage(objectPath: string, log: any): Promise<{ buffer: Buffer; contentType: string }> {
  if (objectPath.startsWith("/objects/")) {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    const parts = dir.startsWith("/") ? dir.slice(1).split("/") : dir.split("/");
    const bucketName = parts[0];
    const prefix = parts.slice(1).join("/");
    const entityId = objectPath.slice("/objects/".length);
    const objectName = prefix ? `${prefix}/${entityId}` : entityId;
    log.info({ bucketName, objectName }, "[ORG-SCAN] downloading image from GCS");
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
  } else {
    const imgRes = await fetch(objectPath);
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    return { buffer, contentType };
  }
}

function isPlacesAvailable(): boolean {
  return !!(process.env.GOOGLE_PLACES_API_KEY);
}

function computeConfidence(candidate: any, query: string): number {
  let score = 0;
  const nameLower = (candidate.name || "").toLowerCase();
  const queryLower = query.toLowerCase();
  if (nameLower === queryLower) score += 0.5;
  else if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) score += 0.3;
  else {
    const queryWords = queryLower.split(/\s+/).filter(Boolean);
    const matchingWords = queryWords.filter((w) => nameLower.includes(w));
    score += matchingWords.length / Math.max(queryWords.length, 1) * 0.2;
  }
  if (candidate.formatted_address) score += 0.2;
  if (candidate.website) score += 0.15;
  if (candidate.formatted_phone_number || candidate.international_phone_number) score += 0.1;
  if (candidate.opening_hours) score += 0.05;
  return Math.min(score, 1);
}

router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    req.log.info({ originalname: req.file.originalname, size: req.file.size }, "[ORG-SCAN] file received");

    const ext = req.file.mimetype.includes("png") ? "png" : "jpg";
    const objectId = crypto.randomUUID();
    const objectPath = `organization-scans/${objectId}.${ext}`;
    const { bucketName, objectName } = getGcsBucketAndPath(objectPath);

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(req.file.buffer, {
      contentType: req.file.mimetype,
      metadata: { cacheControl: "private, max-age=86400" },
    });

    const servingPath = `/objects/${objectPath}`;
    req.log.info({ servingPath }, "[ORG-SCAN] image stored in GCS");

    res.json({ objectPath: servingPath, imageUrl: servingPath });
  } catch (err) {
    req.log.error({ err }, "[ORG-SCAN] upload failed");
    res.status(500).json({ error: "Image upload failed" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const [scan] = await db.insert(organizationScansTable).values({
      workspaceId: workspace.id,
      uploadedByUserId: user.id,
      imageUrl: req.body.imageUrl,
      organizationId: req.body.organizationId || null,
      processingStatus: "UPLOADED",
      reviewStatus: "PENDING_REVIEW",
    }).returning();
    res.status(201).json(scan);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { organizationId } = req.query as Record<string, string>;

    const conditions = [eq(organizationScansTable.workspaceId, workspace.id)];
    if (organizationId) {
      conditions.push(eq(organizationScansTable.organizationId, organizationId));
    }

    const scans = await db
      .select({
        scan: organizationScansTable,
        orgName: organizationsTable.name,
      })
      .from(organizationScansTable)
      .leftJoin(organizationsTable, eq(organizationScansTable.organizationId, organizationsTable.id))
      .where(and(...conditions))
      .orderBy(desc(organizationScansTable.createdAt));

    const result = scans.map((row) => ({
      ...row.scan,
      linkedOrganizationName: row.orgName || null,
    }));

    res.json({ organizationScans: result });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [row] = await db
      .select({
        scan: organizationScansTable,
        orgName: organizationsTable.name,
        orgId: organizationsTable.id,
      })
      .from(organizationScansTable)
      .leftJoin(organizationsTable, eq(organizationScansTable.organizationId, organizationsTable.id))
      .where(and(
        eq(organizationScansTable.id, req.params.id),
        eq(organizationScansTable.workspaceId, workspace.id),
      ));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({
      ...row.scan,
      linkedOrganizationName: row.orgName || null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/parse", async (req, res) => {
  const scanId = req.params.id;
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const scan = await db.query.organizationScansTable.findFirst({
      where: and(
        eq(organizationScansTable.id, scanId),
        eq(organizationScansTable.workspaceId, workspace.id),
      ),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });

    await db.update(organizationScansTable).set({ processingStatus: "PARSING", updatedAt: new Date() })
      .where(eq(organizationScansTable.id, scanId));

    if (!isOcrAvailable()) {
      req.log.warn({ scanId }, "[ORG-SCAN] OCR not configured, setting FAILED");
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
      ocrConfidence: parsed.confidence,
      processingStatus: "PARSED",
      updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scanId)).returning();

    res.json(updated);
  } catch (err: any) {
    req.log.error({ err, scanId }, "[ORG-SCAN] parse failed");
    await db.update(organizationScansTable).set({
      processingStatus: "FAILED",
      rawOcrText: err?.message || "UNKNOWN_ERROR",
      updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scanId)).catch(() => {});
    res.status(500).json({ error: "Parse failed", details: err?.message });
  }
});

router.post("/:id/match", async (req, res) => {
  const scanId = req.params.id;
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const scan = await db.query.organizationScansTable.findFirst({
      where: and(
        eq(organizationScansTable.id, scanId),
        eq(organizationScansTable.workspaceId, workspace.id),
      ),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });

    if (!isPlacesAvailable()) {
      return res.status(503).json({
        error: "PLACES_NOT_CONFIGURED",
        message: "Google Places API key is not configured. Please add GOOGLE_PLACES_API_KEY to environment secrets.",
      });
    }

    const query = req.body.query || scan.parsedBusinessName;
    if (!query || !(query as string).trim()) {
      return res.status(400).json({ error: "No query text available. Run OCR first or provide a query in the request body." });
    }

    const { latitude, longitude } = req.body as { latitude?: number; longitude?: number };

    const params = new URLSearchParams({
      query: (query as string).trim(),
      key: process.env.GOOGLE_PLACES_API_KEY!,
    });
    if (latitude && longitude) {
      params.set("location", `${latitude},${longitude}`);
      params.set("radius", "50000");
    }

    req.log.info({ scanId, query, latitude, longitude }, "[ORG-SCAN] querying Google Places Text Search");

    const placesRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`,
    );
    if (!placesRes.ok) {
      throw new Error(`Google Places API error: ${placesRes.status}`);
    }
    const placesData = await placesRes.json() as any;

    if (placesData.status !== "OK" && placesData.status !== "ZERO_RESULTS") {
      req.log.error({ scanId, status: placesData.status, errorMessage: placesData.error_message }, "[ORG-SCAN] Places API returned non-OK status");
      return res.status(502).json({
        error: "PLACES_API_ERROR",
        message: placesData.error_message || `Google Places returned status: ${placesData.status}`,
        status: placesData.status,
      });
    }

    const raw = (placesData.results || []).slice(0, 5);
    const candidates = await Promise.all(raw.map(async (place: any) => {
      let details: any = {};
      try {
        const detailParams = new URLSearchParams({
          place_id: place.place_id,
          fields: "name,formatted_address,formatted_phone_number,international_phone_number,website,opening_hours,types",
          key: process.env.GOOGLE_PLACES_API_KEY!,
        });
        const detailRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?${detailParams.toString()}`,
        );
        if (detailRes.ok) {
          const detailData = await detailRes.json() as any;
          if (detailData.status === "OK") details = detailData.result;
        }
      } catch {
      }
      const merged = {
        placeId: place.place_id,
        name: details.name || place.name,
        formattedAddress: details.formatted_address || place.formatted_address,
        phoneNumber: details.formatted_phone_number || details.international_phone_number || null,
        website: details.website || null,
        placeCategory: (details.types || place.types || []).filter((t: string) => t !== "point_of_interest" && t !== "establishment")[0] || null,
        mapLink: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
        geometry: place.geometry?.location || null,
        confidence: computeConfidence({ ...place, ...details }, query as string),
      };
      return merged;
    }));

    candidates.sort((a, b) => b.confidence - a.confidence);

    const [updated] = await db.update(organizationScansTable).set({
      matchedPlaceJson: candidates as any,
      processingStatus: "MATCHED",
      updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scanId)).returning();

    res.json({ scan: updated, candidates });
  } catch (err: any) {
    req.log.error({ err, scanId }, "[ORG-SCAN] match failed");
    res.status(500).json({ error: "Match failed", details: err?.message });
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const scan = await db.query.organizationScansTable.findFirst({
      where: and(
        eq(organizationScansTable.id, req.params.id),
        eq(organizationScansTable.workspaceId, workspace.id),
      ),
    });
    if (!scan) return res.status(404).json({ error: "Not found" });

    const { selectedMatch, targetOrganizationId, forceFields = [] } = req.body as {
      selectedMatch?: Record<string, any>;
      targetOrganizationId?: string;
      forceFields?: string[];
    };

    let organization: typeof organizationsTable.$inferSelect;

    const fieldsFromMatch: Partial<typeof organizationsTable.$inferInsert> = {};
    if (selectedMatch) {
      if (selectedMatch.name) fieldsFromMatch.name = selectedMatch.name;
      if (selectedMatch.formattedAddress) fieldsFromMatch.formattedAddress = selectedMatch.formattedAddress;
      if (selectedMatch.phoneNumber) fieldsFromMatch.phone = selectedMatch.phoneNumber;
      if (selectedMatch.website) {
        fieldsFromMatch.website = selectedMatch.website;
        try {
          const u = new URL(selectedMatch.website);
          fieldsFromMatch.websiteDomain = u.hostname.replace(/^www\./, "");
        } catch {}
      }
      if (selectedMatch.placeId) fieldsFromMatch.googlePlaceId = selectedMatch.placeId;
      if (selectedMatch.placeCategory) fieldsFromMatch.placeCategory = selectedMatch.placeCategory;
      if (selectedMatch.geometry?.lat) fieldsFromMatch.latitude = selectedMatch.geometry.lat;
      if (selectedMatch.geometry?.lng) fieldsFromMatch.longitude = selectedMatch.geometry.lng;
    }

    if (targetOrganizationId) {
      const [existingOrg] = await db.select()
        .from(organizationsTable)
        .where(and(
          eq(organizationsTable.id, targetOrganizationId),
          eq(organizationsTable.workspaceId, workspace.id),
        ));
      if (!existingOrg) return res.status(404).json({ error: "Target organization not found" });

      const updatePayload: Partial<typeof organizationsTable.$inferInsert> = {
        lastEnrichedAt: new Date(),
        enrichmentSource: "logo_scan",
        updatedAt: new Date(),
      };

      const fieldMap: Record<string, keyof typeof organizationsTable.$inferInsert> = {
        formattedAddress: "formattedAddress",
        phone: "phone",
        website: "website",
        websiteDomain: "websiteDomain",
        googlePlaceId: "googlePlaceId",
        placeCategory: "placeCategory",
        latitude: "latitude",
        longitude: "longitude",
      };

      for (const [key, column] of Object.entries(fieldMap)) {
        const incomingVal = fieldsFromMatch[column as keyof typeof fieldsFromMatch];
        if (incomingVal === undefined || incomingVal === null) continue;
        const existingVal = existingOrg[column as keyof typeof existingOrg];
        if (!existingVal || forceFields.includes(key)) {
          (updatePayload as any)[column] = incomingVal;
        }
      }

      const [enriched] = await db.update(organizationsTable).set(updatePayload)
        .where(eq(organizationsTable.id, targetOrganizationId)).returning();
      organization = enriched;

      await db.insert(activitiesTable).values({
        workspaceId: workspace.id,
        organizationId: organization.id,
        type: "ORG_ENRICHMENT",
        subject: `Organization enriched via logo scan: ${organization.name}`,
        createdByUserId: user.id,
      });
    } else {
      if (!fieldsFromMatch.name) {
        return res.status(400).json({ error: "selectedMatch.name is required to create a new organization" });
      }
      const [created] = await db.insert(organizationsTable).values({
        workspaceId: workspace.id,
        ownerUserId: user.id,
        ...fieldsFromMatch,
        lastEnrichedAt: new Date(),
        enrichmentSource: "logo_scan",
      }).returning();
      organization = created;

      await db.insert(activitiesTable).values({
        workspaceId: workspace.id,
        organizationId: organization.id,
        type: "LOGO_SCAN",
        subject: `Organization created via logo scan: ${organization.name}`,
        createdByUserId: user.id,
      });
    }

    const [updatedScan] = await db.update(organizationScansTable).set({
      reviewStatus: "APPROVED",
      organizationId: organization.id,
      selectedMatchJson: selectedMatch as any || null,
      updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scan.id)).returning();

    res.json({ organization, scan: updatedScan });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/reject", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const [scan] = await db.update(organizationScansTable).set({
      reviewStatus: "REJECTED",
      updatedAt: new Date(),
    }).where(and(
      eq(organizationScansTable.id, req.params.id),
      eq(organizationScansTable.workspaceId, workspace.id),
    )).returning();
    if (!scan) return res.status(404).json({ error: "Not found" });
    res.json(scan);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

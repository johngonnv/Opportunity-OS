import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  organizationScansTable, organizationsTable, activitiesTable, auditLogsTable,
  masterOrganizationsTable,
} from "@workspace/db";
import { eq, and, desc, sql, ilike } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { objectStorageClient } from "../lib/objectStorage";
import { parseStorefrontImage, isOcrAvailable } from "../lib/ocr";
import { normalizeOrgName, normalizeDomain } from "../lib/orgNameNormalization";

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

async function downloadScanImageFromGcs(objectPath: string, log: ReturnType<typeof import("pino").default>): Promise<{ buffer: Buffer; contentType: string }> {
  if (!objectPath.startsWith("/objects/")) {
    throw new Error("Only /objects/ paths are permitted for image download");
  }
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
}

function isPlacesAvailable(): boolean {
  return !!(process.env.GOOGLE_PLACES_API_KEY);
}

function computeConfidence(name: string, address: string | null, website: string | null, phone: string | null, query: string): number {
  let score = 0;
  const nameLower = name.toLowerCase();
  const queryLower = query.toLowerCase();
  if (nameLower === queryLower) score += 0.5;
  else if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) score += 0.3;
  else {
    const queryWords = queryLower.split(/\s+/).filter(Boolean);
    const matchingWords = queryWords.filter((w) => nameLower.includes(w));
    score += (matchingWords.length / Math.max(queryWords.length, 1)) * 0.2;
  }
  if (address) score += 0.2;
  if (website) score += 0.15;
  if (phone) score += 0.1;
  return Math.min(score, 1);
}

interface PlaceCandidate {
  placeId: string;
  name: string;
  formattedAddress: string | null;
  phoneNumber: string | null;
  website: string | null;
  placeCategory: string | null;
  mapLink: string;
  geometry: { lat: number; lng: number } | null;
  confidence: number;
}

interface SelectedMatch {
  placeId?: string;
  name?: string;
  formattedAddress?: string;
  phoneNumber?: string;
  website?: string;
  placeCategory?: string;
  geometry?: { lat?: number; lng?: number };
  confidence?: number;
}

router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);

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

    const imageUrl = `/objects/${objectPath}`;
    req.log.info({ imageUrl }, "[ORG-SCAN] image stored in GCS");

    let organizationId: string | null = null;
    const rawOrgId = req.body.organizationId as string | undefined;
    if (rawOrgId) {
      const [org] = await db
        .select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(and(
          eq(organizationsTable.id, rawOrgId),
          eq(organizationsTable.workspaceId, workspace.id),
        ));
      if (!org) {
        return res.status(400).json({ error: "organizationId not found in this workspace" });
      }
      organizationId = org.id;
    }

    const [scan] = await db.insert(organizationScansTable).values({
      workspaceId: workspace.id,
      uploadedByUserId: user.id,
      imageUrl,
      organizationId,
      processingStatus: "UPLOADED",
      reviewStatus: "PENDING_REVIEW",
    }).returning();

    res.json({ id: scan.id, imageUrl: scan.imageUrl, scan });
  } catch (err) {
    req.log.error({ err }, "[ORG-SCAN] upload failed");
    res.status(500).json({ error: "Image upload failed" });
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

    const rows = await db
      .select({
        scan: organizationScansTable,
        orgName: organizationsTable.name,
      })
      .from(organizationScansTable)
      .leftJoin(
        organizationsTable,
        and(
          eq(organizationScansTable.organizationId, organizationsTable.id),
          eq(organizationsTable.workspaceId, workspace.id),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(organizationScansTable.createdAt));

    const result = rows.map((row) => ({
      ...row.scan,
      linkedOrganizationName: row.orgName ?? null,
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
      })
      .from(organizationScansTable)
      .leftJoin(
        organizationsTable,
        and(
          eq(organizationScansTable.organizationId, organizationsTable.id),
          eq(organizationsTable.workspaceId, workspace.id),
        ),
      )
      .where(and(
        eq(organizationScansTable.id, req.params.id),
        eq(organizationScansTable.workspaceId, workspace.id),
      ));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({
      ...row.scan,
      linkedOrganizationName: row.orgName ?? null,
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

    if (!scan.imageUrl.startsWith("/objects/")) {
      return res.status(400).json({ error: "Scan image URL is not a valid internal /objects/ path" });
    }

    await db.update(organizationScansTable)
      .set({ processingStatus: "PARSING", updatedAt: new Date() })
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

    const image = await downloadScanImageFromGcs(scan.imageUrl, req.log);
    const { parsed, rawText } = await parseStorefrontImage([image]);

    const [updated] = await db.update(organizationScansTable).set({
      rawOcrText: rawText,
      parsedBusinessName: parsed.businessName || null,
      confidenceScore: parsed.confidence,
      processingStatus: "PARSED",
      updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scanId)).returning();

    res.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    req.log.error({ err, scanId }, "[ORG-SCAN] parse failed");
    await db.update(organizationScansTable).set({
      processingStatus: "FAILED",
      rawOcrText: msg,
      updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scanId)).catch(() => {});
    res.status(500).json({ error: "Parse failed", details: msg });
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

    const rawQuery = (req.body.query as string | undefined) || scan.parsedBusinessName;
    if (!rawQuery?.trim()) {
      return res.status(400).json({
        error: "No query text available. Run OCR first or provide a query in the request body.",
      });
    }
    const query = rawQuery.trim();

    const latitude = typeof req.body.latitude === "number" ? req.body.latitude : null;
    const longitude = typeof req.body.longitude === "number" ? req.body.longitude : null;

    req.log.info({ scanId, query, latitude, longitude }, "[ORG-SCAN] querying Google Places Text Search (New API v1)");

    const searchBody: {
      textQuery: string;
      maxResultCount: number;
      locationBias?: { circle: { center: { latitude: number; longitude: number }; radius: number } };
    } = {
      textQuery: query,
      maxResultCount: 5,
    };
    if (latitude !== null && longitude !== null) {
      searchBody.locationBias = {
        circle: { center: { latitude, longitude }, radius: 50000.0 },
      };
    }

    const placesRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.primaryType,places.location",
      },
      body: JSON.stringify(searchBody),
    });

    if (!placesRes.ok) {
      const errBody = await placesRes.json().catch(() => ({ error: { message: "Unknown error" } })) as { error?: { message?: string } };
      req.log.error({ scanId, status: placesRes.status, errBody }, "[ORG-SCAN] Places API (New) error");
      return res.status(502).json({
        error: "PLACES_API_ERROR",
        message: errBody?.error?.message ?? `Google Places returned HTTP ${placesRes.status}`,
      });
    }

    const placesData = await placesRes.json() as { places?: Array<{
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      internationalPhoneNumber?: string;
      websiteUri?: string;
      primaryType?: string;
      location?: { latitude: number; longitude: number };
    }> };

    const raw = (placesData.places ?? []).slice(0, 5);

    const candidates: PlaceCandidate[] = raw.map((place) => {
      const name = place.displayName?.text ?? "";
      const formattedAddress = place.formattedAddress ?? null;
      const phoneNumber = place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null;
      const website = place.websiteUri ?? null;
      return {
        placeId: place.id,
        name,
        formattedAddress,
        phoneNumber,
        website,
        placeCategory: place.primaryType ?? null,
        mapLink: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        geometry: place.location
          ? { lat: place.location.latitude, lng: place.location.longitude }
          : null,
        confidence: computeConfidence(name, formattedAddress, website, phoneNumber, query),
      };
    });

    candidates.sort((a, b) => b.confidence - a.confidence);

    const [updated] = await db.update(organizationScansTable).set({
      matchedPlaceJson: candidates,
      processingStatus: "MATCHED",
      updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scanId)).returning();

    res.json({ scan: updated, candidates });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    req.log.error({ err, scanId }, "[ORG-SCAN] match failed");
    res.status(500).json({ error: "Match failed", details: msg });
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

    const selectedMatch: SelectedMatch | undefined = req.body.selectedMatch;
    const targetOrganizationId: string | undefined = req.body.targetOrganizationId;
    const forceFields: string[] = Array.isArray(req.body.forceFields) ? req.body.forceFields : [];

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
        } catch {
        }
      }
      if (selectedMatch.placeId) fieldsFromMatch.googlePlaceId = selectedMatch.placeId;
      if (selectedMatch.placeCategory) fieldsFromMatch.placeCategory = selectedMatch.placeCategory;
      if (selectedMatch.geometry?.lat != null) fieldsFromMatch.latitude = selectedMatch.geometry.lat;
      if (selectedMatch.geometry?.lng != null) fieldsFromMatch.longitude = selectedMatch.geometry.lng;
    }

    let organization: typeof organizationsTable.$inferSelect;

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

      const fieldMap: Array<[string, keyof typeof organizationsTable.$inferInsert]> = [
        ["formattedAddress", "formattedAddress"],
        ["phone", "phone"],
        ["website", "website"],
        ["websiteDomain", "websiteDomain"],
        ["googlePlaceId", "googlePlaceId"],
        ["placeCategory", "placeCategory"],
        ["latitude", "latitude"],
        ["longitude", "longitude"],
      ];

      for (const [key, column] of fieldMap) {
        const incomingVal = fieldsFromMatch[column];
        if (incomingVal == null) continue;
        const existingVal = existingOrg[column as keyof typeof existingOrg];
        if (!existingVal || forceFields.includes(key)) {
          (updatePayload as Record<string, unknown>)[column] = incomingVal;
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

      await db.insert(auditLogsTable).values({
        workspaceId: workspace.id,
        userId: user.id,
        entityType: "organization",
        entityId: organization.id,
        action: "ORG_ENRICHMENT_VIA_LOGO_SCAN",
        beforeJson: {
          id: existingOrg.id,
          googlePlaceId: existingOrg.googlePlaceId,
          formattedAddress: existingOrg.formattedAddress,
          enrichmentSource: existingOrg.enrichmentSource,
        },
        afterJson: {
          id: organization.id,
          googlePlaceId: organization.googlePlaceId,
          formattedAddress: organization.formattedAddress,
          enrichmentSource: "logo_scan",
        },
      });
    } else {
      if (!fieldsFromMatch.name) {
        return res.status(400).json({ error: "selectedMatch.name is required to create a new organization" });
      }

      // Dedup: check for an existing org with the same name in this workspace before creating
      const [existingByName] = await db.select()
        .from(organizationsTable)
        .where(and(
          eq(organizationsTable.workspaceId, workspace.id),
          ilike(organizationsTable.name, fieldsFromMatch.name.trim()),
        ))
        .limit(1);

      if (existingByName) {
        // Enrich the existing org instead of creating a duplicate
        const updatePayload: Partial<typeof organizationsTable.$inferInsert> = {
          lastEnrichedAt: new Date(),
          enrichmentSource: "logo_scan",
          updatedAt: new Date(),
        };
        const enrichFields: Array<keyof typeof organizationsTable.$inferInsert> = [
          "formattedAddress", "phone", "website", "websiteDomain",
          "googlePlaceId", "placeCategory", "latitude", "longitude",
        ];
        for (const col of enrichFields) {
          const incomingVal = fieldsFromMatch[col];
          if (incomingVal == null) continue;
          if (!existingByName[col as keyof typeof existingByName]) {
            (updatePayload as Record<string, unknown>)[col] = incomingVal;
          }
        }
        const [enriched] = await db.update(organizationsTable).set(updatePayload)
          .where(eq(organizationsTable.id, existingByName.id)).returning();
        organization = enriched;

        await db.insert(activitiesTable).values({
          workspaceId: workspace.id,
          organizationId: organization.id,
          type: "ORG_ENRICHMENT",
          subject: `Organization enriched via logo scan (existing match): ${organization.name}`,
          createdByUserId: user.id,
        });

        await db.insert(auditLogsTable).values({
          workspaceId: workspace.id,
          userId: user.id,
          entityType: "organization",
          entityId: organization.id,
          action: "ORG_ENRICHMENT_VIA_LOGO_SCAN",
          beforeJson: { id: existingByName.id, enrichmentSource: existingByName.enrichmentSource },
          afterJson: { id: organization.id, enrichmentSource: "logo_scan", matchedByName: true },
        });
      } else {
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

        await db.insert(auditLogsTable).values({
          workspaceId: workspace.id,
          userId: user.id,
          entityType: "organization",
          entityId: organization.id,
          action: "ORG_CREATED_VIA_LOGO_SCAN",
          beforeJson: null,
          afterJson: {
            id: organization.id,
            name: organization.name,
            googlePlaceId: organization.googlePlaceId,
            enrichmentSource: "logo_scan",
          },
        });
      }
    }

    const [updatedScan] = await db.update(organizationScansTable).set({
      reviewStatus: "APPROVED",
      organizationId: organization.id,
      selectedMatchJson: selectedMatch ?? null,
      updatedAt: new Date(),
    }).where(eq(organizationScansTable.id, scan.id)).returning();

    res.json({ organization, scan: updatedScan });

    enrichMasterOrgSilently(organization, selectedMatch, req.log).catch(() => {});
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function enrichMasterOrgSilently(
  organization: typeof organizationsTable.$inferSelect,
  selectedMatch: SelectedMatch | undefined,
  log: any,
): Promise<void> {
  try {
    const confidence: number = selectedMatch?.confidence
      ?? (selectedMatch
        ? computeConfidence(
            selectedMatch.name ?? organization.name,
            selectedMatch.formattedAddress ?? null,
            selectedMatch.website ?? null,
            selectedMatch.phoneNumber ?? null,
            organization.name,
          )
        : 0);

    const domain = organization.websiteDomain
      ? normalizeDomain(organization.websiteDomain)
      : (selectedMatch?.website ? normalizeDomain(selectedMatch.website) : null);

    let masterOrgId: string | null = organization.masterOrganizationId ?? null;

    if (masterOrgId) {
      const [masterOrg] = await db.select()
        .from(masterOrganizationsTable)
        .where(eq(masterOrganizationsTable.id, masterOrgId));
      if (!masterOrg) {
        masterOrgId = null;
      } else {
        const updates: Partial<typeof masterOrganizationsTable.$inferInsert> = { updatedAt: new Date() };
        let hasUpdates = false;
        if (selectedMatch?.placeId) {
          const currentPlaceIds = (masterOrg.placeIds as string[]) ?? [];
          if (!currentPlaceIds.includes(selectedMatch.placeId)) {
            updates.placeIds = [...currentPlaceIds, selectedMatch.placeId];
            hasUpdates = true;
          }
        }
        if (domain && !masterOrg.websiteDomain) { updates.websiteDomain = domain; hasUpdates = true; }
        if (organization.formattedAddress && !masterOrg.headquartersAddress) {
          updates.headquartersAddress = organization.formattedAddress;
          hasUpdates = true;
        }
        if (hasUpdates) {
          await db.update(masterOrganizationsTable).set(updates).where(eq(masterOrganizationsTable.id, masterOrgId));
          log.info({ masterOrgId, orgId: organization.id }, "[ORG-SCAN] silently enriched linked master org");
        }
        return;
      }
    }

    if (!organization.name) return;
    const normalized = normalizeOrgName(organization.name);

    let foundMasterOrgId: string | null = null;

    if (selectedMatch?.placeId) {
      const byPlaceId = await db.execute<{ id: string }>(sql`
        SELECT id FROM master_organizations WHERE place_ids @> ${JSON.stringify([selectedMatch.placeId])}::jsonb LIMIT 1
      `);
      if (byPlaceId.rows.length > 0) foundMasterOrgId = byPlaceId.rows[0].id;
    }

    if (!foundMasterOrgId) {
      const byName = await db.execute<{ id: string }>(sql`
        SELECT id FROM master_organizations
        WHERE lower(canonical_name) = lower(${organization.name})
           OR normalized_name = ${normalized ?? organization.name.toLowerCase()}
           OR (${domain ?? null} IS NOT NULL AND website_domain = ${domain ?? ""})
        LIMIT 1
      `);
      if (byName.rows.length > 0) foundMasterOrgId = byName.rows[0].id;
    }

    if (foundMasterOrgId) {
      const [masterOrg] = await db.select().from(masterOrganizationsTable)
        .where(eq(masterOrganizationsTable.id, foundMasterOrgId));
      if (masterOrg) {
        const updates: Partial<typeof masterOrganizationsTable.$inferInsert> = { updatedAt: new Date() };
        let hasUpdates = false;
        if (selectedMatch?.placeId) {
          const currentPlaceIds = (masterOrg.placeIds as string[]) ?? [];
          if (!currentPlaceIds.includes(selectedMatch.placeId)) {
            updates.placeIds = [...currentPlaceIds, selectedMatch.placeId];
            hasUpdates = true;
          }
        }
        if (domain && !masterOrg.websiteDomain) { updates.websiteDomain = domain; hasUpdates = true; }
        if (organization.formattedAddress && !masterOrg.headquartersAddress) {
          updates.headquartersAddress = organization.formattedAddress;
          hasUpdates = true;
        }
        if (hasUpdates) {
          await db.update(masterOrganizationsTable).set(updates).where(eq(masterOrganizationsTable.id, foundMasterOrgId));
        }
        await db.update(organizationsTable).set({ masterOrganizationId: foundMasterOrgId, updatedAt: new Date() })
          .where(eq(organizationsTable.id, organization.id));
        log.info({ masterOrgId: foundMasterOrgId, orgId: organization.id }, "[ORG-SCAN] silently linked and enriched matched master org");
      }
      return;
    }

    if (confidence < 0.4) {
      log.info({ orgId: organization.id, confidence }, "[ORG-SCAN] confidence too low for new master org creation, skipping");
      return;
    }

    if (!selectedMatch?.placeId) return;

    const [newMasterOrg] = await db.insert(masterOrganizationsTable).values({
      canonicalName: organization.name,
      normalizedName: normalized || organization.name.toLowerCase(),
      websiteDomain: domain,
      placeIds: [selectedMatch.placeId],
      headquartersAddress: organization.formattedAddress ?? selectedMatch.formattedAddress ?? null,
      sourceType: "WORKSPACE_LOGO_SCAN",
      sourceConfidence: confidence,
    }).returning();

    await db.update(organizationsTable).set({ masterOrganizationId: newMasterOrg.id, updatedAt: new Date() })
      .where(eq(organizationsTable.id, organization.id));

    log.info({ masterOrgId: newMasterOrg.id, orgId: organization.id, confidence }, "[ORG-SCAN] created and linked new master org from workspace logo scan");
  } catch (err) {
    log.warn({ err }, "[ORG-SCAN] silent master org enrichment failed (non-fatal)");
  }
}

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

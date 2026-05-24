import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getObjectAclPolicy, setObjectAclPolicy } from "../lib/objectAcl";
import { db } from "@workspace/db";
import { businessCardsTable, organizationScansTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

async function resolveWorkspaceForLegacyObject(
  objectPath: string,
  workspaceId: string,
): Promise<{ allowed: boolean; uploadedByUserId?: string }> {
  const prefix = objectPath.startsWith("/objects/") ? objectPath.slice("/objects/".length) : "";

  if (prefix.startsWith("business-cards/")) {
    const [card] = await db
      .select({ id: businessCardsTable.id, uploadedByUserId: businessCardsTable.uploadedByUserId })
      .from(businessCardsTable)
      .where(
        and(
          eq(businessCardsTable.workspaceId, workspaceId),
          eq(businessCardsTable.imageUrlFront, objectPath),
        ),
      )
      .limit(1);
    if (card) {
      return { allowed: true, uploadedByUserId: card.uploadedByUserId ?? undefined };
    }
    const [cardBack] = await db
      .select({ id: businessCardsTable.id, uploadedByUserId: businessCardsTable.uploadedByUserId })
      .from(businessCardsTable)
      .where(
        and(
          eq(businessCardsTable.workspaceId, workspaceId),
          eq(businessCardsTable.imageUrlBack, objectPath),
        ),
      )
      .limit(1);
    if (cardBack) {
      return { allowed: true, uploadedByUserId: cardBack.uploadedByUserId ?? undefined };
    }
  }

  if (prefix.startsWith("organization-scans/")) {
    const [scan] = await db
      .select({ id: organizationScansTable.id, uploadedByUserId: organizationScansTable.uploadedByUserId })
      .from(organizationScansTable)
      .where(
        and(
          eq(organizationScansTable.imageUrl, objectPath),
          eq(organizationScansTable.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (scan) {
      return { allowed: true, uploadedByUserId: scan.uploadedByUserId ?? undefined };
    }
  }

  return { allowed: false };
}

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const authWorkspaceId = req.authWorkspace!.id;
    const authUserId = req.authUser!.id;

    const aclPolicy = await getObjectAclPolicy(objectFile);

    if (aclPolicy) {
      if (aclPolicy.workspaceId) {
        if (aclPolicy.workspaceId !== authWorkspaceId) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      } else {
        const canAccess = await objectStorageService.canAccessObjectEntity({
          userId: authUserId,
          objectFile,
        });
        if (!canAccess) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }
    } else {
      const { allowed, uploadedByUserId } = await resolveWorkspaceForLegacyObject(
        objectPath,
        authWorkspaceId,
      );
      if (!allowed) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      setObjectAclPolicy(objectFile, {
        owner: uploadedByUserId ?? authUserId,
        workspaceId: authWorkspaceId,
        visibility: "private",
      }).catch(() => {});
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value: string, key: string) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;

import { db } from "@workspace/db";
import { masterPromotionQueueTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export type PromotionEntityType = "ORG" | "CONTACT" | "NOTE";
export type PromotionChangeType = "CREATED" | "UPDATED" | "NOTE_ADDED";

export async function enqueuePromotion(
  entityType: PromotionEntityType,
  entityId: string,
  workspaceId: string,
  changeType: PromotionChangeType,
  snapshot: Record<string, unknown>
): Promise<void> {
  try {
    const existing = await db
      .select({ id: masterPromotionQueueTable.id })
      .from(masterPromotionQueueTable)
      .where(
        and(
          eq(masterPromotionQueueTable.entityType, entityType),
          eq(masterPromotionQueueTable.entityId, entityId),
          eq(masterPromotionQueueTable.status, "PENDING")
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(masterPromotionQueueTable)
        .set({
          changeType,
          sourceSnapshot: snapshot,
          updatedAt: new Date(),
        })
        .where(eq(masterPromotionQueueTable.id, existing[0].id));
    } else {
      await db.insert(masterPromotionQueueTable).values({
        id: crypto.randomUUID(),
        entityType,
        entityId,
        workspaceId,
        changeType,
        status: "PENDING",
        sourceSnapshot: snapshot,
      });
    }
  } catch (err) {
    console.error("[PROMOTION-QUEUE] Failed to enqueue promotion", { entityType, entityId, err });
  }
}

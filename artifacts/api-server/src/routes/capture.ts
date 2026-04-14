import { Router } from "express";
import { db } from "@workspace/db";
import {
  contactsTable, organizationsTable, activitiesTable, opportunitiesTable,
  pipelinesTable, pipelineStagesTable, opportunityContactsTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { normalizeCapture, findDuplicate } from "../lib/captureNormalize";

const router = Router();

const PLAY_TITLES: Record<string, string> = {
  OPEN_ACCOUNT: "Open Account",
  GROW_ACCOUNT: "Grow Account",
  DISPLACE_VENDOR: "Displace Vendor",
  PURSUE_CONTRACT: "Pursue Contract",
};

router.post("/normalize", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { name, firstName, lastName, phone, email } = req.body as Record<string, string>;
    const normalized = normalizeCapture({ name, firstName, lastName, phone, email });
    const duplicate = await findDuplicate(workspace.id, normalized);
    res.json({ normalized, duplicate });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/contact", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);

    const {
      contact: rawContact,
      org: rawOrg,
      phoneType,
      playType,
      isIndependent,
      force,
      mergeWithContactId,
    } = req.body as {
      contact: {
        firstName?: string;
        lastName?: string;
        fullName?: string;
        phone?: string;
        email?: string;
        title?: string;
        linkedinUrl?: string;
        department?: string;
        source?: string;
      };
      org?: {
        id?: string;
        name?: string;
        organizationType?: string;
        website?: string;
      };
      phoneType?: "work" | "personal";
      playType?: "OPEN_ACCOUNT" | "GROW_ACCOUNT" | "DISPLACE_VENDOR" | "PURSUE_CONTRACT";
      isIndependent?: boolean;
      force?: boolean;
      mergeWithContactId?: string;
    };

    const normalized = normalizeCapture(rawContact);

    if (!force && !mergeWithContactId) {
      const dup = await findDuplicate(workspace.id, normalized);
      if (dup) {
        return res.status(409).json({
          message: `A contact named "${dup.fullName}" already exists with the same ${dup.matchReason}. View the existing record or save as new.`,
          existing: dup,
        });
      }
    }

    if (mergeWithContactId) {
      const [existing] = await db
        .select()
        .from(contactsTable)
        .where(and(eq(contactsTable.id, mergeWithContactId), eq(contactsTable.workspaceId, workspace.id)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Target contact not found" });
      }

      const updates: Record<string, unknown> = {};
      if (normalized.phone && !existing.phone) updates.phone = normalized.phone;
      if (normalized.email && !existing.email) updates.email = normalized.email;
      if (phoneType && !existing.phoneType) updates.phoneType = phoneType;

      if (Object.keys(updates).length > 0) {
        await db.update(contactsTable).set(updates).where(eq(contactsTable.id, mergeWithContactId));
      }

      await db.insert(activitiesTable).values({
        workspaceId: workspace.id,
        contactId: mergeWithContactId,
        type: "INTRO",
        subject: "Captured via Unified Capture (merged)",
        notes: `Merged capture — source: ${rawContact.source || "capture"}`,
        occurredAt: new Date(),
        createdByUserId: user.id,
      });

      const [updated] = await db
        .select()
        .from(contactsTable)
        .where(eq(contactsTable.id, mergeWithContactId))
        .limit(1);

      return res.json({ contact: updated, merged: true });
    }

    if (!rawOrg?.id && !rawOrg?.name && !isIndependent) {
      return res.status(422).json({
        error: "Organization required. Select an existing org, provide a new org name, or set isIndependent=true.",
      });
    }

    if (rawContact.phone && !phoneType) {
      return res.status(422).json({
        error: "Phone type required. Label the phone number as 'work' or 'personal' before saving.",
      });
    }

    const activityType = rawContact.source === "CARD_SCAN" ? "CARD_SCAN" : "INTRO";

    let organizationId: string | null = null;
    let createdOrg: typeof organizationsTable.$inferSelect | null = null;

    if (rawOrg?.id) {
      const [orgCheck] = await db
        .select({ id: organizationsTable.id })
        .from(organizationsTable)
        .where(and(eq(organizationsTable.id, rawOrg.id), eq(organizationsTable.workspaceId, workspace.id)))
        .limit(1);

      if (!orgCheck) {
        return res.status(403).json({ error: "Organization not found in this workspace" });
      }
      organizationId = rawOrg.id;
    } else if (rawOrg?.name && !isIndependent) {
      const [newOrg] = await db
        .insert(organizationsTable)
        .values({
          workspaceId: workspace.id,
          name: rawOrg.name,
          organizationType: (rawOrg.organizationType as typeof organizationsTable.$inferSelect["organizationType"]) || "OTHER",
          website: rawOrg.website || null,
        })
        .returning();
      organizationId = newOrg.id;
      createdOrg = newOrg;
    }

    const [contact] = await db
      .insert(contactsTable)
      .values({
        workspaceId: workspace.id,
        firstName: normalized.firstName || null,
        lastName: normalized.lastName || null,
        fullName: normalized.fullName,
        phone: normalized.phone || null,
        email: normalized.email || null,
        title: rawContact.title || null,
        linkedinUrl: rawContact.linkedinUrl || null,
        department: rawContact.department || null,
        source: rawContact.source || "CAPTURE",
        organizationId,
        phoneType: phoneType || null,
        isIndependent: isIndependent ?? false,
        status: "NEW",
        ownerUserId: user.id,
      })
      .returning();

    await db.insert(activitiesTable).values({
      workspaceId: workspace.id,
      contactId: contact.id,
      organizationId: organizationId || undefined,
      type: activityType,
      subject: activityType === "CARD_SCAN" ? "Business card scanned" : "Contact captured",
      notes: `Captured via Unified Capture — source: ${rawContact.source || "CAPTURE"}`,
      occurredAt: new Date(),
      createdByUserId: user.id,
    });

    let createdOpportunity: typeof opportunitiesTable.$inferSelect | null = null;

    if (playType && organizationId) {
      const [orgRow] = await db
        .select({ name: organizationsTable.name })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, organizationId))
        .limit(1);

      const orgName = orgRow?.name || "Organization";

      const [pipeline] = await db
        .select({ id: pipelinesTable.id })
        .from(pipelinesTable)
        .where(eq(pipelinesTable.workspaceId, workspace.id))
        .limit(1);

      if (pipeline) {
        const [stage] = await db
          .select({ id: pipelineStagesTable.id })
          .from(pipelineStagesTable)
          .where(eq(pipelineStagesTable.pipelineId, pipeline.id))
          .orderBy(asc(pipelineStagesTable.stageOrder))
          .limit(1);

        if (stage) {
          const [opp] = await db
            .insert(opportunitiesTable)
            .values({
              workspaceId: workspace.id,
              pipelineId: pipeline.id,
              pipelineStageId: stage.id,
              organizationId,
              primaryContactId: contact.id,
              title: `${PLAY_TITLES[playType] || playType} — ${orgName}`,
              source: "CAPTURE",
              status: "OPEN",
            })
            .returning();

          createdOpportunity = opp;

          await db.insert(opportunityContactsTable).values({
            opportunityId: opp.id,
            contactId: contact.id,
            relationshipRole: "PRIMARY",
          }).onConflictDoNothing();

          await db.insert(activitiesTable).values({
            workspaceId: workspace.id,
            contactId: contact.id,
            organizationId,
            opportunityId: opp.id,
            type: "INTRO",
            subject: `Capture: ${PLAY_TITLES[playType] || playType} selected`,
            notes: `Intro play scaffolded from Unified Capture`,
            occurredAt: new Date(),
            createdByUserId: user.id,
          });
        }
      }
    }

    res.status(201).json({
      contact,
      organization: createdOrg,
      opportunity: createdOpportunity,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/play", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);

    const { contactId, playType } = req.body as {
      contactId: string;
      playType: "OPEN_ACCOUNT" | "GROW_ACCOUNT" | "DISPLACE_VENDOR" | "PURSUE_CONTRACT";
    };

    if (!contactId || !playType) {
      return res.status(400).json({ error: "contactId and playType are required" });
    }

    const [contact] = await db
      .select({ id: contactsTable.id, organizationId: contactsTable.organizationId, fullName: contactsTable.fullName })
      .from(contactsTable)
      .where(and(eq(contactsTable.id, contactId), eq(contactsTable.workspaceId, workspace.id)))
      .limit(1);

    if (!contact) return res.status(404).json({ error: "Contact not found" });
    if (!contact.organizationId) return res.status(400).json({ error: "Contact must have an organization to start a play" });

    const [orgRow] = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, contact.organizationId))
      .limit(1);

    const orgName = orgRow?.name || "Organization";

    const [pipeline] = await db
      .select({ id: pipelinesTable.id })
      .from(pipelinesTable)
      .where(eq(pipelinesTable.workspaceId, workspace.id))
      .limit(1);

    if (!pipeline) return res.status(400).json({ error: "No pipeline found for this workspace" });

    const [stage] = await db
      .select({ id: pipelineStagesTable.id })
      .from(pipelineStagesTable)
      .where(eq(pipelineStagesTable.pipelineId, pipeline.id))
      .orderBy(asc(pipelineStagesTable.stageOrder))
      .limit(1);

    if (!stage) return res.status(400).json({ error: "No pipeline stages found" });

    const [opp] = await db
      .insert(opportunitiesTable)
      .values({
        workspaceId: workspace.id,
        pipelineId: pipeline.id,
        pipelineStageId: stage.id,
        organizationId: contact.organizationId,
        primaryContactId: contact.id,
        title: `${PLAY_TITLES[playType] || playType} — ${orgName}`,
        source: "CAPTURE",
        status: "OPEN",
      })
      .returning();

    await db.insert(opportunityContactsTable).values({
      opportunityId: opp.id,
      contactId: contact.id,
      relationshipRole: "PRIMARY",
    }).onConflictDoNothing();

    await db.insert(activitiesTable).values({
      workspaceId: workspace.id,
      contactId: contact.id,
      organizationId: contact.organizationId,
      opportunityId: opp.id,
      type: "INTRO",
      subject: `Capture: ${PLAY_TITLES[playType] || playType} selected`,
      notes: `Play scaffolded from Unified Capture`,
      occurredAt: new Date(),
      createdByUserId: user.id,
    });

    res.status(201).json({ opportunity: opp });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

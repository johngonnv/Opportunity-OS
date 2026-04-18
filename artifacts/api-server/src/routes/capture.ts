import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  contactsTable, organizationsTable, activitiesTable, opportunitiesTable,
  pipelinesTable, pipelineStagesTable, opportunityContactsTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { normalizeCapture, findDuplicate } from "../lib/captureNormalize";
import { syncContactChannels } from "../lib/contactIdentity";

const router = Router();

const PhoneTypeEnum = z.enum(["work", "personal"]);
const PlayTypeEnum = z.enum(["OPEN_ACCOUNT", "GROW_ACCOUNT", "DISPLACE_VENDOR", "PURSUE_CONTRACT"]);

const CaptureContactSchema = z.object({
  contact: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    fullName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    title: z.string().optional(),
    linkedinUrl: z.string().optional(),
    department: z.string().optional(),
    notes: z.string().optional(),
    source: z.string().optional(),
  }),
  org: z.union([
    z.object({ id: z.string() }),
    z.object({ name: z.string(), organizationType: z.string().optional() }),
  ]).optional(),
  phoneType: PhoneTypeEnum.optional(),
  isIndependent: z.boolean().optional(),
  force: z.boolean().optional(),
  mergeWithContactId: z.string().optional(),
  playType: PlayTypeEnum.optional(),
});

const CapturePlaySchema = z.object({
  contactId: z.string().min(1),
  playType: PlayTypeEnum,
});


const CaptureNormalizeSchema = z.object({
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});

const PLAY_TITLES: Record<string, string> = {
  OPEN_ACCOUNT: "Open Account",
  GROW_ACCOUNT: "Grow Account",
  DISPLACE_VENDOR: "Displace Vendor",
  PURSUE_CONTRACT: "Pursue Contract",
};

router.post("/normalize", async (req, res) => {
  try {
    const parsed = CaptureNormalizeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "Invalid request", issues: parsed.error.issues });
    }
    const { workspace } = await getCurrentWorkspace(req);
    const { name, firstName, lastName, phone, email } = parsed.data;
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

    const parsed = CaptureContactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "Invalid request", issues: parsed.error.issues });
    }

    const {
      contact: rawContact,
      org: rawOrg,
      phoneType,
      playType,
      isIndependent,
      force,
      mergeWithContactId,
    } = parsed.data;

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
        description: `Merged capture — source: ${rawContact.source || "capture"}`,
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

    if (isIndependent && (rawOrg?.id || rawOrg?.name)) {
      return res.status(422).json({
        error: "Conflicting org assignment. Cannot set isIndependent=true and provide an organization at the same time.",
      });
    }

    if (playType && isIndependent) {
      return res.status(422).json({
        error: "Play requires an organization. Cannot start a play for an independent contact with no org.",
      });
    }

    if (rawContact.phone && !phoneType) {
      return res.status(422).json({
        error: "Phone type required. Label the phone number as 'work' or 'personal' before saving.",
      });
    }

    if (playType) {
      const [pipelineCheck] = await db
        .select({ id: pipelinesTable.id })
        .from(pipelinesTable)
        .where(eq(pipelinesTable.workspaceId, workspace.id))
        .limit(1);
      if (!pipelineCheck) {
        return res.status(422).json({
          error: "PLAY_PREREQUISITES_MISSING",
          message: "No pipeline found in this workspace. Create a pipeline before selecting a play.",
        });
      }
      const [stageCheck] = await db
        .select({ id: pipelineStagesTable.id })
        .from(pipelineStagesTable)
        .where(eq(pipelineStagesTable.pipelineId, pipelineCheck.id))
        .orderBy(asc(pipelineStagesTable.stageOrder))
        .limit(1);
      if (!stageCheck) {
        return res.status(422).json({
          error: "PLAY_PREREQUISITES_MISSING",
          message: "No pipeline stages found. Add at least one stage before selecting a play.",
        });
      }
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
        notesText: rawContact.notes || null,
        source: rawContact.source || "CAPTURE",
        organizationId,
        phoneType: phoneType || null,
        isIndependent: isIndependent ?? false,
        status: "NEW",
        ownerUserId: user.id,
      })
      .returning();

    await syncContactChannels({
      contactId: contact.id,
      email: contact.email,
      phone: contact.phone,
      mobile: contact.mobile,
      emailLabel: "WORK",
      phoneLabel: contact.phoneType === "personal" ? "PERSONAL" : "WORK",
    });

    await db.insert(activitiesTable).values({
      workspaceId: workspace.id,
      contactId: contact.id,
      organizationId: organizationId || undefined,
      type: activityType,
      subject: activityType === "CARD_SCAN" ? "Business card scanned" : "Contact captured",
      description: `Captured via Unified Capture — source: ${rawContact.source || "CAPTURE"}`,
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
            description: `Intro play scaffolded from Unified Capture`,
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

// ── normalize-batch ───────────────────────────────────────────────────────────

const NormalizeBatchSchema = z.object({
  contacts: z.array(
    z.object({
      name: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
    }),
  ).min(1).max(300),
});

router.post("/normalize-batch", async (req, res) => {
  try {
    const parsed = NormalizeBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "Invalid request", issues: parsed.error.issues });
    }
    const { workspace } = await getCurrentWorkspace(req);

    const results = await Promise.all(
      parsed.data.contacts.map(async (raw, index) => {
        const normalized = normalizeCapture(raw);
        const duplicate = await findDuplicate(workspace.id, normalized);
        const status: "ready" | "duplicate" | "needs_review" =
          duplicate ? "duplicate"
          : normalized.fullName === "Unknown" ? "needs_review"
          : "ready";
        return { index, normalized, duplicate: duplicate ?? null, status };
      }),
    );

    res.json({ results });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── contacts-batch ────────────────────────────────────────────────────────────

const BatchContactItemSchema = z.object({
  contact: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    fullName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    title: z.string().optional(),
    source: z.string().optional(),
  }),
  org: z.union([
    z.object({ id: z.string() }),
    z.object({ name: z.string() }),
  ]).optional(),
  phoneType: PhoneTypeEnum.optional(),
  isIndependent: z.boolean().optional(),
  force: z.boolean().optional(),
});

const ContactsBatchSchema = z.object({
  contacts: z.array(BatchContactItemSchema).min(1).max(300),
});

router.post("/contacts-batch", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);

    const parsed = ContactsBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "Invalid request", issues: parsed.error.issues });
    }

    // Pre-cache org names created in this batch (avoid duplicate org creation)
    const newOrgNames = new Map<string, string>(); // lower-name → org id

    const results: Array<{
      index: number;
      status: "created" | "skipped" | "error";
      contactId?: string;
      error?: string;
    }> = [];

    // Run all inserts in a single transaction; per-row validation errors push to
    // results without throwing so successful rows still commit together.
    await db.transaction(async (tx) => {
      for (let i = 0; i < parsed.data.contacts.length; i++) {
        const { contact: rawContact, org: rawOrg, phoneType, isIndependent, force } = parsed.data.contacts[i];

        try {
          // ── Invariant validation ────────────────────────────────────────
          if (!rawOrg && !isIndependent) {
            results.push({ index: i, status: "error", error: "org required; set isIndependent=true or provide an org" });
            continue;
          }
          if (isIndependent && rawOrg) {
            results.push({ index: i, status: "error", error: "conflicting org assignment: cannot set isIndependent and provide org simultaneously" });
            continue;
          }
          if (rawContact.phone && !phoneType) {
            results.push({ index: i, status: "error", error: "phone type required when phone is provided" });
            continue;
          }

          const normalized = normalizeCapture(rawContact);

          if (!force) {
            const dup = await findDuplicate(workspace.id, normalized);
            if (dup) {
              results.push({ index: i, status: "skipped", error: `Duplicate: ${dup.fullName}` });
              continue;
            }
          }

          let organizationId: string | null = null;

          if (rawOrg && "id" in rawOrg) {
            // ── Workspace authorization check for org.id ─────────────────
            const [orgCheck] = await tx
              .select({ id: organizationsTable.id })
              .from(organizationsTable)
              .where(and(eq(organizationsTable.id, rawOrg.id), eq(organizationsTable.workspaceId, workspace.id)))
              .limit(1);
            if (!orgCheck) {
              results.push({ index: i, status: "error", error: "Organization not found in this workspace" });
              continue;
            }
            organizationId = rawOrg.id;
          } else if (rawOrg && "name" in rawOrg && !isIndependent) {
            const lower = rawOrg.name.toLowerCase().trim();
            if (newOrgNames.has(lower)) {
              organizationId = newOrgNames.get(lower)!;
            } else {
              const [newOrg] = await tx
                .insert(organizationsTable)
                .values({ workspaceId: workspace.id, name: rawOrg.name, organizationType: "OTHER" })
                .returning();
              organizationId = newOrg.id;
              newOrgNames.set(lower, newOrg.id);
            }
          }

          const [contact] = await tx
            .insert(contactsTable)
            .values({
              workspaceId: workspace.id,
              firstName: normalized.firstName || null,
              lastName: normalized.lastName || null,
              fullName: normalized.fullName,
              phone: normalized.phone || null,
              email: normalized.email || null,
              title: rawContact.title || null,
              source: rawContact.source || "BULK_IMPORT",
              organizationId,
              phoneType: phoneType ?? null,
              isIndependent: isIndependent ?? false,
              status: "NEW",
              ownerUserId: user.id,
            })
            .returning();

          await syncContactChannels({
            contactId: contact.id,
            email: contact.email,
            phone: contact.phone,
            mobile: contact.mobile,
            emailLabel: "WORK",
            phoneLabel: contact.phoneType === "personal" ? "PERSONAL" : "WORK",
          });

          await tx.insert(activitiesTable).values({
            workspaceId: workspace.id,
            contactId: contact.id,
            organizationId: organizationId ?? undefined,
            type: "INTRO",
            subject: "Contact imported (bulk)",
            description: "Created via Bulk Import",
            occurredAt: new Date(),
            createdByUserId: user.id,
          });

          results.push({ index: i, status: "created", contactId: contact.id });
        } catch (rowErr) {
          results.push({ index: i, status: "error", error: rowErr instanceof Error ? rowErr.message : "Unknown error" });
        }
      }
    });

    res.status(201).json({ results });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/play", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);

    const parsed = CapturePlaySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "Invalid request", issues: parsed.error.issues });
    }

    const { contactId, playType } = parsed.data;

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
      description: `Play scaffolded from Unified Capture`,
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

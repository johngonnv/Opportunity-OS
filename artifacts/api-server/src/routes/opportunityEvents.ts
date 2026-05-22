import { Router } from "express";
import { db } from "@workspace/db";
import {
  activitiesTable, contactsTable, tasksTable,
  opportunitiesTable, pipelinesTable, pipelineStagesTable,
} from "@workspace/db";
import { eq, and, ilike, asc, isNull } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { getAiClient, logTokenUsage } from "../lib/aiProvider";

const router = Router();

router.post("/analyze", async (req, res) => {
  try {
    const { notes, source, organizationId, occurredAt } = req.body;

    if (!notes || typeof notes !== "string" || notes.trim().length < 10) {
      return res.status(400).json({ error: "Notes are required (min 10 chars)" });
    }
    if (!source) {
      return res.status(400).json({ error: "Source is required" });
    }

    const ai = getAiClient();
    const t0 = Date.now();

    const completion = await ai.client.chat.completions.create({
      model: ai.defaultModel,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a CRM data extraction assistant for healthcare field sales. Given raw notes from a sales interaction, extract structured CRM data. Return valid JSON only.

JSON structure required:
{
  "organizationName": "the primary organization/facility/hospital visited or mentioned, or empty string if unclear",
  "summary": "2-3 sentence narrative of what happened",
  "contacts": [{ "name": "full name", "title": "job title or empty string", "action": "new or update", "detail": "reason or what to update" }],
  "pipeline": [{ "title": "deal/opportunity title", "action": "new or update", "change": "what changed or new deal description", "valueEstimate": number or null }],
  "actionItems": [{ "text": "task description", "dueInDays": integer }],
  "marketingResources": [{ "text": "resource left or promised" }]
}

Rules: Only include items explicitly mentioned or clearly implied. Use empty arrays when none apply. Do not invent information.`,
        },
        {
          role: "user",
          content: `Field visit notes:\nSource: ${source}\nDate: ${occurredAt || new Date().toISOString().split("T")[0]}\n\n${notes}`,
        },
      ],
    });

    logTokenUsage(req.log, ai.provider, ai.defaultModel, completion.usage, Date.now() - t0);

    let extracted: any = {};
    try {
      extracted = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      extracted = {};
    }

    res.json({
      organizationName: typeof extracted.organizationName === "string" ? extracted.organizationName.trim() : "",
      summary: extracted.summary || "",
      contacts: Array.isArray(extracted.contacts) ? extracted.contacts : [],
      pipeline: Array.isArray(extracted.pipeline) ? extracted.pipeline : [],
      actionItems: Array.isArray(extracted.actionItems) ? extracted.actionItems : [],
      marketingResources: Array.isArray(extracted.marketingResources) ? extracted.marketingResources : [],
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Analysis failed" });
  }
});

router.post("/save", async (req, res) => {
  try {
    const { workspace, user } = await getCurrentWorkspace(req);
    const {
      organizationId,
      source,
      notes,
      occurredAt,
      summary,
      approvedContacts = [],
      approvedActionItems = [],
      approvedPipeline = [],
      approvedMarketing = [],
    } = req.body;

    // Build final notes: append marketing resources section if any approved
    let fullNotes = notes || null;
    const marketingItems = (approvedMarketing as any[]).filter(m => m.text);
    if (marketingItems.length > 0) {
      const section = "\n\n--- Marketing Resources Left / Promised ---\n" +
        marketingItems.map((m: any) => `• ${m.text}`).join("\n");
      fullNotes = (fullNotes || "") + section;
    }

    const [activity] = await db
      .insert(activitiesTable)
      .values({
        workspaceId: workspace.id,
        createdByUserId: user.id,
        organizationId: organizationId || null,
        type: "EVENT",
        subject: summary
          ? summary.slice(0, 140)
          : `Opportunity Event — ${source || "Field Visit"}`,
        notes: fullNotes,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      })
      .returning();

    // ── Contacts: create new, update existing ─────────────────────────────
    let contactsCreated = 0;
    let contactsUpdated = 0;
    const createdContactIds: string[] = [];

    for (const c of approvedContacts as any[]) {
      if (!c.name) continue;

      if (c.action === "new") {
        const nameParts = (c.name as string).trim().split(/\s+/);
        const [newContact] = await db.insert(contactsTable).values({
          workspaceId: workspace.id,
          organizationId: organizationId || null,
          fullName: c.name,
          firstName: nameParts[0] || null,
          lastName: nameParts.slice(1).join(" ") || null,
          title: c.title || null,
          source: "OPPORTUNITY_EVENT",
          status: "NEW",
        }).returning({ id: contactsTable.id });
        if (newContact) createdContactIds.push(newContact.id);
        contactsCreated++;
      } else if (c.action === "update" && organizationId) {
        // Find existing contact by name (case-insensitive) in this org
        const [existing] = await db
          .select({ id: contactsTable.id })
          .from(contactsTable)
          .where(
            and(
              eq(contactsTable.workspaceId, workspace.id),
              eq(contactsTable.organizationId, organizationId),
              ilike(contactsTable.fullName, c.name.trim()),
              isNull(contactsTable.deletedAt),
            ),
          )
          .limit(1);

        if (existing) {
          const patch: Record<string, any> = { updatedAt: new Date() };
          if (c.title) patch.title = c.title;
          if (c.detail) patch.roleNotes = c.detail;
          await db
            .update(contactsTable)
            .set(patch)
            .where(eq(contactsTable.id, existing.id));
          contactsUpdated++;
        }
      }
    }

    // ── Pipeline: create new opportunities (only when org is known) ────────
    let opportunitiesCreated = 0;

    const pipelineItems = (approvedPipeline as any[]).filter(p => p.title);
    if (pipelineItems.length > 0) {
      const [firstPipeline] = await db
        .select()
        .from(pipelinesTable)
        .where(eq(pipelinesTable.workspaceId, workspace.id))
        .limit(1);

      if (firstPipeline) {
        const [firstStage] = await db
          .select()
          .from(pipelineStagesTable)
          .where(eq(pipelineStagesTable.pipelineId, firstPipeline.id))
          .orderBy(asc(pipelineStagesTable.stageOrder))
          .limit(1);

        if (firstStage) {
          for (const p of pipelineItems) {
            if (p.action === "new") {
              await db.insert(opportunitiesTable).values({
                workspaceId: workspace.id,
                ownerUserId: user.id,
                organizationId: organizationId || null,
                pipelineId: firstPipeline.id,
                pipelineStageId: firstStage.id,
                title: p.title,
                description: p.change || null,
                valueEstimate: p.valueEstimate ?? null,
                status: "OPEN",
                source: source || "OPPORTUNITY_EVENT",
                vertical: "HEALTHCARE",
              });
              opportunitiesCreated++;
            }
          }
        }
      }
    }

    // ── Tasks from action items ────────────────────────────────────────────
    let tasksCreated = 0;
    for (const a of approvedActionItems as any[]) {
      if (!a.text) continue;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (Number(a.dueInDays) || 7));
      await db.insert(tasksTable).values({
        workspaceId: workspace.id,
        createdByUserId: user.id,
        organizationId: organizationId || null,
        title: a.text,
        status: "OPEN",
        priority: "MEDIUM",
        dueDate,
      });
      tasksCreated++;
    }

    res.status(201).json({
      activityId: activity.id,
      createdContactIds,
      contactsCreated,
      contactsUpdated,
      opportunitiesCreated,
      tasksCreated,
      marketingResourcesLogged: marketingItems.length,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Save failed" });
  }
});

// Back-fill organizationId on an activity + its contacts after the org is created
router.post("/link-org", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const { activityId, contactIds = [], organizationId } = req.body;

    if (!activityId || !organizationId) {
      return res.status(400).json({ error: "activityId and organizationId are required" });
    }

    await db
      .update(activitiesTable)
      .set({ organizationId })
      .where(and(eq(activitiesTable.id, activityId), eq(activitiesTable.workspaceId, workspace.id)));

    if (Array.isArray(contactIds) && contactIds.length > 0) {
      for (const cid of contactIds) {
        await db
          .update(contactsTable)
          .set({ organizationId, updatedAt: new Date() })
          .where(and(eq(contactsTable.id, cid), eq(contactsTable.workspaceId, workspace.id)));
      }
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Link failed" });
  }
});

export default router;

import { Router } from "express";
import { db } from "@workspace/db";
import { activitiesTable, contactsTable, tasksTable } from "@workspace/db";
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
    } = req.body;

    if (!organizationId) return res.status(400).json({ error: "organizationId required" });

    const [activity] = await db
      .insert(activitiesTable)
      .values({
        workspaceId: workspace.id,
        createdByUserId: user.id,
        organizationId,
        type: "EVENT",
        subject: summary
          ? summary.slice(0, 140)
          : `Opportunity Event — ${source || "Field Visit"}`,
        notes: notes || null,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      })
      .returning();

    const createdContactIds: string[] = [];
    for (const c of approvedContacts as any[]) {
      if (c.action !== "new" || !c.name) continue;
      const nameParts = (c.name as string).trim().split(/\s+/);
      const [contact] = await db
        .insert(contactsTable)
        .values({
          workspaceId: workspace.id,
          organizationId,
          fullName: c.name,
          firstName: nameParts[0] || null,
          lastName: nameParts.slice(1).join(" ") || null,
          title: c.title || null,
          source: "OPPORTUNITY_EVENT",
          status: "NEW",
        })
        .returning();
      createdContactIds.push(contact.id);
    }

    const createdTaskIds: string[] = [];
    for (const a of approvedActionItems as any[]) {
      if (!a.text) continue;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (Number(a.dueInDays) || 7));
      const [task] = await db
        .insert(tasksTable)
        .values({
          workspaceId: workspace.id,
          createdByUserId: user.id,
          organizationId,
          title: a.text,
          status: "OPEN",
          priority: "MEDIUM",
          dueDate,
        })
        .returning();
      createdTaskIds.push(task.id);
    }

    res.status(201).json({
      activityId: activity.id,
      contactsCreated: createdContactIds.length,
      tasksCreated: createdTaskIds.length,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Save failed" });
  }
});

export default router;

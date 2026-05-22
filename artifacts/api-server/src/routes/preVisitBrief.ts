import { Router } from "express";
import { db } from "@workspace/db";
import {
  organizationsTable,
  contactsTable,
  activitiesTable,
  opportunitiesTable,
} from "@workspace/db";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";
import { getCurrentWorkspace } from "../lib/workspace";
import { getAiClient, logTokenUsage } from "../lib/aiProvider";

const router = Router({ mergeParams: true });

router.post("/pre-visit-brief", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    const orgId = req.params.id;

    const [org] = await db
      .select()
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, orgId), eq(organizationsTable.workspaceId, workspace.id), isNull(organizationsTable.deletedAt)))
      .limit(1);

    if (!org) return res.status(404).json({ error: "Organization not found" });

    const [contacts, rawActivities, openOpps] = await Promise.all([
      db
        .select()
        .from(contactsTable)
        .where(and(eq(contactsTable.organizationId, orgId), eq(contactsTable.workspaceId, workspace.id), isNull(contactsTable.deletedAt)))
        .orderBy(desc(contactsTable.updatedAt))
        .limit(10),
      db
        .select()
        .from(activitiesTable)
        .where(and(eq(activitiesTable.organizationId, orgId), eq(activitiesTable.workspaceId, workspace.id)))
        .orderBy(desc(activitiesTable.occurredAt))
        .limit(8),
      db
        .select()
        .from(opportunitiesTable)
        .where(and(eq(opportunitiesTable.organizationId, orgId), eq(opportunitiesTable.workspaceId, workspace.id), eq(opportunitiesTable.status, "OPEN")))
        .limit(5),
    ]);

    const contactSummary = contacts
      .slice(0, 6)
      .map(c => `${c.fullName} (${c.title || "unknown title"})${c.relationshipStrengthLabel ? ` — ${c.relationshipStrengthLabel}` : ""}`)
      .join("; ");

    const activitySummary = rawActivities
      .map(a => `${a.type} on ${a.occurredAt?.toISOString().split("T")[0]}: ${a.subject || ""}`)
      .join("; ");

    const oppSummary = openOpps
      .map(o => `${(o as any).title || "Untitled"} (${(o as any).status})${(o as any).valueEstimate ? ` $${(o as any).valueEstimate}` : ""}`)
      .join("; ");

    const ai = getAiClient();
    const t0 = Date.now();

    const completion = await ai.client.chat.completions.create({
      model: ai.defaultModel,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a field sales coach preparing a pre-visit brief for a healthcare sales rep. Given CRM data about an account, generate a concise, actionable brief. Return valid JSON only.

JSON structure:
{
  "visitPurpose": "inferred main purpose of the visit based on open opportunities",
  "contacts": [{ "name": "name", "title": "title", "strength": "HOT|WARM|COLD", "note": "key insight about this person" }],
  "lastInteractions": [{ "icon": "emoji", "text": "brief description", "when": "relative time like 3 days ago" }],
  "pipeline": [{ "title": "opportunity title", "stage": "current stage", "value": "$X", "pct": 0-100 }],
  "painPoints": ["pain point 1", "pain point 2"],
  "talkingPoints": ["talking point 1", "talking point 2"],
  "competitive": "competitive landscape note or empty string"
}`,
        },
        {
          role: "user",
          content: `Organization: ${org.name} (${org.organizationType || org.vertical || "Healthcare"})
Key Contacts: ${contactSummary || "None on record"}
Recent Activity: ${activitySummary || "No recent activity"}
Open Opportunities: ${oppSummary || "None"}
Additional Intel: ${(org as any).organizationIntelligenceSummary ? JSON.stringify((org as any).organizationIntelligenceSummary).slice(0, 800) : "None"}`,
        },
      ],
    });

    logTokenUsage(req.log, ai.provider, ai.defaultModel, completion.usage, Date.now() - t0);

    let brief: any = {};
    try {
      brief = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      brief = {};
    }

    res.json({
      orgName: org.name,
      orgType: org.organizationType || org.vertical || "Healthcare",
      generatedAt: new Date().toISOString(),
      visitPurpose: brief.visitPurpose || "Account Review",
      contacts: Array.isArray(brief.contacts) ? brief.contacts : [],
      lastInteractions: Array.isArray(brief.lastInteractions) ? brief.lastInteractions : [],
      pipeline: Array.isArray(brief.pipeline) ? brief.pipeline : [],
      painPoints: Array.isArray(brief.painPoints) ? brief.painPoints : [],
      talkingPoints: Array.isArray(brief.talkingPoints) ? brief.talkingPoints : [],
      competitive: brief.competitive || "",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Brief generation failed" });
  }
});

export default router;

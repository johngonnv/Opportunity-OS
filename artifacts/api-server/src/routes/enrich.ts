import { Router } from "express";
import { z } from "zod";
import { getAiClient, GROK_DEFAULT_MODEL, logTokenUsage } from "../lib/aiProvider";
import { getCurrentWorkspace } from "../lib/workspace";

const router = Router();

const ORG_TYPES = ["OTHER", "HOSPITAL", "GOVERNMENT_AGENCY", "PRIME_CONTRACTOR", "CONSULTANT"] as const;

const EnrichOrgSchema = z.object({
  name: z.string().min(1).max(200),
});

router.post("/org", async (req, res) => {
  try {
    const { workspace } = await getCurrentWorkspace(req);
    if (!workspace) return res.status(401).json({ error: "Unauthorized" });

    const parsed = EnrichOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: "Invalid request", issues: parsed.error.issues });
    }

    const { name } = parsed.data;

    let aiConfig;
    try {
      aiConfig = getAiClient("grok");
    } catch {
      aiConfig = getAiClient("openai");
    }

    const t0 = Date.now();
    const completion = await aiConfig.client.chat.completions.create({
      model: GROK_DEFAULT_MODEL,
      max_tokens: 120,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "org_enrich",
          strict: true,
          schema: {
            type: "object",
            properties: {
              organizationType: {
                type: "string",
                enum: [...ORG_TYPES],
                description: "Best-fit category for this organization",
              },
              confidence: {
                type: "number",
                description: "0.0–1.0 confidence in the classification",
              },
            },
            required: ["organizationType", "confidence"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content: `You classify organizations for a B2B healthcare sales CRM used by field reps selling energy and healthcare services.

Categories:
- HOSPITAL: hospitals, health systems, medical centers, clinics, ASCs, nursing homes, any patient-care facility
- GOVERNMENT_AGENCY: federal/state/local government bodies, GSA, VA, military, municipalities, public utilities
- PRIME_CONTRACTOR: defense/construction contractors, GovCon primes, federal systems integrators
- CONSULTANT: consulting firms, advisory firms, management consultants, staffing agencies
- OTHER: everything else — energy companies, commercial businesses, non-profits, universities, distributors

Respond with the single best-fit category and your confidence.`,
        },
        {
          role: "user",
          content: `Organization name: "${name}"`,
        },
      ],
    });

    logTokenUsage(req.log, aiConfig.provider, GROK_DEFAULT_MODEL, completion.usage, Date.now() - t0);

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(raw) as { organizationType: string; confidence: number };

    return res.json({
      organizationType: result.organizationType ?? "OTHER",
      confidence: result.confidence ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "[ENRICH] org enrichment failed");
    return res.status(500).json({ error: "Enrichment unavailable" });
  }
});

export default router;

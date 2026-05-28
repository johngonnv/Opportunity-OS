import { getAiClient, resolveProvider } from "./aiProvider";

// OCR (vision) now exclusively uses the central AI provider.
// OpenAI support has been removed from this module.
export function isOcrAvailable(): boolean {
  const provider = resolveProvider();

  if (provider === "grok") {
    return !!process.env.AI_INTEGRATIONS_GROK_API_KEY;
  }

  // OpenAI support is being removed from the application.
  // This function now only supports Grok for vision/OCR.
  return false;
}

export interface ParsedBusinessCard {
  fullName: string;
  firstName: string;
  lastName: string;
  title: string;
  organizationName: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  address: string;
  cardNotes: string;
  rawText: string;
}

export interface ParsedStorefront {
  businessName: string;
  allVisibleText: string;
  confidence: number;
  // Structured fields for better downstream mapping
  organization?: {
    name?: string;
    address?: string;
    notes?: string;
  };
}

export async function parseStorefrontImage(
  images: Array<{ buffer: Buffer; contentType: string }>,
): Promise<{ parsed: ParsedStorefront; rawText: string }> {
  const ai = getAiClient("grok");

  const imageContent = images.map((img) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${img.contentType};base64,${img.buffer.toString("base64")}`,
      detail: "high" as const,
    },
  }));

  console.log("[ORG-SCAN] OCR called with Grok Vision, images:", images.length, "total bytes:", images.reduce((a, i) => a + i.buffer.length, 0));

  const response = await ai.client.chat.completions.create({
    model: ai.complexModel,
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `You are a precise data extraction system specialized in business locations from images.

Analyze the image(s) of a storefront, sign, building exterior, or logo.

Extract the following with high accuracy:

- The single clearest and most prominent business/organization name.
- Any visible physical address or location details.
- Other useful business context (services, taglines, hours, contact info, etc.).

Return ONLY this exact JSON shape (no extra text, no markdown, no explanations):

{
  "businessName": "Most prominent organization name visible — exact text, no extra words. Empty string if none.",
  "address": "Street address + city/state/zip if visible. Combine naturally. Empty string if none.",
  "notes": "All other readable business-relevant text (services, slogans, hours, certifications, websites, phones, etc.). Keep concise but complete. Empty string if none.",
  "allVisibleText": "Verbatim full text from the image(s), space-separated. This is the raw fallback.",
  "confidence": 0.0 to 1.0
}

Strict rules:
- Never hallucinate or guess names/addresses.
- Prioritize the most visually dominant name.
- Return ONLY the JSON object.`,
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim() || "";
  console.log("[ORG-SCAN] OCR response received, content length:", content.length);

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    const err = new Error(`OCR_PARSE_FAILED: No JSON object found in model response. Raw: ${content.slice(0, 200)}`);
    console.log("[ORG-SCAN] OCR JSON extraction failed, throwing to caller");
    throw err;
  }

  try {
    const raw = JSON.parse(jsonMatch[0]);

    // Normalize to our interface (supports both old nested and new flat formats)
    const parsed: ParsedStorefront = {
      businessName: raw.businessName || raw.organization?.name || "",
      allVisibleText: raw.allVisibleText || "",
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0.6,
      organization: raw.organization || {
        name: raw.businessName || "",
        address: raw.address || "",
        notes: raw.notes || "",
      },
    };

    console.log("[ORG-SCAN] OCR parsed successfully, businessName:", parsed.businessName);
    return { parsed, rawText: parsed.allVisibleText || content };
  } catch (e) {
    const err = new Error(`OCR_PARSE_FAILED: JSON.parse error on model output. Raw: ${jsonMatch[0].slice(0, 200)}`);
    console.log("[ORG-SCAN] OCR JSON.parse failed, throwing to caller:", e);
    throw err;
  }
}

export async function parseBusinessCardImage(
  images: Array<{ buffer: Buffer; contentType: string }>,
): Promise<{ parsed: ParsedBusinessCard; rawText: string }> {
  const ai = getAiClient("grok");

  const imageContent = images.map((img, i) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${img.contentType};base64,${img.buffer.toString("base64")}`,
      detail: "high" as const,
    },
  }));

  const sidesLabel = images.length > 1 ? "both sides of this business card" : "this business card";
  console.log("[CARD] OCR called with Grok Vision, sides:", images.length, "total bytes:", images.reduce((a, i) => a + i.buffer.length, 0));

  const response = await ai.client.chat.completions.create({
    model: ai.complexModel,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `You are a precise data extraction system for business cards.

Analyze the image(s) and return a clean JSON object with two top-level sections:

{
  "contact": {
    "fullName": "Full name of the person",
    "firstName": "First name only",
    "lastName": "Last name only",
    "title": "Job title or position",
    "email": "Email address",
    "phone": "Main phone with extension if present",
    "mobile": "Mobile number if clearly different"
  },
  "organization": {
    "name": "Company or organization name",
    "website": "Website URL",
    "address": "Physical mailing address"
  },
  "cardNotes": "All other useful text (slogans, services, handwritten notes, certifications, etc.)",
  "rawText": "Verbatim full text from all sides of the card(s)"
}

Rules:
- Never invent data.
- Be extremely precise with names, numbers, and extensions.
- Return ONLY the JSON object. No markdown, no explanations.`,
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim() || "";
  console.log("[CARD] OCR response received, content length:", content.length);

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found in OCR response");
    const parsed = JSON.parse(jsonMatch[0]) as ParsedBusinessCard;
    console.log("[CARD] OCR parsed successfully, fullName:", parsed.fullName);
    return { parsed, rawText: parsed.rawText || content };
  } catch (e) {
    console.log("[CARD] OCR JSON parse failed, using raw text:", e);
    const empty: ParsedBusinessCard = {
      fullName: "", firstName: "", lastName: "", title: "",
      organizationName: "", email: "", phone: "", mobile: "",
      website: "", address: "", cardNotes: "", rawText: content,
    };
    return { parsed: empty, rawText: content };
  }
}

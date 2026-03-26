import OpenAI from "openai";

function getOpenAIClient(): OpenAI | null {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    return null;
  }
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
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

export function isOcrAvailable(): boolean {
  return !!(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
}

export async function parseBusinessCardImage(
  images: Array<{ buffer: Buffer; contentType: string }>,
): Promise<{ parsed: ParsedBusinessCard; rawText: string }> {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("OCR_NOT_CONFIGURED");
  }

  const imageContent = images.map((img, i) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${img.contentType};base64,${img.buffer.toString("base64")}`,
      detail: "high" as const,
    },
  }));

  const sidesLabel = images.length > 1 ? "both sides of this business card" : "this business card";
  console.log("[CARD] OCR called with GPT-4o Vision, sides:", images.length, "total bytes:", images.reduce((a, i) => a + i.buffer.length, 0));

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `You are extracting business card data from ${sidesLabel}. Read every word on every side carefully. Return a JSON object with exactly these fields:
{
  "fullName": "Full name of the person on the card",
  "firstName": "First name only",
  "lastName": "Last name only",
  "title": "Job title or position",
  "organizationName": "Company or organization name",
  "email": "Email address",
  "phone": "Main phone/office number",
  "mobile": "Mobile or cell number if different from phone",
  "website": "Website URL",
  "address": "Physical mailing address",
  "cardNotes": "IMPORTANT: Capture ALL remaining text verbatim that is not already in the fields above. This includes: mission statements, slogans, taglines, service descriptions, donation appeals, operating hours (e.g. '24/7'), handwritten notes, certifications, awards, social handles, any text printed on the back of the card, and any other marketing or informational copy. Do NOT leave this blank if there is any other text on any side of the card.",
  "rawText": "All visible text from all sides of the card, verbatim"
}

Return ONLY the JSON object. No markdown, no code fences, no explanation. Use "" only if a field is truly absent from the card.`,
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

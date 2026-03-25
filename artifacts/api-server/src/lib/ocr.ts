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
  rawText: string;
}

export function isOcrAvailable(): boolean {
  return !!(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
}

export async function parseBusinessCardImage(
  imageBuffer: Buffer,
  contentType: string
): Promise<{ parsed: ParsedBusinessCard; rawText: string }> {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("OCR_NOT_CONFIGURED");
  }

  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;

  console.log("[CARD] OCR called with GPT-4o Vision, image size:", imageBuffer.length, "bytes");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
          {
            type: "text",
            text: `Extract all text and contact information from this business card image. Return a JSON object with exactly these fields:
{
  "fullName": "Full name of the person",
  "firstName": "First name only",
  "lastName": "Last name only",
  "title": "Job title or position",
  "organizationName": "Company or organization name",
  "email": "Email address",
  "phone": "Main phone number",
  "mobile": "Mobile or cell phone number if different from phone",
  "website": "Website URL",
  "address": "Physical address",
  "rawText": "All visible text on the card verbatim"
}

Return ONLY the JSON object with no markdown code fences or other text. Use empty string "" for any field not visible on the card.`,
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
      website: "", address: "", rawText: content,
    };
    return { parsed: empty, rawText: content };
  }
}

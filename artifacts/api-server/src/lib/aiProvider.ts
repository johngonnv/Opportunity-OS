// ─── AI Provider Factory ──────────────────────────────────────────────────────
// Centralizes AI client creation for Grok and OpenAI.
// Provider selection order (highest wins):
//   1. Explicit `provider` param passed to getAiClient()
//   2. AI_PROVIDER environment variable
//   3. Hardcoded default: 'openai'
//
// Grok uses the OpenAI SDK with x.ai base URL — no new package required.
// All API keys are read server-side only; never exposed to the client.

import OpenAI from "openai";

export type AiProvider = "openai" | "grok";

export interface AiClientConfig {
  client: OpenAI;
  provider: AiProvider;
  defaultModel: string;
  complexModel: string;
}

// ─── Grok model constants ─────────────────────────────────────────────────────
// grok-4-1-fast-reasoning: best value for high-volume structured tasks
//   $0.20 input / $0.50 output per million tokens
// grok-4.20-reasoning: escalation for complex healthcare/GovCon reasoning
export const GROK_DEFAULT_MODEL = "grok-4-1-fast-reasoning";
export const GROK_COMPLEX_MODEL = "grok-4.20-reasoning";

// ─── OpenAI model constants ───────────────────────────────────────────────────
export const OPENAI_DEFAULT_MODEL = "gpt-4o";

// ─── Resolve active provider ──────────────────────────────────────────────────
export function resolveProvider(explicit?: string): AiProvider {
  const raw = (explicit ?? process.env.AI_PROVIDER ?? "openai").toLowerCase().trim();
  if (raw === "grok") return "grok";
  return "openai";
}

// ─── Build a configured AI client ────────────────────────────────────────────
export function getAiClient(explicit?: string): AiClientConfig {
  const provider = resolveProvider(explicit);

  if (provider === "grok") {
    const apiKey = process.env.AI_INTEGRATIONS_GROK_API_KEY;
    if (!apiKey) {
      throw new Error(
        "[AI-PROVIDER] Grok selected but AI_INTEGRATIONS_GROK_API_KEY is not set"
      );
    }
    return {
      client: new OpenAI({
        baseURL: "https://api.x.ai/v1",
        apiKey,
      }),
      provider: "grok",
      defaultModel: GROK_DEFAULT_MODEL,
      complexModel: GROK_COMPLEX_MODEL,
    };
  }

  // OpenAI (Replit AI Integration proxy)
  return {
    client: new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "placeholder",
    }),
    provider: "openai",
    defaultModel: OPENAI_DEFAULT_MODEL,
    complexModel: OPENAI_DEFAULT_MODEL,
  };
}

// ─── Token usage logger ───────────────────────────────────────────────────────
export function logTokenUsage(
  log: { info: (obj: object, msg: string) => void },
  provider: AiProvider,
  model: string,
  usage: OpenAI.CompletionUsage | undefined,
  latencyMs: number
) {
  if (!usage) return;
  log.info(
    {
      provider,
      model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      latencyMs,
    },
    `[AI-PROVIDER] ${provider.toUpperCase()} usage`
  );
}

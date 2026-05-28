// ─── AI Provider Factory ──────────────────────────────────────────────────────
// Centralizes AI client creation (Grok primary).
// Provider selection order (highest wins):
//   1. Explicit `provider` param passed to getAiClient()
//   2. AI_PROVIDER environment variable
//   3. Hardcoded default: 'grok'
//
// Grok uses the OpenAI SDK with x.ai base URL — no new package required.
// All API keys are read server-side only; never exposed to the client.
//
// OpenAI support is being removed from the application.

import OpenAI from "openai";

export type AiProvider = "openai" | "grok";

export interface AiClientConfig {
  client: OpenAI;
  provider: AiProvider;
  defaultModel: string;
  complexModel: string;
}

// ─── Grok model constants ─────────────────────────────────────────────────────
// grok-3-fast: best value for high-volume structured tasks (data mapping, JSON)
// grok-3: full model — used for complex reasoning and live web-search enrichment
//   (search_parameters: { mode: "on" } requires grok-3, not grok-3-fast)
export const GROK_DEFAULT_MODEL = "grok-3";
export const GROK_COMPLEX_MODEL = "grok-3";

// ─── OpenAI model constants (DEPRECATED - being removed) ─────────────────────
export const OPENAI_DEFAULT_MODEL = "gpt-4o"; // No longer used in new code paths

// ─── Resolve active provider ──────────────────────────────────────────────────
export function resolveProvider(explicit?: string): AiProvider {
  const raw = (explicit ?? process.env.AI_PROVIDER ?? "grok").toLowerCase().trim();
  if (raw === "grok") return "grok";
  // OpenAI is being removed — any non-grok value will fall through to Grok
  return "grok";
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

  // OpenAI support has been removed from the application.
  // Any non-Grok request will now fall back to Grok.
  throw new Error(
    "[AI-PROVIDER] OpenAI has been removed. Please set AI_PROVIDER=grok and provide AI_INTEGRATIONS_GROK_API_KEY."
  );
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

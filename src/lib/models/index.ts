import "server-only";
import { anthropicAdapter } from "./anthropic";
import { googleAdapter } from "./google";
import { openaiAdapter } from "./openai";
import type { Credentials, ModelAdapter, Provider, StreamParams } from "./types";

export type { ChatTurn, Credentials, Provider } from "./types";
export { loadCredentials } from "./keys";

export type ModelOption = { id: string; label: string; provider: Provider };

export const adapters: Record<Provider, ModelAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
};

function listFromEnv(value: string | undefined, fallback: string[]) {
  const ids = value?.split(",").map((s) => s.trim()).filter(Boolean);
  return ids?.length ? ids : fallback;
}

/** Models for the providers these credentials cover. Order = preference. */
export function availableModels(creds: Credentials): ModelOption[] {
  const out: ModelOption[] = [];
  if (creds.anthropic) {
    out.push(
      { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic" },
    );
  }
  if (creds.openai) {
    for (const id of listFromEnv(process.env.OPENAI_MODELS, ["gpt-5"])) {
      out.push({ id, label: `OpenAI ${id}`, provider: "openai" });
    }
  }
  if (creds.google) {
    for (const id of listFromEnv(process.env.GEMINI_MODELS, ["gemini-2.5-pro"])) {
      out.push({ id, label: `Google ${id}`, provider: "google" });
    }
  }
  return out;
}

export function streamChat(params: StreamParams, creds: Credentials) {
  const option = availableModels(creds).find((m) => m.id === params.model);
  if (!option) {
    throw new Error(`No API key for "${params.model}". Add one under AI keys, or pick another model.`);
  }
  return adapters[option.provider].stream(params, creds[option.provider]!);
}

export async function complete(params: StreamParams, creds: Credentials) {
  let text = "";
  for await (const piece of streamChat(params, creds)) text += piece;
  return text.trim();
}

/** Model used for app-level tasks (summaries, rebases) when a thread's model isn't available. */
export function resolveModel(creds: Credentials, preferred?: string | null) {
  const models = availableModels(creds);
  if (preferred && models.some((m) => m.id === preferred)) return preferred;
  if (!models.length) return null;
  return models[0].id;
}

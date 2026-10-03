import "server-only";
import { anthropicAdapter } from "./anthropic";
import { googleAdapter } from "./google";
import { openaiAdapter } from "./openai";
import type { ModelAdapter, StreamParams } from "./types";

export type { ChatTurn } from "./types";

export type ModelOption = { id: string; label: string; provider: ModelAdapter["provider"] };

const adapters: Record<ModelAdapter["provider"], ModelAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
};

function listFromEnv(value: string | undefined, fallback: string[]) {
  const ids = value?.split(",").map((s) => s.trim()).filter(Boolean);
  return ids?.length ? ids : fallback;
}

/** Models whose provider has an API key configured. Order = preference. */
export function availableModels(): ModelOption[] {
  const out: ModelOption[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    out.push(
      { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic" },
    );
  }
  if (process.env.OPENAI_API_KEY) {
    for (const id of listFromEnv(process.env.OPENAI_MODELS, ["gpt-5"])) {
      out.push({ id, label: `OpenAI ${id}`, provider: "openai" });
    }
  }
  if (process.env.GEMINI_API_KEY) {
    for (const id of listFromEnv(process.env.GEMINI_MODELS, ["gemini-2.5-pro"])) {
      out.push({ id, label: `Google ${id}`, provider: "google" });
    }
  }
  return out;
}

export function modelLabel(id: string) {
  return availableModels().find((m) => m.id === id)?.label ?? id;
}

function adapterFor(model: string) {
  const option = availableModels().find((m) => m.id === model);
  if (!option) throw new Error(`Model "${model}" isn't configured on this server.`);
  return adapters[option.provider];
}

export function streamChat(params: StreamParams) {
  return adapterFor(params.model).stream(params);
}

export async function complete(params: StreamParams) {
  let text = "";
  for await (const piece of streamChat(params)) text += piece;
  return text.trim();
}

/** Model used for app-level tasks (summaries, rebases) when a thread's model isn't available. */
export function resolveModel(preferred?: string | null) {
  const models = availableModels();
  if (preferred && models.some((m) => m.id === preferred)) return preferred;
  if (!models.length) throw new Error("No AI provider keys are configured.");
  return models[0].id;
}

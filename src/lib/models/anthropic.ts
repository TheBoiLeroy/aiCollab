import Anthropic from "@anthropic-ai/sdk";
import type { ModelAdapter, StreamParams } from "./types";

const clients = new Map<string, Anthropic>();
function getClient({ apiKey, workspaceId }: { apiKey: string; workspaceId?: string }) {
  const cacheKey = `${apiKey}:${workspaceId ?? ""}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = new Anthropic({
      apiKey,
      // User-scoped keys (sk-ant-usr-...) must name the workspace to bill.
      defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
    });
    clients.set(cacheKey, client);
  }
  return client;
}

export const anthropicAdapter: ModelAdapter = {
  provider: "anthropic",
  async *stream({ model, system, messages, quick }: StreamParams, cred) {
    const stream = getClient(cred).beta.messages.stream({
      model,
      max_tokens: quick ? 4000 : 64000,
      system,
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort: quick ? "low" : "medium" },
      // On a safety decline, the API re-runs the request on a suitable fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      yield "\n\n_The model declined to answer this request._";
    }
  },
  async verify(cred) {
    await getClient(cred).models.list({ limit: 1 });
  },
};

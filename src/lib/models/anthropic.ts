import Anthropic from "@anthropic-ai/sdk";
import type { ModelAdapter, StreamParams } from "./types";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export const anthropicAdapter: ModelAdapter = {
  provider: "anthropic",
  async *stream({ model, system, messages, quick }: StreamParams) {
    const stream = getClient().beta.messages.stream({
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
};

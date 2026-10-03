import OpenAI from "openai";
import type { ModelAdapter, StreamParams } from "./types";

const clients = new Map<string, OpenAI>();
function getClient(apiKey: string) {
  let client = clients.get(apiKey);
  if (!client) clients.set(apiKey, (client = new OpenAI({ apiKey })));
  return client;
}

export const openaiAdapter: ModelAdapter = {
  provider: "openai",
  async *stream({ model, system, messages }: StreamParams, { apiKey }) {
    const stream = await getClient(apiKey).chat.completions.create({
      model,
      stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  },
  async verify({ apiKey }) {
    await getClient(apiKey).models.list();
  },
};

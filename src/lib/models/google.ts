import { GoogleGenAI } from "@google/genai";
import type { ModelAdapter, StreamParams } from "./types";

const clients = new Map<string, GoogleGenAI>();
function getClient(apiKey: string) {
  let client = clients.get(apiKey);
  if (!client) clients.set(apiKey, (client = new GoogleGenAI({ apiKey })));
  return client;
}

export const googleAdapter: ModelAdapter = {
  provider: "google",
  async *stream({ model, system, messages }: StreamParams, { apiKey }) {
    const stream = await getClient(apiKey).models.generateContentStream({
      model,
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: { systemInstruction: system },
    });
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  },
  async verify({ apiKey }) {
    await getClient(apiKey).models.list({ config: { pageSize: 1 } });
  },
};

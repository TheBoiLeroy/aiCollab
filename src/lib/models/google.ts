import { GoogleGenAI } from "@google/genai";
import type { ModelAdapter, StreamParams } from "./types";

let client: GoogleGenAI | null = null;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

export const googleAdapter: ModelAdapter = {
  provider: "google",
  async *stream({ model, system, messages }: StreamParams) {
    const stream = await getClient().models.generateContentStream({
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
};

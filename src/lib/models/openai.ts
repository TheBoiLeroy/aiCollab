import OpenAI from "openai";
import type { ModelAdapter, StreamParams } from "./types";

let client: OpenAI | null = null;
const getClient = () => (client ??= new OpenAI());

export const openaiAdapter: ModelAdapter = {
  provider: "openai",
  async *stream({ model, system, messages }: StreamParams) {
    const stream = await getClient().chat.completions.create({
      model,
      stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  },
};

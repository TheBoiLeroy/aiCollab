export type ChatTurn = { role: "user" | "assistant"; content: string };

export type StreamParams = {
  model: string;
  system: string;
  messages: ChatTurn[];
  /** Short, cheap calls (summaries) can ask for less effort. */
  quick?: boolean;
};

export interface ModelAdapter {
  provider: "anthropic" | "openai" | "google";
  stream(params: StreamParams): AsyncIterable<string>;
}

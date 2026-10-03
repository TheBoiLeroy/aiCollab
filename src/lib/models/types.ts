export type ChatTurn = { role: "user" | "assistant"; content: string };

export type Provider = "anthropic" | "openai" | "google";

/** One person's keys for each provider (their own, or the server's as a fallback). */
export type Credentials = Partial<Record<Provider, { apiKey: string; workspaceId?: string }>>;

export type StreamParams = {
  model: string;
  system: string;
  messages: ChatTurn[];
  /** Short, cheap calls (summaries) can ask for less effort. */
  quick?: boolean;
};

export interface ModelAdapter {
  provider: Provider;
  stream(params: StreamParams, cred: { apiKey: string; workspaceId?: string }): AsyncIterable<string>;
  /** Cheap authenticated call used to check a key before saving it. */
  verify(cred: { apiKey: string; workspaceId?: string }): Promise<void>;
}

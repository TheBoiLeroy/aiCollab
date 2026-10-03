import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Credentials, Provider } from "./types";

export const PROVIDERS: { id: Provider; label: string; placeholder: string; consoleUrl: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)", placeholder: "sk-ant-...", consoleUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "OpenAI", placeholder: "sk-...", consoleUrl: "https://platform.openai.com/api-keys" },
  { id: "google", label: "Google (Gemini)", placeholder: "AIza...", consoleUrl: "https://aistudio.google.com/apikey" },
];

type StoredKey = { apiKey: string; workspaceId?: string };

function secret() {
  const raw = process.env.PROVIDER_KEYS_SECRET;
  const key = raw ? Buffer.from(raw, "base64") : null;
  if (key?.length !== 32) {
    throw new Error("PROVIDER_KEYS_SECRET must be 32 random bytes, base64-encoded (openssl rand -base64 32).");
  }
  return key;
}

/** AES-256-GCM; stored as base64(iv | tag | ciphertext). */
export function encryptKey(value: StoredKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function decryptKey(stored: string): StoredKey | null {
  try {
    const buf = Buffer.from(stored, "base64");
    const decipher = createDecipheriv("aes-256-gcm", secret(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    // Wrong or rotated secret: treat as missing so the person can re-enter it.
    return null;
  }
}

/** Keys from the server env, used for a provider only when the person hasn't added their own. */
function serverCredentials(): Credentials {
  const creds: Credentials = {};
  if (process.env.ANTHROPIC_API_KEY) {
    creds.anthropic = {
      apiKey: process.env.ANTHROPIC_API_KEY,
      workspaceId: process.env.ANTHROPIC_WORKSPACE_ID || undefined,
    };
  }
  if (process.env.OPENAI_API_KEY) creds.openai = { apiKey: process.env.OPENAI_API_KEY };
  if (process.env.GEMINI_API_KEY) creds.google = { apiKey: process.env.GEMINI_API_KEY };
  return creds;
}

/** The signed-in person's credentials: their own keys first, then the server's. */
export async function loadCredentials(supabase: SupabaseClient, userId: string): Promise<Credentials> {
  const creds = serverCredentials();
  // RLS limits this to the person's own rows.
  const { data } = await supabase
    .from("user_provider_keys")
    .select("provider, ciphertext")
    .eq("user_id", userId)
    .returns<{ provider: Provider; ciphertext: string }[]>();
  for (const row of data ?? []) {
    const key = decryptKey(row.ciphertext);
    if (key) creds[row.provider] = key;
  }
  return creds;
}

export function keyHint(apiKey: string) {
  return `…${apiKey.slice(-4)}`;
}

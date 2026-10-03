import Link from "next/link";
import { removeProviderKey, revokeConnectedApp, saveProviderKey } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import type { Provider } from "@/lib/models";
import { PROVIDERS } from "@/lib/models/keys";
import { requireUser } from "@/lib/supabase/server";

const SERVER_KEY: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  google: process.env.GEMINI_API_KEY,
};

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { next } = await searchParams;
  const back = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/workspaces";
  const { supabase, user } = await requireUser();
  const { data: saved } = await supabase
    .from("user_provider_keys")
    .select("provider, hint, updated_at")
    .eq("user_id", user.id)
    .returns<{ provider: Provider; hint: string; updated_at: string }[]>();
  const byProvider = new Map(saved?.map((k) => [k.provider, k]));
  // Errors when the project's OAuth server is off; then there's nothing to list.
  const { data: grants } = await supabase.auth.oauth.listGrants().catch(() => ({ data: null }));
  const hasAny = PROVIDERS.some((p) => byProvider.has(p.id) || SERVER_KEY[p.id]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link href={back} className="text-xs text-muted hover:underline">
        ← Back
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">Your AI keys</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Your private threads run on your own provider accounts, billed to you. Keys are checked with the provider,
        encrypted before they&apos;re stored, and never shown again or shared with your team.
      </p>
      {!hasAny && (
        <p className="card mb-4 text-sm">Add at least one key to start a private thread.</p>
      )}

      <ul className="flex flex-col gap-4">
        {PROVIDERS.map((p) => {
          const mine = byProvider.get(p.id);
          return (
            <li key={p.id} className="card">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-medium">{p.label}</h2>
                {mine ? (
                  <form action={removeProviderKey.bind(null, p.id)} className="flex items-center gap-2 text-xs text-muted">
                    <span>Your key {mine.hint}</span>
                    <button className="btn">Remove</button>
                  </form>
                ) : SERVER_KEY[p.id] ? (
                  <span className="text-xs text-muted">Using the app&apos;s shared key</span>
                ) : (
                  <span className="text-xs text-muted">Not connected</span>
                )}
              </div>
              <ActionForm action={saveProviderKey} className="flex flex-col gap-2" resetOnSuccess>
                <input type="hidden" name="provider" value={p.id} />
                <div className="flex gap-2">
                  <input
                    name="api_key"
                    type="password"
                    required
                    autoComplete="off"
                    placeholder={mine ? "Paste a new key to replace it" : p.placeholder}
                    className="input font-mono text-xs"
                  />
                  <SubmitButton pendingText="Checking…">{mine ? "Replace" : "Save"}</SubmitButton>
                </div>
                {p.id === "anthropic" && (
                  <input
                    name="workspace_id"
                    autoComplete="off"
                    placeholder="Workspace ID (only for sk-ant-usr- keys): wrkspc_..."
                    className="input font-mono text-xs"
                  />
                )}
                <a href={p.consoleUrl} target="_blank" rel="noreferrer" className="text-xs text-muted hover:underline">
                  Get a key ↗
                </a>
              </ActionForm>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-10 text-lg font-semibold">Connected AI apps</h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        Apps like Claude that you&apos;ve let into Intermediary through the MCP connector. They act as you.
      </p>
      {grants?.length ? (
        <ul className="flex flex-col gap-2">
          {grants.map((g) => (
            <li key={g.client.id} className="card flex items-center justify-between gap-2">
              <span className="text-sm">
                {g.client.name || "Unnamed app"}{" "}
                <span className="text-xs text-muted">since {new Date(g.granted_at).toLocaleDateString()}</span>
              </span>
              <form action={revokeConnectedApp.bind(null, g.client.id)}>
                <button className="btn">Revoke</button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None connected.</p>
      )}
    </main>
  );
}

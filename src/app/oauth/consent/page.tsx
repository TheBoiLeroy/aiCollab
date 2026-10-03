import { redirect } from "next/navigation";
import { decideAuthorization } from "@/app/actions";
import { SubmitButton } from "@/components/forms";
import { requireUser } from "@/lib/supabase/server";

// Supabase Auth's OAuth 2.1 server sends people here (the project's
// "authorization path") when an MCP client such as Claude asks for access.

export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const { authorization_id: id } = await searchParams;
  const { supabase, user } = await requireUser();
  if (typeof id !== "string") return <Problem text="This sign-in link is missing its authorization ID." />;

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return <Problem text={error?.message ?? "This authorization request expired. Start again from your AI app."} />;
  // Already approved earlier for these scopes: go straight back to the client.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const host = (() => {
    try {
      return new URL(data.redirect_uri).host;
    } catch {
      return data.redirect_uri;
    }
  })();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-12">
      <div className="card flex flex-col gap-4">
        <div>
          <p className="text-sm text-muted">Connect to Intermediary</p>
          <h1 className="text-xl font-semibold">{data.client.name || "An app"} wants access to your account</h1>
        </div>
        <ul className="list-disc pl-5 text-sm leading-relaxed">
          <li>See your workspaces, team artifacts and proposals</li>
          <li>Publish artifacts and propose changes as you</li>
          <li>Approve or reject proposals when you ask it to</li>
        </ul>
        <p className="text-xs text-muted">
          Signed in as {user.email}. It will send you back to <span className="font-mono">{host}</span>. Your private
          threads in Intermediary are not shared. You can revoke access later from AI keys.
        </p>
        <div className="flex gap-2">
          <form action={decideAuthorization.bind(null, data.authorization_id, "approve")} className="flex-1">
            <SubmitButton className="btn-primary w-full" pendingText="Connecting…">Allow</SubmitButton>
          </form>
          <form action={decideAuthorization.bind(null, data.authorization_id, "deny")} className="flex-1">
            <SubmitButton className="btn w-full" pendingText="…">Deny</SubmitButton>
          </form>
        </div>
      </div>
    </main>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="card">
        <h1 className="text-lg font-semibold">Couldn&apos;t connect</h1>
        <p className="mt-1 text-sm text-muted">{text}</p>
      </div>
    </main>
  );
}

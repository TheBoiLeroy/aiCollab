import { headers } from "next/headers";
import { inviteMember, revokeInvite, rotateInviteLink } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { displayName } from "@/lib/types";
import { loadWorkspace } from "@/lib/workspace";
import { CopyInviteLink } from "./copy-link";
import { RemoveMemberButton } from "./remove-button";

export default async function MembersPage({ params }: PageProps<"/w/[wsId]/members">) {
  const { wsId } = await params;
  const { supabase, user, workspace, members } = await loadWorkspace(wsId);
  const { data: invites } = await supabase
    .from("workspace_invites")
    .select("id, email")
    .eq("workspace_id", wsId)
    .is("accepted_at", null);
  const isCreator = workspace.created_by === user.id;
  const full = members.length + (invites?.length ?? 0) >= 5;
  const { data: token } = isCreator
    ? await supabase.rpc("workspace_invite_token", { ws: wsId })
    : { data: null };
  // Build the link from the host the creator is on (localhost, preview, prod).
  const h = await headers();
  const origin = h.get("host")
    ? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold">Members</h1>
      <ul className="mb-8 flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.id} className="card flex items-center justify-between">
            <span>
              {displayName(m)} <span className="text-xs text-muted">{m.email}</span>
            </span>
            {m.id === workspace.created_by ? (
              <span className="text-xs text-muted">Created the workspace</span>
            ) : (
              isCreator && <RemoveMemberButton workspaceId={wsId} userId={m.id} name={displayName(m)} />
            )}
          </li>
        ))}
        {invites?.map((i) => (
          <li key={i.id} className="card flex items-center justify-between text-muted">
            <span>{i.email} · invited</span>
            {isCreator && (
              <form action={revokeInvite.bind(null, i.id, wsId)}>
                <button className="btn">Revoke</button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {isCreator && token && (
        <section className="card mb-4">
          <h2 className="mb-1 font-medium">Invite link</h2>
          <p className="mb-3 text-sm text-muted">
            Anyone with this link can sign up or sign in and join, up to 5 members.
          </p>
          {members.length >= 5 ? (
            <p className="text-sm text-muted">This workspace is full.</p>
          ) : (
            <CopyInviteLink url={`${origin}/join/${token}`} />
          )}
          <form action={rotateInviteLink.bind(null, wsId)} className="mt-2">
            <button className="text-xs text-muted hover:underline">Reset link (the old one stops working)</button>
          </form>
        </section>
      )}

      {isCreator ? (
        <section className="card">
          <h2 className="mb-3 font-medium">Invite by email</h2>
          {full ? (
            <p className="text-sm text-muted">This workspace is full (5 people, including pending invites).</p>
          ) : (
            <ActionForm action={inviteMember} className="flex flex-col gap-2" resetOnSuccess>
              <input type="hidden" name="workspace_id" value={wsId} />
              <div className="flex gap-2">
                <input name="email" type="email" required placeholder="teammate@example.com" className="input" />
                <SubmitButton pendingText="Inviting…">Invite</SubmitButton>
              </div>
            </ActionForm>
          )}
          <p className="mt-2 text-xs text-muted">
            They&apos;ll see the invite on their workspaces page after signing in with that email.
          </p>
        </section>
      ) : (
        <p className="text-sm text-muted">Only the person who created the workspace can invite others.</p>
      )}
    </main>
  );
}

import { inviteMember, revokeInvite } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { displayName } from "@/lib/types";
import { loadWorkspace } from "@/lib/workspace";

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

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold">Members</h1>
      <ul className="mb-8 flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.id} className="card flex items-center justify-between">
            <span>
              {displayName(m)} <span className="text-xs text-muted">{m.email}</span>
            </span>
            {m.id === workspace.created_by && <span className="text-xs text-muted">Created the workspace</span>}
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

      {isCreator ? (
        <section className="card">
          <h2 className="mb-3 font-medium">Invite a teammate</h2>
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

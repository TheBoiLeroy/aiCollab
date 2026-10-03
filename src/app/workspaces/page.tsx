import Link from "next/link";
import { acceptInvite, createWorkspace, signOut } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { requireUser } from "@/lib/supabase/server";

type InviteRow = { id: string; workspaces: { name: string } | null };

export default async function WorkspacesPage() {
  const { supabase, user } = await requireUser();
  const [{ data: memberships }, { data: invites }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("workspaces(id, name, created_at)")
      .eq("user_id", user.id)
      .returns<{ workspaces: { id: string; name: string } }[]>(),
    supabase
      .from("workspace_invites")
      .select("id, workspaces(name)")
      .ilike("email", user.email ?? "")
      .is("accepted_at", null)
      .returns<InviteRow[]>(),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your workspaces</h1>
        <form action={signOut}>
          <button className="btn">Sign out</button>
        </form>
      </header>

      {!!invites?.length && (
        <section className="mb-8">
          <h2 className="label">Invitations</h2>
          <ul className="flex flex-col gap-2">
            {invites.map((inv) => (
              <li key={inv.id} className="card flex items-center justify-between">
                <span>
                  You&apos;re invited to <strong>{inv.workspaces?.name ?? "a workspace"}</strong>
                </span>
                <form action={acceptInvite.bind(null, inv.id)}>
                  <SubmitButton pendingText="Joining…">Join</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-8">
        {memberships?.length ? (
          <ul className="flex flex-col gap-2">
            {memberships.map(({ workspaces: w }) => (
              <li key={w.id}>
                <Link href={`/w/${w.id}`} className="card block hover:border-accent">
                  {w.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">You&apos;re not in a workspace yet. Create one, or ask a teammate to invite {user.email}.</p>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium">New workspace</h2>
        <ActionForm action={createWorkspace} className="flex gap-2">
          <input name="name" placeholder="e.g. Database team" className="input" required maxLength={80} />
          <SubmitButton pendingText="Creating…">Create</SubmitButton>
        </ActionForm>
        <p className="mt-2 text-xs text-muted">Workspaces hold 2 to 5 people. You can invite teammates once it exists.</p>
      </section>
    </main>
  );
}

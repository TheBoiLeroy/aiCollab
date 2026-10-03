import Link from "next/link";
import { createThread } from "@/app/actions";
import { SubmitButton } from "@/components/forms";
import { availableModels } from "@/lib/models";
import { loadWorkspace } from "@/lib/workspace";
import type { Artifact, Thread } from "@/lib/types";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[wsId]">) {
  const { wsId } = await params;
  const { supabase, user, workspace } = await loadWorkspace(wsId);
  const [{ data: threads }, { data: artifacts }] = await Promise.all([
    supabase
      .from("threads")
      .select("id, title, updated_at")
      .eq("workspace_id", wsId)
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50)
      .returns<Pick<Thread, "id" | "title">[]>(),
    supabase
      .from("artifacts")
      .select("id, title")
      .eq("workspace_id", wsId)
      .order("updated_at", { ascending: false })
      .returns<Pick<Artifact, "id" | "title">[]>(),
  ]);
  const hasModels = availableModels().length > 0;

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-6 border-b border-border bg-surface p-4 md:sticky md:top-0 md:h-screen md:w-64 md:overflow-y-auto md:border-b-0 md:border-r">
        <div>
          <Link href="/workspaces" className="text-xs text-muted hover:underline">
            ← All workspaces
          </Link>
          <Link href={`/w/${wsId}`} className="mt-1 block truncate text-lg font-semibold">
            {workspace.name}
          </Link>
          <nav className="mt-2 flex gap-3 text-sm text-muted">
            <Link href={`/w/${wsId}`} className="hover:text-foreground">Feed</Link>
            <Link href={`/w/${wsId}/members`} className="hover:text-foreground">Members</Link>
          </nav>
        </div>

        <form action={createThread}>
          <input type="hidden" name="workspace_id" value={wsId} />
          <SubmitButton className="btn-primary w-full" pendingText="Starting…">
            New private thread
          </SubmitButton>
          {!hasModels && <p className="mt-2 text-xs text-red-600">No AI provider keys are configured on the server.</p>}
        </form>

        <section>
          <h2 className="label">My threads · private</h2>
          <ul className="flex flex-col text-sm">
            {threads?.map((t) => (
              <li key={t.id}>
                <Link href={`/w/${wsId}/t/${t.id}`} className="block truncate rounded px-2 py-1 hover:bg-code">
                  {t.title}
                </Link>
              </li>
            ))}
            {!threads?.length && <li className="px-2 text-xs text-muted">None yet</li>}
          </ul>
        </section>

        <section>
          <h2 className="label">Team artifacts</h2>
          <ul className="flex flex-col text-sm">
            {artifacts?.map((a) => (
              <li key={a.id}>
                <Link href={`/w/${wsId}/a/${a.id}`} className="block truncate rounded px-2 py-1 hover:bg-code">
                  {a.title}
                </Link>
              </li>
            ))}
            {!artifacts?.length && <li className="px-2 text-xs text-muted">Nothing published yet</li>}
          </ul>
        </section>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

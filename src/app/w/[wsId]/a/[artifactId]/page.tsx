import Link from "next/link";
import { notFound } from "next/navigation";
import { createThread } from "@/app/actions";
import { SubmitButton } from "@/components/forms";
import { FormatBadge, StatusBadge, timeAgo } from "@/components/status";
import { displayName, type Artifact, type ArtifactVersion, type Proposal } from "@/lib/types";
import { loadWorkspace } from "@/lib/workspace";

export default async function ArtifactPage({ params, searchParams }: PageProps<"/w/[wsId]/a/[artifactId]">) {
  const { wsId, artifactId } = await params;
  const { v } = await searchParams;
  const { supabase, people } = await loadWorkspace(wsId);

  const { data: artifact } = await supabase.from("artifacts").select("*").eq("id", artifactId).maybeSingle<Artifact>();
  if (!artifact || artifact.workspace_id !== wsId) notFound();

  const [{ data: versions }, { data: proposals }] = await Promise.all([
    supabase
      .from("artifact_versions")
      .select("*")
      .eq("artifact_id", artifactId)
      .eq("is_official", true)
      .order("version_number", { ascending: false })
      .returns<ArtifactVersion[]>(),
    supabase
      .from("proposals")
      .select("*")
      .eq("artifact_id", artifactId)
      .order("updated_at", { ascending: false })
      .returns<Proposal[]>(),
  ]);

  const shown = versions?.find((x) => x.id === v) ?? versions?.find((x) => x.id === artifact.current_version_id);
  if (!shown) notFound();
  const isCurrent = shown.id === artifact.current_version_id;
  const acceptedBy = new Map((proposals ?? []).filter((p) => p.status === "accepted").map((p) => [p.proposed_version_id, p]));

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{artifact.title}</h1>
            <FormatBadge format={artifact.format} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {isCurrent ? "Official" : "Older official"} v{shown.version_number} by {displayName(people.get(shown.author_id))} ·{" "}
            {timeAgo(shown.created_at)}
            {!isCurrent && (
              <>
                {" · "}
                <Link href={`/w/${wsId}/a/${artifactId}`} className="underline">See current</Link>
              </>
            )}
          </p>
        </div>
        <form action={createThread}>
          <input type="hidden" name="workspace_id" value={wsId} />
          <input type="hidden" name="forked_from_version_id" value={shown.id} />
          <SubmitButton pendingText="Forking…">Fork into a private thread</SubmitButton>
        </form>
      </div>

      {shown.summary && (
        <section className="card mb-6">
          <h2 className="label">Summary</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{shown.summary}</p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="label">Content</h2>
        <pre className="code max-h-[70vh] overflow-y-auto">{shown.content}</pre>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="label">Proposals</h2>
          {proposals?.length ? (
            <ul className="flex flex-col gap-2">
              {proposals.map((p) => (
                <li key={p.id}>
                  <Link href={`/w/${wsId}/p/${p.id}`} className="card flex items-center justify-between gap-2 hover:border-accent">
                    <span className="truncate text-sm">
                      {displayName(people.get(p.author_id))} · {timeAgo(p.updated_at)}
                    </span>
                    <StatusBadge status={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No proposals yet. Fork it to suggest a change.</p>
          )}
        </section>
        <section>
          <h2 className="label">Official history</h2>
          <ol className="flex flex-col gap-1 text-sm">
            {versions?.map((ver) => (
              <li key={ver.id}>
                <Link
                  href={`/w/${wsId}/a/${artifactId}?v=${ver.id}`}
                  className={`block rounded px-2 py-1 hover:bg-code ${ver.id === shown.id ? "bg-code" : ""}`}
                >
                  v{ver.version_number} · {displayName(people.get(ver.author_id))} · {timeAgo(ver.created_at)}
                  {acceptedBy.has(ver.id) ? " · via proposal" : ver.version_number === 1 ? " · first published" : ""}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}

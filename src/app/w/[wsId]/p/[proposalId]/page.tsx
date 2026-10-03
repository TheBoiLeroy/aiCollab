import Link from "next/link";
import { notFound } from "next/navigation";
import { createThread } from "@/app/actions";
import { DiffView } from "@/components/diff-view";
import { SubmitButton } from "@/components/forms";
import { StatusBadge, timeAgo } from "@/components/status";
import { displayName, type Artifact, type ArtifactVersion, type Proposal, type Review } from "@/lib/types";
import { loadWorkspace } from "@/lib/workspace";
import { RebaseButton, ReviewPanel } from "./review-panel";

export default async function ProposalPage({ params }: PageProps<"/w/[wsId]/p/[proposalId]">) {
  const { wsId, proposalId } = await params;
  const { supabase, user, members, people } = await loadWorkspace(wsId);

  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", proposalId).maybeSingle<Proposal>();
  if (!proposal || proposal.workspace_id !== wsId) notFound();

  const [{ data: artifact }, { data: versions }, { data: reviews }] = await Promise.all([
    supabase.from("artifacts").select("*").eq("id", proposal.artifact_id).single<Artifact>(),
    supabase
      .from("artifact_versions")
      .select("*")
      .in("id", [proposal.base_version_id, proposal.proposed_version_id])
      .returns<ArtifactVersion[]>(),
    supabase
      .from("reviews")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: false })
      .returns<Review[]>(),
  ]);
  if (!artifact) notFound();
  const base = versions?.find((x) => x.id === proposal.base_version_id);
  const proposed = versions?.find((x) => x.id === proposal.proposed_version_id);

  const isAuthor = proposal.author_id === user.id;
  const current = (reviews ?? []).filter((r) => r.revision === proposal.revision);
  const earlier = (reviews ?? []).filter((r) => r.revision < proposal.revision && r.comment);
  const myVote = current.find((r) => r.reviewer_id === user.id);
  const reviewers = members.filter((m) => m.id !== proposal.author_id);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link href={`/w/${wsId}/a/${artifact.id}`} className="text-sm text-muted hover:underline">
          {artifact.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Proposal by {displayName(people.get(proposal.author_id))}</h1>
          <StatusBadge status={proposal.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          Against official v{base?.version_number} · revision {proposal.revision} · updated {timeAgo(proposal.updated_at)}
        </p>
      </div>

      {proposal.status === "needs_rebase" && (
        <div className="card mb-6 border-sky-500/40 text-sm">
          Another proposal was accepted, so this one was made against an older version.{" "}
          {isAuthor ? (
            <>Your AI can regenerate the change against the new official version, then it goes back for review.</>
          ) : (
            <>Its author needs to rebase it before it can be reviewed.</>
          )}
          {isAuthor && (
            <div className="mt-3">
              <RebaseButton proposalId={proposal.id} />
            </div>
          )}
        </div>
      )}

      {proposal.status === "rejected" && isAuthor && (
        <div className="card mb-6 border-red-500/40 text-sm">
          A teammate rejected this revision. Read their comments below, revise it with your AI, and send it again.
          {proposal.source_thread_id && (
            <div className="mt-3">
              <Link href={`/w/${wsId}/t/${proposal.source_thread_id}`} className="btn-primary">
                Revise in your thread
              </Link>
            </div>
          )}
        </div>
      )}

      <section className="card mb-6">
        <h2 className="label">Summary</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{proposal.summary || "No summary."}</p>
      </section>

      <section className="mb-6">
        <h2 className="label">Changes</h2>
        <DiffView diff={proposal.diff} />
        {proposed && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted">Show the full proposed version</summary>
            <pre className="code mt-2 max-h-[60vh] overflow-y-auto">{proposed.content}</pre>
          </details>
        )}
      </section>

      <section className="mb-6">
        <h2 className="label">Votes · every member except the author must approve</h2>
        <ul className="flex flex-col gap-2">
          {reviewers.map((m) => {
            const r = current.find((x) => x.reviewer_id === m.id);
            return (
              <li key={m.id} className="card text-sm">
                <div className="flex items-center justify-between">
                  <span>{displayName(m)}</span>
                  <span
                    className={
                      r?.vote === "approve"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : r?.vote === "reject"
                          ? "text-red-700 dark:text-red-400"
                          : "text-muted"
                    }
                  >
                    {r ? (r.vote === "approve" ? "Approved" : "Rejected") : "Waiting"}
                  </span>
                </div>
                {r?.comment && <p className="mt-2 whitespace-pre-wrap text-muted">{r.comment}</p>}
              </li>
            );
          })}
          {!reviewers.length && <li className="text-sm text-muted">No other members yet.</li>}
        </ul>
      </section>

      {!isAuthor && proposal.status === "open" && (
        <ReviewPanel proposalId={proposal.id} myVote={myVote?.vote ?? null} />
      )}

      {!isAuthor && proposed && proposal.status !== "accepted" && (
        <form action={createThread} className="mb-6">
          <input type="hidden" name="workspace_id" value={wsId} />
          <input type="hidden" name="forked_from_version_id" value={proposed.id} />
          <SubmitButton className="btn" pendingText="Forking…">
            Fork this proposal to suggest your own changes
          </SubmitButton>
        </form>
      )}

      {earlier.length > 0 && (
        <section>
          <h2 className="label">Comments on earlier revisions</h2>
          <ul className="flex flex-col gap-2">
            {earlier.map((r) => (
              <li key={r.id} className="card text-sm">
                <div className="text-xs text-muted">
                  {displayName(people.get(r.reviewer_id))} · revision {r.revision} ·{" "}
                  {r.vote === "approve" ? "approved" : "rejected"}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{r.comment}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

// AI calls (summaries, rebases) run as server actions on this page.
export const maxDuration = 300;

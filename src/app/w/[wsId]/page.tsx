import Link from "next/link";
import { FormatBadge, StatusBadge, timeAgo } from "@/components/status";
import { displayName, type Artifact, type Proposal, type Review } from "@/lib/types";
import { loadWorkspace } from "@/lib/workspace";

export default async function FeedPage({ params }: PageProps<"/w/[wsId]">) {
  const { wsId } = await params;
  const { supabase, user, members, people } = await loadWorkspace(wsId);

  const [{ data: proposals }, { data: artifacts }] = await Promise.all([
    supabase
      .from("proposals")
      .select("*")
      .eq("workspace_id", wsId)
      .order("updated_at", { ascending: false })
      .limit(50)
      .returns<Proposal[]>(),
    supabase
      .from("artifacts")
      .select("*")
      .eq("workspace_id", wsId)
      .order("updated_at", { ascending: false })
      .returns<Artifact[]>(),
  ]);
  const { data: reviews } = await supabase
    .from("reviews")
    .select("*")
    .in("proposal_id", (proposals ?? []).map((p) => p.id))
    .returns<Review[]>();

  const titleOf = new Map((artifacts ?? []).map((a) => [a.id, a.title]));
  const votesOn = (p: Proposal) => (reviews ?? []).filter((r) => r.proposal_id === p.id && r.revision === p.revision);

  const open = (proposals ?? []).filter((p) => p.status === "open");
  const needsMyVote = open.filter((p) => p.author_id !== user.id && !votesOn(p).some((r) => r.reviewer_id === user.id));
  const myToFix = (proposals ?? []).filter(
    (p) => p.author_id === user.id && (p.status === "rejected" || p.status === "needs_rebase"),
  );
  const recent = (proposals ?? []).filter((p) => p.status === "accepted").slice(0, 5);

  const ProposalRow = ({ p }: { p: Proposal }) => {
    const approvals = votesOn(p).filter((r) => r.vote === "approve").length;
    return (
      <li>
        <Link href={`/w/${wsId}/p/${p.id}`} className="card flex items-center justify-between gap-3 hover:border-accent">
          <div className="min-w-0">
            <div className="truncate font-medium">{titleOf.get(p.artifact_id) ?? "Artifact"}</div>
            <div className="truncate text-xs text-muted">
              {displayName(people.get(p.author_id))} · {timeAgo(p.updated_at)} · {p.summary.split("\n")[0]}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
            {p.status === "open" && (
              <span>
                {approvals}/{members.length} approved
              </span>
            )}
            <StatusBadge status={p.status} />
          </div>
        </Link>
      </li>
    );
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      {members.length < 2 && (
        <div className="card mb-6 text-sm">
          You&apos;re the only member so far. <Link href={`/w/${wsId}/members`} className="text-accent underline">Invite teammates</Link>{" "}
          so proposals have someone to review them.
        </div>
      )}

      {needsMyVote.length > 0 && (
        <section className="mb-8">
          <h2 className="label">Waiting on your vote</h2>
          <ul className="flex flex-col gap-2">{needsMyVote.map((p) => <ProposalRow key={p.id} p={p} />)}</ul>
        </section>
      )}

      {myToFix.length > 0 && (
        <section className="mb-8">
          <h2 className="label">Your proposals that need you</h2>
          <ul className="flex flex-col gap-2">{myToFix.map((p) => <ProposalRow key={p.id} p={p} />)}</ul>
        </section>
      )}

      <section className="mb-8">
        <h2 className="label">In review</h2>
        {open.length ? (
          <ul className="flex flex-col gap-2">{open.map((p) => <ProposalRow key={p.id} p={p} />)}</ul>
        ) : (
          <p className="text-sm text-muted">No open proposals.</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="label">Artifacts</h2>
        {artifacts?.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {artifacts.map((a) => (
              <li key={a.id}>
                <Link href={`/w/${wsId}/a/${a.id}`} className="card block hover:border-accent">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{a.title}</span>
                    <FormatBadge format={a.format} />
                  </div>
                  <div className="mt-1 text-xs text-muted">Updated {timeAgo(a.updated_at)}</div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Nothing published yet. Start a private thread, build something with your AI, then press Publish artifact.
          </p>
        )}
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="label">Recently accepted</h2>
          <ul className="flex flex-col gap-2">{recent.map((p) => <ProposalRow key={p.id} p={p} />)}</ul>
        </section>
      )}
    </main>
  );
}

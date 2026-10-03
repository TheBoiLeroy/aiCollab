"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { castReview, rebaseProposal } from "@/app/actions";

export function ReviewPanel({ proposalId, myVote }: { proposalId: string; myVote: "approve" | "reject" | null }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function vote(v: "approve" | "reject") {
    setError(null);
    start(async () => {
      const res = await castReview({ proposalId, vote: v, comment });
      if (res.error) setError(res.error);
      else {
        setComment("");
        router.refresh();
      }
    });
  }

  return (
    <section className="card mb-6">
      <h2 className="mb-2 font-medium">{myVote ? "You approved this revision" : "Your review"}</h2>
      <textarea
        className="input min-h-20"
        placeholder="Comment (required to reject)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button className="btn-primary" disabled={pending || myVote === "approve"} onClick={() => vote("approve")}>
          Approve
        </button>
        <button className="btn-danger" disabled={pending || !comment.trim()} onClick={() => vote("reject")}>
          Reject
        </button>
      </div>
    </section>
  );
}

export function RebaseButton({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await rebaseProposal(proposalId);
            if (res.error) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Your AI is rebasing…" : "Rebase"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );
}

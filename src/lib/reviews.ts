import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Proposal, Review } from "@/lib/types";

/** Artifacts with an open proposal this person didn't write and hasn't voted on yet. */
export async function artifactsAwaitingReview(supabase: SupabaseClient, wsId: string, userId: string) {
  const { data: open } = await supabase
    .from("proposals")
    .select("id, artifact_id, revision")
    .eq("workspace_id", wsId)
    .eq("status", "open")
    .neq("author_id", userId)
    .returns<Pick<Proposal, "id" | "artifact_id" | "revision">[]>();
  if (!open?.length) return new Set<string>();

  const { data: mine } = await supabase
    .from("reviews")
    .select("proposal_id, revision")
    .eq("reviewer_id", userId)
    .in("proposal_id", open.map((p) => p.id))
    .returns<Pick<Review, "proposal_id" | "revision">[]>();
  const voted = new Set((mine ?? []).map((r) => `${r.proposal_id}:${r.revision}`));
  return new Set(open.filter((p) => !voted.has(`${p.id}:${p.revision}`)).map((p) => p.artifact_id));
}

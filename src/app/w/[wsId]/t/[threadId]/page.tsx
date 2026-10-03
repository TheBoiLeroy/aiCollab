import { notFound } from "next/navigation";
import { availableModels } from "@/lib/models";
import type { Artifact, ArtifactVersion, Message, Proposal, Thread } from "@/lib/types";
import { loadWorkspace } from "@/lib/workspace";
import { ChatView, type ForkInfo } from "./chat-view";

export default async function ThreadPage({ params }: PageProps<"/w/[wsId]/t/[threadId]">) {
  const { wsId, threadId } = await params;
  const { supabase, workspace } = await loadWorkspace(wsId);

  const { data: thread } = await supabase.from("threads").select("*").eq("id", threadId).maybeSingle<Thread>();
  if (!thread || thread.workspace_id !== wsId) notFound();

  const [{ data: messages }, { data: liveProposal }] = await Promise.all([
    supabase.from("messages").select("*").eq("thread_id", threadId).order("created_at").returns<Message[]>(),
    supabase
      .from("proposals")
      .select("*")
      .eq("source_thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Proposal>(),
  ]);

  let fork: ForkInfo | null = null;
  if (thread.forked_from_version_id) {
    const { data: version } = await supabase
      .from("artifact_versions")
      .select("*")
      .eq("id", thread.forked_from_version_id)
      .single<ArtifactVersion>();
    const { data: artifact } = version
      ? await supabase.from("artifacts").select("*").eq("id", version.artifact_id).single<Artifact>()
      : { data: null };
    if (version && artifact) {
      // Proposals land on the forked version when it is official, else on the current official one.
      const baseId = version.is_official ? version.id : artifact.current_version_id;
      const { data: base } = await supabase
        .from("artifact_versions")
        .select("id, version_number, content")
        .eq("id", baseId!)
        .single<Pick<ArtifactVersion, "id" | "version_number" | "content">>();
      fork = {
        artifactId: artifact.id,
        title: artifact.title,
        format: artifact.format,
        versionNumber: version.version_number,
        isOfficial: version.is_official,
        isCurrent: artifact.current_version_id === version.id,
        baseVersionNumber: base?.version_number ?? version.version_number,
        baseContent: base?.content ?? version.content,
      };
    }
  }

  const models = availableModels();
  if (!models.some((m) => m.id === thread.model)) {
    models.push({ id: thread.model, label: `${thread.model} (not configured)`, provider: "anthropic" });
  }

  return (
    <ChatView
      key={thread.id}
      workspaceId={wsId}
      workspaceName={workspace.name}
      thread={thread}
      initialMessages={messages ?? []}
      models={models.map(({ id, label }) => ({ id, label }))}
      fork={fork}
      liveProposal={
        liveProposal && fork?.artifactId === liveProposal.artifact_id
          ? { id: liveProposal.id, status: liveProposal.status }
          : null
      }
    />
  );
}

// AI calls (summaries, rebases) run as server actions on this page.
export const maxDuration = 300;

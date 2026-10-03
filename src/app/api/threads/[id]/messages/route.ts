import { threadSystemPrompt } from "@/lib/artifacts";
import { streamChat, type ChatTurn } from "@/lib/models";
import { createClient } from "@/lib/supabase/server";
import type { Artifact, ArtifactVersion, Message, Thread, Workspace } from "@/lib/types";
import { displayName } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/threads/[id]/messages">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json().catch(() => null)) as { content?: string } | null;
  const content = body?.content?.trim();
  if (!content) return new Response("Message is empty", { status: 400 });

  // RLS limits this to the owner's own threads.
  const { data: thread } = await supabase.from("threads").select("*").eq("id", id).single<Thread>();
  if (!thread) return new Response("Not found", { status: 404 });

  const [{ data: history }, { data: workspace }, { data: profile }] = await Promise.all([
    supabase.from("messages").select("role, content").eq("thread_id", id).order("created_at"),
    supabase.from("workspaces").select("*").eq("id", thread.workspace_id).single<Workspace>(),
    supabase.from("profiles").select("display_name, email").eq("id", user.id).single(),
  ]);

  let fork = null;
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
      const officialNote =
        artifact.current_version_id === version.id
          ? "It is the team's current official version."
          : version.is_official
            ? "A newer official version exists now."
            : "It is a teammate's proposed version, not yet official.";
      fork = { artifact, version, officialNote };
    }
  }

  const { error: insertError } = await supabase
    .from("messages")
    .insert({ thread_id: id, role: "user", content });
  if (insertError) return new Response(insertError.message, { status: 500 });

  if (!history?.length && thread.title === "New thread") {
    const title = content.split("\n")[0].slice(0, 60);
    await supabase.from("threads").update({ title }).eq("id", id);
  }

  const messages: ChatTurn[] = [...((history as Pick<Message, "role" | "content">[]) ?? []), { role: "user", content }];
  const system = threadSystemPrompt({
    userName: displayName(profile),
    workspaceName: workspace?.name ?? "Workspace",
    fork,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let reply = "";
      try {
        for await (const piece of streamChat({ model: thread.model, system, messages })) {
          reply += piece;
          controller.enqueue(encoder.encode(piece));
        }
      } catch (e) {
        const note = `\n\n_Error from the model: ${e instanceof Error ? e.message : "unknown error"}_`;
        reply += note;
        controller.enqueue(encoder.encode(note));
      }
      if (reply.trim()) {
        await supabase
          .from("messages")
          .insert({ thread_id: id, role: "assistant", content: reply, model: thread.model });
        await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", id);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

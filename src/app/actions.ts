"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  extractArtifact,
  makeDiff,
  REBASE_SYSTEM,
  rebaseRequest,
  SUMMARY_SYSTEM,
  summaryRequest,
} from "@/lib/artifacts";
import { adapters, availableModels, complete, loadCredentials, resolveModel, type Provider } from "@/lib/models";
import { encryptKey, keyHint, PROVIDERS } from "@/lib/models/keys";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Artifact, ArtifactVersion, Format, Message, Proposal, Thread } from "@/lib/types";
import { FORMATS } from "@/lib/types";

export type ActionResult = { error?: string; ok?: boolean; value?: string };

function str(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signIn(_: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: str(form, "email"),
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: error.message };
  const next = str(form, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/workspaces");
}

export async function signUp(_: ActionResult, form: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  // Carry an invite link (or other page) through sign-up and email confirmation.
  const next = str(form, "next");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "";
  const { data, error } = await supabase.auth.signUp({
    email: str(form, "email"),
    password: String(form.get("password") ?? ""),
    options: {
      emailRedirectTo: `${origin}/auth/confirm${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`,
      data: { display_name: str(form, "display_name") || undefined },
    },
  });
  if (error) return { error: error.message };
  if (data.session) redirect(safeNext || "/workspaces");
  return { ok: true, value: "Check your email to confirm your account, then sign in." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Workspaces and invites
// ---------------------------------------------------------------------------

export async function createWorkspace(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const name = str(form, "name");
  if (!name) return { error: "Give the workspace a name." };
  const { data, error } = await supabase
    .from("workspaces")
    .insert({ name, created_by: user.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  redirect(`/w/${data.id}`);
}

export async function inviteMember(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const workspaceId = str(form, "workspace_id");
  const email = str(form, "email").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };

  const [{ count: members }, { count: pending }] = await Promise.all([
    supabase.from("workspace_members").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase
      .from("workspace_invites")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null),
  ]);
  if ((members ?? 0) + (pending ?? 0) >= 5) return { error: "A workspace can have at most 5 members." };

  const { error } = await supabase
    .from("workspace_invites")
    .insert({ workspace_id: workspaceId, email, invited_by: user.id });
  if (error) {
    if (error.code === "23505") return { error: "That person is already invited." };
    if (error.code === "42501") return { error: "Only the workspace creator can invite people." };
    return { error: error.message };
  }
  revalidatePath(`/w/${workspaceId}/members`);
  return { ok: true, value: `Invited ${email}. They'll see the invite after signing up with that email.` };
}

export async function removeMember(workspaceId: string, userId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("remove_member", { ws: workspaceId, target: userId });
  if (error) return { error: error.message };
  revalidatePath(`/w/${workspaceId}`, "layout");
  return { ok: true };
}

export async function revokeInvite(inviteId: string, workspaceId: string) {
  const { supabase } = await requireUser();
  await supabase.from("workspace_invites").delete().eq("id", inviteId);
  revalidatePath(`/w/${workspaceId}/members`);
}

export async function rotateInviteLink(workspaceId: string) {
  const { supabase } = await requireUser();
  await supabase.rpc("workspace_invite_token", { ws: workspaceId, rotate: true });
  revalidatePath(`/w/${workspaceId}/members`);
}

export async function joinWorkspace(token: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("join_workspace", { p_token: token });
  if (error) {
    const full = /at most 5 members/.test(error.message);
    redirect(`/join/${token}?error=${full ? "full" : "invalid"}`);
  }
  redirect(`/w/${data}`);
}

export async function acceptInvite(inviteId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_invite", { invite_id: inviteId });
  if (error) throw new Error(error.message);
  redirect(`/w/${data}`);
}

// ---------------------------------------------------------------------------
// Personal AI keys
// ---------------------------------------------------------------------------

export async function saveProviderKey(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const provider = str(form, "provider") as Provider;
  const apiKey = str(form, "api_key");
  const workspaceId = str(form, "workspace_id") || undefined;
  const meta = PROVIDERS.find((p) => p.id === provider);
  if (!meta) return { error: "Unknown provider." };
  if (!apiKey) return { error: "Paste an API key." };

  try {
    await adapters[provider].verify({ apiKey, workspaceId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return { error: `${meta.label} rejected that key: ${message}` };
  }

  const { error } = await supabase.from("user_provider_keys").upsert({
    user_id: user.id,
    provider,
    ciphertext: encryptKey({ apiKey, workspaceId }),
    hint: keyHint(apiKey),
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, value: `Saved your ${meta.label} key.` };
}

export async function removeProviderKey(provider: Provider) {
  const { supabase, user } = await requireUser();
  await supabase.from("user_provider_keys").delete().eq("user_id", user.id).eq("provider", provider);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Connected AI apps (MCP clients via Supabase OAuth)
// ---------------------------------------------------------------------------

export async function decideAuthorization(authorizationId: string, decision: "approve" | "deny") {
  const { supabase } = await requireUser();
  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data) throw new Error(error?.message ?? "Couldn't complete the authorization.");
  redirect(data.redirect_url);
}

export async function revokeConnectedApp(clientId: string) {
  const { supabase } = await requireUser();
  await supabase.auth.oauth.revokeGrant({ clientId });
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export async function createThread(form: FormData) {
  const { supabase, user } = await requireUser();
  const workspaceId = str(form, "workspace_id");
  const forkedFrom = str(form, "forked_from_version_id") || null;
  const creds = await loadCredentials(supabase, user.id);
  const model = resolveModel(creds, str(form, "model") || null);
  if (!model) redirect(`/settings?next=${encodeURIComponent(`/w/${workspaceId}`)}`);

  let title = "New thread";
  if (forkedFrom) {
    const { data: version } = await supabase
      .from("artifact_versions")
      .select("version_number, artifacts(title)")
      .eq("id", forkedFrom)
      .single<{ version_number: number; artifacts: { title: string } }>();
    if (version) title = `Fork of ${version.artifacts.title} v${version.version_number}`;
  }

  const { data, error } = await supabase
    .from("threads")
    .insert({ workspace_id: workspaceId, owner_id: user.id, model, title, forked_from_version_id: forkedFrom })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/w/${workspaceId}/t/${data.id}`);
}

export async function setThreadModel(threadId: string, model: string) {
  const { supabase, user } = await requireUser();
  if (!availableModels(await loadCredentials(supabase, user.id)).some((m) => m.id === model)) return;
  await supabase.from("threads").update({ model }).eq("id", threadId);
}

export async function deleteThread(threadId: string, workspaceId: string) {
  const { supabase } = await requireUser();
  await supabase.from("threads").delete().eq("id", threadId);
  redirect(`/w/${workspaceId}`);
}

async function loadThread(threadId: string) {
  const { supabase, user } = await requireUser();
  const { data: thread } = await supabase.from("threads").select("*").eq("id", threadId).single<Thread>();
  if (!thread) throw new Error("Thread not found");
  return { supabase, user, thread };
}

function conversationExcerpt(messages: Pick<Message, "role" | "content">[]) {
  // Most recent turns carry the intent; keep the prompt bounded.
  let out = "";
  for (const m of [...messages].reverse()) {
    const line = `${m.role === "user" ? "User" : "AI"}: ${m.content}\n\n`;
    if (out.length + line.length > 24000) break;
    out = line + out;
  }
  return out.trim();
}

// ---------------------------------------------------------------------------
// Publishing and proposals
// ---------------------------------------------------------------------------

/** Ask the thread's model to write the summary the author reviews before sharing. */
export async function draftSummary(input: {
  threadId: string;
  title: string;
  format: Format;
  content: string;
  againstOfficial: boolean;
}): Promise<ActionResult> {
  try {
    const { supabase, user, thread } = await loadThread(input.threadId);
    const creds = await loadCredentials(supabase, user.id);
    const model = resolveModel(creds, thread.model);
    if (!model) return { error: "Add an AI key under AI keys to draft a summary." };
    const { data: messages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("thread_id", thread.id)
      .order("created_at");

    let baseContent: string | undefined;
    if (input.againstOfficial) {
      const target = await proposalTarget(thread.forked_from_version_id);
      baseContent = target?.base.content;
    }

    const summary = await complete({
      model,
      system: SUMMARY_SYSTEM,
      messages: [
        {
          role: "user",
          content: summaryRequest({
            title: input.title,
            format: input.format,
            content: input.content,
            baseContent,
            conversation: conversationExcerpt(messages ?? []),
          }),
        },
      ],
      quick: true,
    }, creds);
    return { ok: true, value: summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't draft a summary." };
  }
}

export async function publishArtifact(input: {
  threadId: string;
  title: string;
  format: Format;
  content: string;
  summary: string;
}): Promise<ActionResult> {
  const { supabase, thread } = await loadThread(input.threadId);
  if (!input.title.trim()) return { error: "Give the artifact a title." };
  if (!FORMATS.includes(input.format)) return { error: "Pick a format." };
  if (!input.content.trim()) return { error: "The artifact is empty." };
  if (input.format === "json") {
    try {
      JSON.parse(input.content);
    } catch {
      return { error: "That isn't valid JSON." };
    }
  }

  const { data, error } = await supabase.rpc("publish_artifact", {
    ws: thread.workspace_id,
    p_title: input.title.trim(),
    p_format: input.format,
    p_content: input.content,
    p_summary: input.summary.trim(),
  });
  if (error) return { error: error.message };

  // From now on this thread continues from the published version.
  const { data: artifact } = await supabase
    .from("artifacts")
    .select("current_version_id")
    .eq("id", data)
    .single<Pick<Artifact, "current_version_id">>();
  await supabase
    .from("threads")
    .update({ forked_from_version_id: artifact?.current_version_id })
    .eq("id", thread.id);

  redirect(`/w/${thread.workspace_id}/a/${data}`);
}

/**
 * Where a proposal from a thread forked off `versionId` should land: the version
 * itself when it is official, otherwise (a fork of someone's proposal) the
 * artifact's current official version.
 */
async function proposalTarget(versionId: string | null) {
  if (!versionId) return null;
  const supabase = await createClient();
  const { data: forked } = await supabase
    .from("artifact_versions")
    .select("*")
    .eq("id", versionId)
    .single<ArtifactVersion>();
  if (!forked) return null;
  const { data: artifact } = await supabase
    .from("artifacts")
    .select("*")
    .eq("id", forked.artifact_id)
    .single<Artifact>();
  if (!artifact?.current_version_id) return null;
  const baseId = forked.is_official ? forked.id : artifact.current_version_id;
  const { data: base } = await supabase
    .from("artifact_versions")
    .select("*")
    .eq("id", baseId)
    .single<ArtifactVersion>();
  if (!base) return null;
  return { artifact, base };
}

export async function proposeChange(input: {
  threadId: string;
  content: string;
  summary: string;
}): Promise<ActionResult> {
  const { supabase, thread } = await loadThread(input.threadId);
  const target = await proposalTarget(thread.forked_from_version_id);
  if (!target) return { error: "This thread isn't based on a team artifact." };
  if (!input.content.trim()) return { error: "The proposed version is empty." };
  if (input.content === target.base.content) return { error: "Nothing changed from the official version." };

  const { artifact, base } = target;
  const diff = makeDiff(artifact.title, base.content, input.content);

  // A thread keeps one live proposal; resending after a rejection revises it.
  const { data: existing } = await supabase
    .from("proposals")
    .select("*")
    .eq("source_thread_id", thread.id)
    .in("status", ["open", "rejected", "needs_rebase"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Proposal>();

  if (existing && existing.artifact_id === artifact.id) {
    if (base.id !== artifact.current_version_id) {
      return { error: "The official version changed since you forked it. Open the proposal and press Rebase." };
    }
    const { error } = await supabase.rpc("revise_proposal", {
      pid: existing.id,
      new_base: base.id,
      p_content: input.content,
      p_summary: input.summary.trim(),
      p_diff: diff,
    });
    if (error) return { error: error.message };
    redirect(`/w/${thread.workspace_id}/p/${existing.id}`);
  }

  const { data, error } = await supabase.rpc("create_proposal", {
    art: artifact.id,
    base: base.id,
    p_content: input.content,
    p_summary: input.summary.trim(),
    p_diff: diff,
    p_thread: thread.id,
  });
  if (error) return { error: error.message };
  redirect(`/w/${thread.workspace_id}/p/${data}`);
}

export async function castReview(input: {
  proposalId: string;
  vote: "approve" | "reject";
  comment: string;
}): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("cast_review", {
    pid: input.proposalId,
    p_vote: input.vote,
    p_comment: input.comment,
  });
  if (error) return { error: error.message };
  revalidatePath("/w", "layout");
  return { ok: true, value: data as string };
}

/** The author's AI regenerates the change against the new official version. */
export async function rebaseProposal(proposalId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", proposalId).single<Proposal>();
  if (!proposal) return { error: "Proposal not found." };
  if (proposal.author_id !== user.id) return { error: "Only the author can rebase." };

  const { data: artifact } = await supabase
    .from("artifacts")
    .select("*")
    .eq("id", proposal.artifact_id)
    .single<Artifact>();
  if (!artifact?.current_version_id) return { error: "Artifact not found." };

  const ids = [proposal.base_version_id, proposal.proposed_version_id, artifact.current_version_id];
  const { data: versions } = await supabase.from("artifact_versions").select("*").in("id", ids);
  const byId = new Map((versions as ArtifactVersion[] | null)?.map((v) => [v.id, v]));
  const oldBase = byId.get(proposal.base_version_id);
  const proposed = byId.get(proposal.proposed_version_id);
  const newBase = byId.get(artifact.current_version_id);
  if (!oldBase || !proposed || !newBase) return { error: "Couldn't load the versions to rebase." };

  let thread: Thread | null = null;
  if (proposal.source_thread_id) {
    const { data } = await supabase.from("threads").select("*").eq("id", proposal.source_thread_id).maybeSingle<Thread>();
    thread = data;
  }

  const creds = await loadCredentials(supabase, user.id);
  const model = resolveModel(creds, thread?.model);
  if (!model) return { error: "Add an AI key under AI keys to rebase." };

  let reply: string;
  try {
    reply = await complete({
      model,
      system: REBASE_SYSTEM,
      messages: [
        {
          role: "user",
          content: rebaseRequest({
            format: artifact.format,
            oldBase: oldBase.content,
            proposed: proposed.content,
            newBase: newBase.content,
            summary: proposal.summary,
          }),
        },
      ],
    }, creds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The AI couldn't rebase this proposal." };
  }

  const { content } = extractArtifact(reply);
  const notes = reply.split(/Notes:/i)[1]?.trim();
  const summary = notes ? `${proposal.summary}\n\nRebased onto v${newBase.version_number}: ${notes}` : proposal.summary;

  const { error } = await supabase.rpc("revise_proposal", {
    pid: proposal.id,
    new_base: newBase.id,
    p_content: content,
    p_summary: summary,
    p_diff: makeDiff(artifact.title, newBase.content, content),
  });
  if (error) return { error: error.message };

  // Keep the author's private context in step with what was sent.
  if (thread) {
    await supabase.from("messages").insert({
      thread_id: thread.id,
      role: "assistant",
      content: `Rebased the proposal onto official v${newBase.version_number}:\n\n${reply}`,
      model: thread.model,
    });
    await supabase.from("threads").update({ forked_from_version_id: newBase.id }).eq("id", thread.id);
  }

  revalidatePath(`/w/${proposal.workspace_id}/p/${proposal.id}`);
  return { ok: true };
}

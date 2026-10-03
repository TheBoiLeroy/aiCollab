import "server-only";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod/v4";
import { makeDiff } from "@/lib/artifacts";
import {
  displayName,
  FORMATS,
  type Artifact,
  type ArtifactVersion,
  type Profile,
  type Proposal,
  type Review,
  type Workspace,
} from "@/lib/types";
import type { McpUser } from "./auth";
import { viewHtml } from "./view";

export const VIEW_URI = "ui://intermediary/view.html";
const ui = { ui: { resourceUri: VIEW_URI } };

type Ctx = { supabase: SupabaseClient; user: McpUser; appUrl: string };

class UserError extends Error {}

/** Tool results: text the model reads, plus structured data the view renders. */
function result(text: string, structured?: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text }], ...(structured ? { structuredContent: structured } : {}) };
}

function guard<A>(fn: (args: A) => Promise<ReturnType<typeof result>>) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      const message = e instanceof UserError || e instanceof Error ? e.message : "Something went wrong";
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  };
}

// ---------------------------------------------------------------------------
// Data access (as the signed-in user; RLS decides what's visible)
// ---------------------------------------------------------------------------

async function myWorkspaces({ supabase, user }: Ctx) {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspaces(id, name, created_by, created_at)")
    .eq("user_id", user.id)
    .returns<{ workspaces: Workspace }[]>();
  return (data ?? []).map((r) => r.workspaces);
}

async function resolveWorkspace(ctx: Ctx, workspaceId?: string) {
  const all = await myWorkspaces(ctx);
  if (workspaceId) {
    const ws = all.find((w) => w.id === workspaceId);
    if (!ws) throw new UserError("Workspace not found, or you're not a member.");
    return ws;
  }
  if (all.length === 1) return all[0];
  if (!all.length) throw new UserError("You're not in any workspace yet. Create one in the Intermediary web app.");
  throw new UserError(
    `You're in several workspaces; pass workspace_id. ${all.map((w) => `${w.name} (${w.id})`).join(", ")}`,
  );
}

async function membersOf({ supabase }: Ctx, wsId: string) {
  const { data } = await supabase
    .from("workspace_members")
    .select("profiles(id, email, display_name)")
    .eq("workspace_id", wsId)
    .returns<{ profiles: Profile }[]>();
  return (data ?? []).map((r) => r.profiles);
}

async function proposalView(ctx: Ctx, proposalId: string) {
  const { supabase, user } = ctx;
  const { data: p } = await supabase.from("proposals").select("*").eq("id", proposalId).maybeSingle<Proposal>();
  if (!p) throw new UserError("Proposal not found.");
  const [{ data: artifact }, { data: reviews }, members] = await Promise.all([
    supabase.from("artifacts").select("*").eq("id", p.artifact_id).single<Artifact>(),
    supabase.from("reviews").select("*").eq("proposal_id", p.id).eq("revision", p.revision).returns<Review[]>(),
    membersOf(ctx, p.workspace_id),
  ]);
  const people = new Map(members.map((m) => [m.id, m]));
  const reviewers = members.filter((m) => m.id !== p.author_id);
  const voteOf = new Map((reviews ?? []).map((r) => [r.reviewer_id, r]));
  return {
    view: "proposal",
    appUrl: `${ctx.appUrl}/w/${p.workspace_id}/p/${p.id}`,
    workspaceId: p.workspace_id,
    proposal: {
      id: p.id,
      status: p.status,
      revision: p.revision,
      summary: p.summary,
      diff: p.diff,
      updatedAt: p.updated_at,
      artifactTitle: artifact?.title ?? "Artifact",
      format: artifact?.format ?? "text",
      author: displayName(people.get(p.author_id)),
      isAuthor: p.author_id === user.id,
      myVote: voteOf.get(user.id)?.vote ?? null,
      reviewers: reviewers.map((m) => ({
        name: displayName(m),
        vote: voteOf.get(m.id)?.vote ?? null,
        comment: voteOf.get(m.id)?.comment ?? "",
      })),
    },
  };
}

function proposalText(v: Awaited<ReturnType<typeof proposalView>>) {
  const p = v.proposal;
  const votes = p.reviewers.map((r) => `${r.name}: ${r.vote ?? "waiting"}${r.comment ? ` ("${r.comment}")` : ""}`);
  return [
    `Proposal ${p.id} to "${p.artifactTitle}" by ${p.author} — status: ${p.status} (revision ${p.revision}).`,
    p.isAuthor ? "You wrote this proposal." : p.myVote ? `You voted: ${p.myVote}.` : "It's waiting on your vote.",
    `Votes: ${votes.join("; ") || "no other members"}`,
    `Summary:\n${p.summary}`,
    `Diff:\n${p.diff}`,
  ].join("\n\n");
}

async function artifactView(ctx: Ctx, artifactId: string, versionId?: string) {
  const { supabase } = ctx;
  const { data: artifact } = await supabase.from("artifacts").select("*").eq("id", artifactId).maybeSingle<Artifact>();
  if (!artifact?.current_version_id) throw new UserError("Artifact not found.");
  const { data: version } = await supabase
    .from("artifact_versions")
    .select("*")
    .eq("id", versionId ?? artifact.current_version_id)
    .single<ArtifactVersion>();
  if (!version) throw new UserError("Version not found.");
  const { data: author } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .eq("id", version.author_id)
    .maybeSingle<Profile>();
  return {
    view: "artifact",
    appUrl: `${ctx.appUrl}/w/${artifact.workspace_id}/a/${artifact.id}`,
    artifact: {
      id: artifact.id,
      workspaceId: artifact.workspace_id,
      title: artifact.title,
      format: artifact.format,
      version: version.version_number,
      isCurrent: version.id === artifact.current_version_id,
      content: version.content,
      summary: version.summary,
      author: displayName(author),
      createdAt: version.created_at,
    },
  };
}

async function workspaceView(ctx: Ctx, workspaceId?: string) {
  const { supabase, user } = ctx;
  const ws = await resolveWorkspace(ctx, workspaceId);
  const [members, { data: artifacts }, { data: proposals }] = await Promise.all([
    membersOf(ctx, ws.id),
    supabase
      .from("artifacts")
      .select("*")
      .eq("workspace_id", ws.id)
      .order("updated_at", { ascending: false })
      .returns<Artifact[]>(),
    supabase
      .from("proposals")
      .select("*")
      .eq("workspace_id", ws.id)
      .in("status", ["open", "rejected", "needs_rebase"])
      .order("updated_at", { ascending: false })
      .returns<Proposal[]>(),
  ]);
  const { data: reviews } = await supabase
    .from("reviews")
    .select("*")
    .in("proposal_id", (proposals ?? []).map((p) => p.id))
    .returns<Review[]>();
  const people = new Map(members.map((m) => [m.id, m]));
  const titleOf = new Map((artifacts ?? []).map((a) => [a.id, a.title]));
  const votesOn = (p: Proposal) => (reviews ?? []).filter((r) => r.proposal_id === p.id && r.revision === p.revision);
  const needsMe = (p: Proposal) =>
    p.status === "open" && p.author_id !== user.id && !votesOn(p).some((r) => r.reviewer_id === user.id);

  const openProposals = (proposals ?? []).map((p) => ({
    id: p.id,
    artifactId: p.artifact_id,
    artifactTitle: titleOf.get(p.artifact_id) ?? "Artifact",
    author: displayName(people.get(p.author_id)),
    status: p.status,
    summary: p.summary.split("\n")[0],
    approvals: votesOn(p).filter((r) => r.vote === "approve" && r.reviewer_id !== p.author_id).length,
    needed: Math.max(members.length - 1, 0),
    needsMyVote: needsMe(p),
    isMine: p.author_id === user.id,
    updatedAt: p.updated_at,
  }));
  const awaiting = new Set(openProposals.filter((p) => p.needsMyVote).map((p) => p.artifactId));

  return {
    view: "workspace",
    appUrl: `${ctx.appUrl}/w/${ws.id}`,
    workspace: { id: ws.id, name: ws.name },
    members: members.map((m) => ({ name: displayName(m), isMe: m.id === user.id })),
    artifacts: (artifacts ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      format: a.format,
      updatedAt: a.updated_at,
      needsMyReview: awaiting.has(a.id),
    })),
    proposals: openProposals,
  };
}

function workspaceText(v: Awaited<ReturnType<typeof workspaceView>>) {
  const lines = [
    `Workspace "${v.workspace.name}" (${v.workspace.id}). Members: ${v.members.map((m) => m.name).join(", ")}.`,
    "Artifacts:",
    ...v.artifacts.map((a) => `- ${a.title} [${a.format}] id=${a.id}${a.needsMyReview ? " — needs your review" : ""}`),
    v.proposals.length ? "Open proposals:" : "No open proposals.",
    ...v.proposals.map(
      (p) =>
        `- ${p.artifactTitle} by ${p.author}: ${p.status}, ${p.approvals}/${p.needed} approvals${p.needsMyVote ? ", WAITING ON YOU" : ""} id=${p.id}`,
    ),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function buildServer(ctx: Ctx) {
  const server = new McpServer(
    { name: "intermediary", version: "1.0.0" },
    {
      instructions:
        "Intermediary is a team workspace where each person works privately with their own AI, publishes artifacts " +
        "(SQL, Markdown, JSON, text), and changes them through proposals every other member must approve. " +
        "You act as the signed-in user's private AI. Start with show_workspace. To change an artifact, call get_artifact, " +
        "edit the full content, then propose_change. To share something new, publish_artifact. Never cast a vote " +
        "unless the user explicitly asks you to approve or reject.",
    },
  );

  registerAppResource(server, "Intermediary view", VIEW_URI, { description: "Workspace, artifact and proposal views" }, async () => ({
    contents: [{ uri: VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: viewHtml() }],
  }));

  server.registerTool(
    "list_workspaces",
    {
      title: "List workspaces",
      description: "List the Intermediary workspaces the user belongs to.",
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const all = await myWorkspaces(ctx);
      const text = all.length
        ? all.map((w) => `- ${w.name} (id ${w.id})`).join("\n")
        : "You're not in any workspace yet.";
      return result(text, { workspaces: all.map((w) => ({ id: w.id, name: w.name })) });
    }),
  );

  registerAppTool(
    server,
    "show_workspace",
    {
      title: "Show workspace",
      description:
        "Show a workspace dashboard: its artifacts, open proposals, and which ones wait on the user's vote. " +
        "workspace_id is optional when the user is in exactly one workspace.",
      inputSchema: z.object({ workspace_id: z.string().uuid().optional() }),
      annotations: { readOnlyHint: true },
      _meta: ui,
    },
    guard(async ({ workspace_id }: { workspace_id?: string }) => {
      const v = await workspaceView(ctx, workspace_id);
      return result(workspaceText(v), v);
    }),
  );

  registerAppTool(
    server,
    "get_artifact",
    {
      title: "Get artifact",
      description: "Read an artifact's current official version (full content and summary).",
      inputSchema: z.object({ artifact_id: z.string().uuid() }),
      annotations: { readOnlyHint: true },
      _meta: ui,
    },
    guard(async ({ artifact_id }: { artifact_id: string }) => {
      const v = await artifactView(ctx, artifact_id);
      const a = v.artifact;
      return result(
        `"${a.title}" official v${a.version} [${a.format}] by ${a.author}.\n\nSummary:\n${a.summary}\n\nContent:\n${a.content}`,
        v,
      );
    }),
  );

  registerAppTool(
    server,
    "review_proposal",
    {
      title: "Review proposal",
      description: "Show a proposal's summary, diff and votes so the user can review it.",
      inputSchema: z.object({ proposal_id: z.string().uuid() }),
      annotations: { readOnlyHint: true },
      _meta: ui,
    },
    guard(async ({ proposal_id }: { proposal_id: string }) => {
      const v = await proposalView(ctx, proposal_id);
      return result(proposalText(v), v);
    }),
  );

  registerAppTool(
    server,
    "cast_review",
    {
      title: "Approve or reject a proposal",
      description:
        "Cast the user's vote on a proposal. Only call this when the user explicitly decides. Rejections need a comment.",
      inputSchema: z.object({
        proposal_id: z.string().uuid(),
        vote: z.enum(["approve", "reject"]),
        comment: z.string().max(2000).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
      _meta: ui,
    },
    guard(async ({ proposal_id, vote, comment }: { proposal_id: string; vote: "approve" | "reject"; comment?: string }) => {
      const { data, error } = await ctx.supabase.rpc("cast_review", {
        pid: proposal_id,
        p_vote: vote,
        p_comment: comment ?? "",
      });
      if (error) throw new UserError(error.message);
      const v = await proposalView(ctx, proposal_id);
      const outcome =
        data === "accepted"
          ? "That was the last approval: the change is now the official version."
          : data === "rejected"
            ? "Rejected. The author will revise it."
            : "Vote recorded; still waiting on others.";
      return result(`${outcome}\n\n${proposalText(v)}`, v);
    }),
  );

  registerAppTool(
    server,
    "publish_artifact",
    {
      title: "Publish artifact",
      description:
        "Publish new work to the team as an artifact. Write a short summary for reviewers. The user's chat stays private; only the artifact and summary are shared.",
      inputSchema: z.object({
        workspace_id: z.string().uuid().optional(),
        title: z.string().min(1).max(120),
        format: z.enum(FORMATS),
        content: z.string().min(1),
        summary: z.string().min(1).max(4000),
      }),
      _meta: ui,
    },
    guard(async (args: { workspace_id?: string; title: string; format: (typeof FORMATS)[number]; content: string; summary: string }) => {
      const ws = await resolveWorkspace(ctx, args.workspace_id);
      if (args.format === "json") {
        try {
          JSON.parse(args.content);
        } catch {
          throw new UserError("That isn't valid JSON.");
        }
      }
      const { data, error } = await ctx.supabase.rpc("publish_artifact", {
        ws: ws.id,
        p_title: args.title.trim(),
        p_format: args.format,
        p_content: args.content,
        p_summary: args.summary.trim(),
      });
      if (error) throw new UserError(error.message);
      const v = await artifactView(ctx, data as string);
      return result(`Published "${v.artifact.title}" as v1 in ${ws.name}. Your teammates can see it now.`, v);
    }),
  );

  registerAppTool(
    server,
    "propose_change",
    {
      title: "Propose a change",
      description:
        "Propose a new version of an existing artifact. Pass the complete new content (not a diff), based on the current official version from get_artifact. Every other member must approve it.",
      inputSchema: z.object({
        artifact_id: z.string().uuid(),
        content: z.string().min(1),
        summary: z.string().min(1).max(4000),
      }),
      _meta: ui,
    },
    guard(async ({ artifact_id, content, summary }: { artifact_id: string; content: string; summary: string }) => {
      const { supabase, user } = ctx;
      const { data: artifact } = await supabase.from("artifacts").select("*").eq("id", artifact_id).maybeSingle<Artifact>();
      if (!artifact?.current_version_id) throw new UserError("Artifact not found.");
      const { data: base } = await supabase
        .from("artifact_versions")
        .select("*")
        .eq("id", artifact.current_version_id)
        .single<ArtifactVersion>();
      if (!base) throw new UserError("Couldn't load the official version.");
      if (content === base.content) throw new UserError("Nothing changed from the official version.");
      const diff = makeDiff(artifact.title, base.content, content);

      // Like a private thread, keep one live proposal per author per artifact: resending revises it.
      const { data: existing } = await supabase
        .from("proposals")
        .select("*")
        .eq("artifact_id", artifact.id)
        .eq("author_id", user.id)
        .in("status", ["open", "rejected", "needs_rebase"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<Proposal>();

      const { data: pid, error } = existing
        ? await supabase.rpc("revise_proposal", {
            pid: existing.id,
            new_base: base.id,
            p_content: content,
            p_summary: summary.trim(),
            p_diff: diff,
          })
        : await supabase.rpc("create_proposal", {
            art: artifact.id,
            base: base.id,
            p_content: content,
            p_summary: summary.trim(),
            p_diff: diff,
            p_thread: null,
          });
      if (error) throw new UserError(error.message);
      const v = await proposalView(ctx, pid as string);
      const lead = existing ? "Revised your proposal" : "Sent a proposal";
      return result(
        `${lead} on "${artifact.title}" against official v${base.version_number}. Status: ${v.proposal.status}.`,
        v,
      );
    }),
  );

  return server;
}

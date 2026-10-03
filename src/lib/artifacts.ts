import { createTwoFilesPatch } from "diff";
import type { Artifact, ArtifactVersion, Format } from "./types";

export function makeDiff(title: string, before: string, after: string) {
  return createTwoFilesPatch(`${title} (official)`, `${title} (proposed)`, before, after, "", "", {
    context: 3,
  });
}

const FENCE = /```([\w-]*)\n([\s\S]*?)```/g;

/** The artifact candidate in an AI reply: its last fenced block, or the whole reply. */
export function extractArtifact(reply: string): { content: string; format?: Format } {
  const blocks = [...reply.matchAll(FENCE)];
  if (!blocks.length) return { content: reply.trim() };
  const [, lang, body] = blocks[blocks.length - 1];
  return { content: body.replace(/\n$/, ""), format: guessFormat(lang) };
}

function guessFormat(lang: string): Format | undefined {
  const l = lang.toLowerCase();
  if (["sql", "postgres", "postgresql", "pgsql"].includes(l)) return "sql";
  if (["md", "markdown"].includes(l)) return "markdown";
  if (l === "json") return "json";
  if (["txt", "text", "plain"].includes(l)) return "text";
  return undefined;
}

export function fence(format: Format) {
  return format === "text" ? "" : format;
}

export function threadSystemPrompt(opts: {
  userName: string;
  workspaceName: string;
  fork?: { artifact: Artifact; version: ArtifactVersion; officialNote: string } | null;
}) {
  const lines = [
    `You are ${opts.userName}'s private AI assistant inside the team workspace "${opts.workspaceName}".`,
    "Only they can see this conversation. What they share with the team is an artifact (a SQL schema, a Markdown document, a JSON file or plain text) that they publish explicitly.",
    "Whenever you produce a new or revised artifact, put its complete content in a single fenced code block (never a partial snippet), so it can be published as is.",
  ];
  if (opts.fork) {
    const { artifact, version, officialNote } = opts.fork;
    lines.push(
      "",
      `This thread is a fork of version ${version.version_number} of the team artifact "${artifact.title}" (${artifact.format}). ${officialNote}`,
      "The author's summary of that version:",
      version.summary || "(no summary)",
      "",
      "Its content:",
      "```" + fence(artifact.format),
      version.content,
      "```",
      "",
      "Help the user change it. Their revised version can be proposed back to the team for review.",
    );
  }
  return lines.join("\n");
}

export const SUMMARY_SYSTEM =
  "You write short summaries of artifacts for teammates who did not see the conversation that produced them. Write 2 to 5 plain sentences: what the artifact is, the key decisions in it, and anything a reviewer should check. No preamble, no headings.";

export function summaryRequest(opts: {
  title: string;
  format: Format;
  content: string;
  baseContent?: string;
  conversation: string;
}) {
  const parts = [
    `Artifact: "${opts.title}" (${opts.format}).`,
    "",
    "Conversation excerpt that produced it (private, do not quote it, only use it to understand intent):",
    opts.conversation || "(none)",
    "",
  ];
  if (opts.baseContent !== undefined) {
    parts.push(
      "This is a proposed change to the team's official version. Summarize what changed and why.",
      "",
      "Official version:",
      "```",
      opts.baseContent,
      "```",
      "",
      "Proposed version:",
    );
  } else {
    parts.push("Content:");
  }
  parts.push("```", opts.content, "```");
  return parts.join("\n");
}

export const REBASE_SYSTEM =
  "You re-apply a teammate's proposed change to a newer official version of a shared artifact. Keep every change the new official version made, and re-apply the intent of the proposed change on top of it. Output only the complete resulting artifact in a single fenced code block, then one short paragraph starting with 'Notes:' about any conflict you had to resolve.";

export function rebaseRequest(opts: {
  format: Format;
  oldBase: string;
  proposed: string;
  newBase: string;
  summary: string;
}) {
  const f = fence(opts.format);
  return [
    "The proposal's summary:",
    opts.summary || "(none)",
    "",
    "The official version the proposal was made against:",
    "```" + f,
    opts.oldBase,
    "```",
    "",
    "The proposed version:",
    "```" + f,
    opts.proposed,
    "```",
    "",
    "The new official version (re-apply the proposal on top of this):",
    "```" + f,
    opts.newBase,
    "```",
  ].join("\n");
}

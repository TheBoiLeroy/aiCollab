"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { deleteThread, setThreadModel } from "@/app/actions";
import { StatusBadge } from "@/components/status";
import { extractArtifact } from "@/lib/artifacts";
import type { Format, Message, ProposalStatus, Thread } from "@/lib/types";
import { ShareDialog, type ShareMode } from "./share-dialog";

export type ForkInfo = {
  artifactId: string;
  title: string;
  format: Format;
  versionNumber: number;
  isOfficial: boolean;
  isCurrent: boolean;
  baseVersionNumber: number;
  baseContent: string;
};

type ChatMessage = Pick<Message, "id" | "role" | "content">;

export function ChatView(props: {
  workspaceId: string;
  workspaceName: string;
  thread: Thread;
  initialMessages: Message[];
  models: { id: string; label: string }[];
  fork: ForkInfo | null;
  liveProposal: { id: string; status: ProposalStatus } | null;
}) {
  const { thread, fork, workspaceId, liveProposal } = props;
  const [messages, setMessages] = useState<ChatMessage[]>(props.initialMessages);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(thread.model);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<{ mode: ShareMode; content: string; format?: Format } | null>(null);
  const [, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  async function send() {
    const content = draft.trim();
    if (!content || streaming) return;
    setDraft("");
    setError(null);
    setStreaming(true);
    const replyId = `pending-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", content },
      { id: replyId, role: "assistant", content: "" },
    ]);
    try {
      const res = await fetch(`/api/threads/${thread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || "Request failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const piece = decoder.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: x.content + piece } : x)));
        bottom.current?.scrollIntoView({ block: "end" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setMessages((m) => m.filter((x) => x.id !== replyId));
    } finally {
      setStreaming(false);
    }
  }

  function openShare(mode: ShareMode, source?: string) {
    const extracted = extractArtifact(source ?? lastAssistant?.content ?? "");
    const content = extracted.content || (mode === "propose" && fork ? fork.baseContent : "");
    setShare({ mode, content, format: extracted.format });
  }

  return (
    <div className="flex h-screen min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{thread.title}</h1>
          <p className="text-xs text-muted">Private · only you can see this thread</p>
        </div>
        <select
          className="input w-auto"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            startTransition(() => setThreadModel(thread.id, e.target.value));
          }}
          aria-label="Model"
        >
          {props.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {fork && (
          <button className="btn-primary" onClick={() => openShare("propose")} disabled={streaming}>
            {liveProposal && liveProposal.status !== "accepted" ? "Update proposal" : "Propose change"}
          </button>
        )}
        <button className={fork ? "btn" : "btn-primary"} onClick={() => openShare("publish")} disabled={streaming}>
          Publish as new artifact
        </button>
        <button
          className="btn"
          onClick={() => {
            if (confirm("Delete this thread? Published artifacts and proposals stay.")) {
              startTransition(() => deleteThread(thread.id, workspaceId));
            }
          }}
        >
          Delete
        </button>
      </header>

      {fork && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent/5 px-4 py-2 text-sm">
          <span>
            Forked from{" "}
            <Link href={`/w/${workspaceId}/a/${fork.artifactId}`} className="font-medium underline">
              {fork.title} v{fork.versionNumber}
            </Link>
            {!fork.isOfficial && " (a teammate's proposal)"}
            {fork.isOfficial && !fork.isCurrent && " · a newer official version exists"}
          </span>
          {liveProposal && (
            <Link href={`/w/${workspaceId}/p/${liveProposal.id}`} className="flex items-center gap-2 underline">
              Your proposal <StatusBadge status={liveProposal.status} />
            </Link>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {!messages.length && (
            <div className="text-center text-sm text-muted">
              {fork
                ? `Ask your AI to change "${fork.title}". When you're happy, press Propose change to send it to the team.`
                : "Work on something with your AI. When there's something worth sharing, press Publish."}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "self-end max-w-[85%]" : "max-w-full"}>
              <div
                className={
                  m.role === "user"
                    ? "rounded-2xl bg-accent px-4 py-2 text-sm text-accent-fg whitespace-pre-wrap"
                    : "text-sm"
                }
              >
                {m.role === "user" ? m.content : <Rendered text={m.content || "…"} />}
              </div>
              {m.role === "assistant" && m.content && !m.id.startsWith("pending") && (
                <div className="mt-1 flex gap-2">
                  <button className="text-xs text-muted hover:text-foreground" onClick={() => openShare(fork ? "propose" : "publish", m.content)}>
                    {fork ? "Propose this version" : "Publish this"}
                  </button>
                </div>
              )}
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div ref={bottom} />
        </div>
      </div>

      <form
        className="border-t border-border bg-surface p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <textarea
            className="input min-h-[44px] resize-y"
            rows={2}
            placeholder="Message your AI…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn-primary self-end" disabled={streaming || !draft.trim()}>
            {streaming ? "…" : "Send"}
          </button>
        </div>
      </form>

      {share && (
        <ShareDialog
          threadId={thread.id}
          mode={share.mode}
          initialContent={share.content}
          initialFormat={share.format ?? fork?.format ?? "markdown"}
          fork={fork}
          onClose={() => setShare(null)}
        />
      )}
    </div>
  );
}

/** Minimal rendering: prose with fenced code blocks. */
function Rendered({ text }: { text: string }) {
  const parts = text.split(/(```[\w-]*\n[\s\S]*?(?:```|$))/g);
  return (
    <div className="flex flex-col gap-2">
      {parts.map((part, i) => {
        const m = part.match(/^```([\w-]*)\n([\s\S]*?)(?:```)?$/);
        if (m) {
          return (
            <pre key={i} className="code">
              {m[2]}
            </pre>
          );
        }
        return part.trim() ? (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {part.trim()}
          </p>
        ) : null;
      })}
    </div>
  );
}

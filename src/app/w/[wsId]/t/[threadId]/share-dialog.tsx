"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { draftSummary, proposeChange, publishArtifact } from "@/app/actions";
import { DiffView } from "@/components/diff-view";
import { makeDiff } from "@/lib/artifacts";
import { FORMATS, type Format } from "@/lib/types";
import type { ForkInfo } from "./chat-view";

export type ShareMode = "publish" | "propose";

export function ShareDialog(props: {
  threadId: string;
  mode: ShareMode;
  initialContent: string;
  initialFormat: Format;
  fork: ForkInfo | null;
  onClose: () => void;
}) {
  const { mode, fork } = props;
  const proposing = mode === "propose" && !!fork;
  const [title, setTitle] = useState(proposing ? fork!.title : "");
  const [format, setFormat] = useState<Format>(proposing ? fork!.format : props.initialFormat);
  const [content, setContent] = useState(props.initialContent);
  const [summary, setSummary] = useState("");
  const [drafting, setDrafting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [tab, setTab] = useState<"edit" | "diff">(proposing ? "diff" : "edit");

  const diff = useMemo(
    () => (proposing ? makeDiff(fork!.title, fork!.baseContent, content) : ""),
    [proposing, fork, content],
  );

  async function draft() {
    setDrafting(true);
    setError(null);
    await requestSummary();
  }

  async function requestSummary() {
    if (!content.trim()) return setDrafting(false);
    const res = await draftSummary({
      threadId: props.threadId,
      title: title || "Untitled",
      format,
      content,
      againstOfficial: proposing,
    });
    setDrafting(false);
    if (res.error) setError(res.error);
    else setSummary(res.value ?? "");
  }

  useEffect(() => {
    // Draft the summary up front; the author reviews and edits it before sharing.
    void requestSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    setError(null);
    startSubmit(async () => {
      const res = proposing
        ? await proposeChange({ threadId: props.threadId, content, summary })
        : await publishArtifact({ threadId: props.threadId, title, format, content, summary });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={props.onClose}>
      <div
        className="card flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div>
          <h2 className="text-lg font-semibold">
            {proposing ? `Propose a change to ${fork!.title}` : "Publish artifact"}
          </h2>
          <p className="text-sm text-muted">
            {proposing
              ? `Your team reviews this against official v${fork!.baseVersionNumber}. Every other member has to approve it. Your chat stays private.`
              : "Your team sees the artifact and the summary below. Your chat stays private."}
          </p>
        </div>

        {!proposing && (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Orders database schema" maxLength={120} />
            </div>
            <div>
              <label className="label" htmlFor="format">Format</label>
              <select id="format" className="input" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f === "sql" ? "SQL" : f === "json" ? "JSON" : f[0].toUpperCase() + f.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="label mb-0">Content</span>
            {proposing && (
              <div className="ml-auto flex gap-1 text-xs">
                <button className={tab === "diff" ? "btn-primary" : "btn"} onClick={() => setTab("diff")}>Changes</button>
                <button className={tab === "edit" ? "btn-primary" : "btn"} onClick={() => setTab("edit")}>Edit</button>
              </div>
            )}
          </div>
          {tab === "diff" ? (
            <div className="max-h-80 overflow-y-auto">
              <DiffView diff={diff} />
            </div>
          ) : (
            <textarea className="input min-h-60 font-mono text-xs" value={content} onChange={(e) => setContent(e.target.value)} />
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center">
            <label className="label mb-0" htmlFor="summary">Summary for your team</label>
            <button className="btn ml-auto text-xs" onClick={draft} disabled={drafting || !content.trim()}>
              {drafting ? "Drafting…" : "Redraft with AI"}
            </button>
          </div>
          <textarea
            id="summary"
            className="input min-h-28"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={drafting ? "Your AI is drafting a summary…" : "What is this, and what should reviewers look at?"}
          />
          <p className="mt-1 text-xs text-muted">Written by your AI. Read it and edit anything before you share.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button className="btn" onClick={props.onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={submitting || drafting || !content.trim() || !summary.trim() || (!proposing && !title.trim())}
          >
            {submitting ? "Sending…" : proposing ? "Send for review" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

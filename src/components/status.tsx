import type { Format, ProposalStatus } from "@/lib/types";

const STYLES: Record<ProposalStatus, string> = {
  open: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  needs_rebase: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  closed: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

const LABELS: Record<ProposalStatus, string> = {
  open: "In review",
  accepted: "Accepted",
  rejected: "Rejected",
  needs_rebase: "Needs rebase",
  closed: "Closed (author left)",
};

export function StatusBadge({ status }: { status: ProposalStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>{LABELS[status]}</span>;
}

const FORMAT_STYLES: Record<Format, string> = {
  sql: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  markdown: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  json: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  text: "border-border text-muted",
};

export function ReviewTag() {
  return (
    <span
      className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
      title="A proposal on this artifact is waiting on your vote"
    >
      Needs your review
    </span>
  );
}

export function FormatBadge({ format }: { format: string }) {
  const style = FORMAT_STYLES[format as Format] ?? FORMAT_STYLES.text;
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${style}`}>
      {format}
    </span>
  );
}

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

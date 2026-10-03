import type { ProposalStatus } from "@/lib/types";

const STYLES: Record<ProposalStatus, string> = {
  open: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  needs_rebase: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

const LABELS: Record<ProposalStatus, string> = {
  open: "In review",
  accepted: "Accepted",
  rejected: "Rejected",
  needs_rebase: "Needs rebase",
};

export function StatusBadge({ status }: { status: ProposalStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>{LABELS[status]}</span>;
}

export function FormatBadge({ format }: { format: string }) {
  return (
    <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted">
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

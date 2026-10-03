export function DiffView({ diff }: { diff: string }) {
  // Skip the two-file header; show hunks with colored lines.
  const lines = diff.split("\n").filter((l) => !l.startsWith("===") && !l.startsWith("---") && !l.startsWith("+++") && !l.startsWith("Index:"));
  if (!lines.some((l) => l.startsWith("+") || l.startsWith("-"))) {
    return <p className="text-sm text-muted">No changes.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-code font-mono text-xs leading-relaxed">
      {lines.map((line, i) => {
        let cls = "text-foreground/80";
        if (line.startsWith("@@")) cls = "bg-accent/10 text-muted";
        else if (line.startsWith("+")) cls = "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
        else if (line.startsWith("-")) cls = "bg-red-500/15 text-red-800 dark:text-red-300";
        return (
          <div key={i} className={`whitespace-pre px-3 ${cls}`}>
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { removeMember } from "@/app/actions";

export function RemoveMemberButton({ workspaceId, userId, name }: { workspaceId: string; userId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    const ok = window.confirm(
      `Remove ${name} from this workspace?\n\nTheir open proposals will be closed and their private threads here deleted. The invite link will be reset.`,
    );
    if (!ok) return;
    setError(null);
    start(async () => {
      const res = await removeMember(workspaceId, userId);
      if (res.error) setError(res.error);
    });
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button className="btn" onClick={remove} disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </button>
    </span>
  );
}

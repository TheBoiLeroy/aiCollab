import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import type { Profile, Workspace } from "@/lib/types";

/** Loads the workspace and its members, 404ing for non-members (RLS hides it). */
export async function loadWorkspace(wsId: string) {
  const { supabase, user } = await requireUser();
  const { data: workspace } = await supabase.from("workspaces").select("*").eq("id", wsId).maybeSingle<Workspace>();
  if (!workspace) notFound();
  const { data: rows } = await supabase
    .from("workspace_members")
    .select("user_id, profiles(id, email, display_name)")
    .eq("workspace_id", wsId)
    .returns<{ user_id: string; profiles: Profile }[]>();
  const members = (rows ?? []).map((r) => r.profiles);
  if (!members.some((m) => m.id === user.id)) notFound();
  const people = new Map(members.map((m) => [m.id, m]));
  return { supabase, user, workspace, members, people };
}

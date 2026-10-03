export type Format = "sql" | "markdown" | "json" | "text";
export const FORMATS: Format[] = ["sql", "markdown", "json", "text"];

export type Profile = { id: string; email: string; display_name: string | null };

export type Workspace = { id: string; name: string; created_by: string; created_at: string };

export type Artifact = {
  id: string;
  workspace_id: string;
  title: string;
  format: Format;
  created_by: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ArtifactVersion = {
  id: string;
  artifact_id: string;
  workspace_id: string;
  version_number: number;
  content: string;
  format: Format;
  author_id: string;
  parent_version_id: string | null;
  summary: string;
  is_official: boolean;
  created_at: string;
};

export type Thread = {
  id: string;
  workspace_id: string;
  owner_id: string;
  title: string;
  model: string;
  forked_from_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  created_at: string;
};

export type ProposalStatus = "open" | "accepted" | "rejected" | "needs_rebase";

export type Proposal = {
  id: string;
  workspace_id: string;
  artifact_id: string;
  base_version_id: string;
  proposed_version_id: string;
  author_id: string;
  source_thread_id: string | null;
  summary: string;
  diff: string;
  status: ProposalStatus;
  revision: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type Review = {
  id: string;
  proposal_id: string;
  revision: number;
  reviewer_id: string;
  vote: "approve" | "reject";
  comment: string;
  created_at: string;
};

export function displayName(p: Pick<Profile, "display_name" | "email"> | undefined | null) {
  if (!p) return "Someone";
  return p.display_name || p.email;
}

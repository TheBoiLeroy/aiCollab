-- AI Intermediary Chat v1 schema.
-- Chats (threads, messages) are private to their owner. Artifacts, versions,
-- proposals and reviews are visible to every workspace member. All state
-- transitions on shared objects go through security-definer functions so the
-- approval rules can't be bypassed from the client.


-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Workspaces and membership (2–5 members, no roles)
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  invited_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (workspace_id, email)
);

create or replace function public.is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

create or replace function public.enforce_member_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.workspace_members where workspace_id = new.workspace_id) >= 5 then
    raise exception 'A workspace can have at most 5 members';
  end if;
  return new;
end;
$$;

create trigger workspace_member_limit
  before insert on public.workspace_members
  for each row execute function public.enforce_member_limit();

-- The creator becomes the first member.
create or replace function public.add_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id) values (new.id, new.created_by);
  return new;
end;
$$;

create trigger workspace_add_creator
  after insert on public.workspaces
  for each row execute function public.add_creator_as_member();

-- ---------------------------------------------------------------------------
-- Artifacts and versions
-- ---------------------------------------------------------------------------

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  format text not null check (format in ('sql', 'markdown', 'json', 'text')),
  created_by uuid not null references public.profiles (id),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index artifacts_workspace_idx on public.artifacts (workspace_id);

create table public.artifact_versions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifacts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version_number int not null,
  content text not null,
  format text not null check (format in ('sql', 'markdown', 'json', 'text')),
  author_id uuid not null references public.profiles (id),
  parent_version_id uuid references public.artifact_versions (id),
  summary text not null default '',
  is_official boolean not null default false,
  created_at timestamptz not null default now(),
  unique (artifact_id, version_number)
);

create index artifact_versions_artifact_idx on public.artifact_versions (artifact_id);

alter table public.artifacts
  add constraint artifacts_current_version_fk
  foreign key (current_version_id) references public.artifact_versions (id);

-- ---------------------------------------------------------------------------
-- Private threads
-- ---------------------------------------------------------------------------

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'New thread',
  model text not null,
  forked_from_version_id uuid references public.artifact_versions (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index threads_owner_idx on public.threads (owner_id, workspace_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  model text,
  created_at timestamptz not null default now()
);

create index messages_thread_idx on public.messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Proposals and reviews
-- ---------------------------------------------------------------------------

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  artifact_id uuid not null references public.artifacts (id) on delete cascade,
  base_version_id uuid not null references public.artifact_versions (id),
  proposed_version_id uuid not null references public.artifact_versions (id),
  author_id uuid not null references public.profiles (id),
  source_thread_id uuid references public.threads (id) on delete set null,
  summary text not null default '',
  diff text not null default '',
  status text not null default 'open'
    check (status in ('open', 'accepted', 'rejected', 'needs_rebase')),
  revision int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index proposals_workspace_idx on public.proposals (workspace_id, status);
create index proposals_artifact_idx on public.proposals (artifact_id, status);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  revision int not null,
  reviewer_id uuid not null references public.profiles (id),
  vote text not null check (vote in ('approve', 'reject')),
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (proposal_id, revision, reviewer_id)
);

create index reviews_proposal_idx on public.reviews (proposal_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.artifacts enable row level security;
alter table public.artifact_versions enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.proposals enable row level security;
alter table public.reviews enable row level security;

create policy "profiles: self or teammates" on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

create policy "profiles: update self" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy "workspaces: members read" on public.workspaces for select
  using (public.is_member(id) or created_by = auth.uid());

create policy "workspaces: create own" on public.workspaces for insert
  with check (created_by = auth.uid());

create policy "workspaces: creator renames" on public.workspaces for update
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "members: read teammates" on public.workspace_members for select
  using (public.is_member(workspace_id));

create policy "members: leave" on public.workspace_members for delete
  using (user_id = auth.uid());

create policy "invites: members or invitee read" on public.workspace_invites for select
  using (
    public.is_member(workspace_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "invites: creator invites" on public.workspace_invites for insert
  with check (
    invited_by = auth.uid()
    and exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid())
  );

create policy "invites: creator revokes" on public.workspace_invites for delete
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid()));

create policy "artifacts: members read" on public.artifacts for select
  using (public.is_member(workspace_id));

create policy "versions: members read" on public.artifact_versions for select
  using (public.is_member(workspace_id));

create policy "proposals: members read" on public.proposals for select
  using (public.is_member(workspace_id));

create policy "reviews: members read" on public.reviews for select
  using (exists (select 1 from public.proposals p where p.id = proposal_id and public.is_member(p.workspace_id)));

-- Threads and messages: owner only, always.
create policy "threads: owner all" on public.threads for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.is_member(workspace_id));

create policy "messages: thread owner all" on public.messages for all
  using (exists (select 1 from public.threads t where t.id = thread_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.threads t where t.id = thread_id and t.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Workflow functions
-- ---------------------------------------------------------------------------

create or replace function public.accept_invite(invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.workspace_invites;
begin
  select * into inv from public.workspace_invites where id = invite_id for update;
  if inv.id is null or lower(inv.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Invite not found';
  end if;
  if inv.accepted_at is null then
    insert into public.workspace_members (workspace_id, user_id)
    values (inv.workspace_id, auth.uid())
    on conflict do nothing;
    update public.workspace_invites set accepted_at = now() where id = inv.id;
  end if;
  return inv.workspace_id;
end;
$$;

create or replace function public.next_version_number(art uuid)
returns int
language sql
security definer
set search_path = ''
as $$
  select coalesce(max(version_number), 0) + 1 from public.artifact_versions where artifact_id = art;
$$;

-- Publish a brand-new artifact. Its first version is official immediately.
create or replace function public.publish_artifact(
  ws uuid, p_title text, p_format text, p_content text, p_summary text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  art_id uuid;
  ver_id uuid;
begin
  if not public.is_member(ws) then
    raise exception 'Not a member of this workspace';
  end if;

  insert into public.artifacts (workspace_id, title, format, created_by)
  values (ws, p_title, p_format, auth.uid())
  returning id into art_id;

  insert into public.artifact_versions
    (artifact_id, workspace_id, version_number, content, format, author_id, summary, is_official)
  values (art_id, ws, 1, p_content, p_format, auth.uid(), p_summary, true)
  returning id into ver_id;

  update public.artifacts set current_version_id = ver_id where id = art_id;
  return art_id;
end;
$$;

-- Accept the proposal if every member except its author approved the current
-- revision. Caller must hold the artifact row lock.
create or replace function public.try_accept_proposal(pid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.proposals;
  needed int;
  approvals int;
begin
  select * into p from public.proposals where id = pid;
  if p.status <> 'open' then
    return false;
  end if;

  select count(*) - 1 into needed
  from public.workspace_members where workspace_id = p.workspace_id;

  select count(*) into approvals
  from public.reviews r
  join public.workspace_members m
    on m.workspace_id = p.workspace_id and m.user_id = r.reviewer_id
  where r.proposal_id = p.id and r.revision = p.revision
    and r.vote = 'approve' and r.reviewer_id <> p.author_id;

  if approvals < needed then
    return false;
  end if;

  update public.artifact_versions set is_official = true where id = p.proposed_version_id;
  update public.artifacts
    set current_version_id = p.proposed_version_id, updated_at = now()
    where id = p.artifact_id;
  update public.proposals
    set status = 'accepted', resolved_at = now(), updated_at = now()
    where id = p.id;

  -- The author's private thread now continues from the accepted version.
  update public.threads
    set forked_from_version_id = p.proposed_version_id
    where id = p.source_thread_id;

  -- Anything else in flight on this artifact was built on an older version.
  update public.proposals
    set status = 'needs_rebase', updated_at = now()
    where artifact_id = p.artifact_id and id <> p.id
      and status in ('open', 'rejected');

  return true;
end;
$$;

-- Send a proposal. The base must be an official version; if it is no longer
-- the current one, the proposal starts as needs_rebase.
create or replace function public.create_proposal(
  art uuid, base uuid, p_content text, p_summary text, p_diff text, p_thread uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.artifacts;
  ver_id uuid;
  pid uuid;
begin
  select * into a from public.artifacts where id = art for update;
  if a.id is null or not public.is_member(a.workspace_id) then
    raise exception 'Artifact not found';
  end if;
  if not exists (
    select 1 from public.artifact_versions
    where id = base and artifact_id = art and is_official
  ) then
    raise exception 'A proposal must start from an official version';
  end if;

  insert into public.artifact_versions
    (artifact_id, workspace_id, version_number, content, format, author_id, parent_version_id, summary)
  values (art, a.workspace_id, public.next_version_number(art), p_content, a.format, auth.uid(), base, p_summary)
  returning id into ver_id;

  insert into public.proposals
    (workspace_id, artifact_id, base_version_id, proposed_version_id, author_id, source_thread_id, summary, diff, status)
  values (
    a.workspace_id, art, base, ver_id, auth.uid(), p_thread, p_summary, p_diff,
    case when base = a.current_version_id then 'open' else 'needs_rebase' end
  )
  returning id into pid;

  -- Sending counts as the author's approval.
  insert into public.reviews (proposal_id, revision, reviewer_id, vote)
  values (pid, 1, auth.uid(), 'approve');

  perform public.try_accept_proposal(pid);
  return pid;
end;
$$;

-- Author resends a proposal after a rejection or a rebase. Bumps the revision
-- so earlier votes no longer count.
create or replace function public.revise_proposal(
  pid uuid, new_base uuid, p_content text, p_summary text, p_diff text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.proposals;
  a public.artifacts;
  ver_id uuid;
begin
  select * into p from public.proposals where id = pid;
  if p.id is null or p.author_id <> auth.uid() or not public.is_member(p.workspace_id) then
    raise exception 'Only the author can revise this proposal';
  end if;
  if p.status = 'accepted' then
    raise exception 'This proposal was already accepted';
  end if;

  select * into a from public.artifacts where id = p.artifact_id for update;
  if new_base <> a.current_version_id then
    raise exception 'Revisions must be based on the current official version';
  end if;

  insert into public.artifact_versions
    (artifact_id, workspace_id, version_number, content, format, author_id, parent_version_id, summary)
  values (a.id, a.workspace_id, public.next_version_number(a.id), p_content, a.format, auth.uid(), new_base, p_summary)
  returning id into ver_id;

  update public.proposals
    set base_version_id = new_base,
        proposed_version_id = ver_id,
        summary = p_summary,
        diff = p_diff,
        status = 'open',
        revision = p.revision + 1,
        updated_at = now()
    where id = pid;

  insert into public.reviews (proposal_id, revision, reviewer_id, vote)
  values (pid, p.revision + 1, auth.uid(), 'approve');

  perform public.try_accept_proposal(pid);
  return pid;
end;
$$;

create or replace function public.cast_review(pid uuid, p_vote text, p_comment text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.proposals;
begin
  select * into p from public.proposals where id = pid for update;
  if p.id is null or not public.is_member(p.workspace_id) then
    raise exception 'Proposal not found';
  end if;
  if p.author_id = auth.uid() then
    raise exception 'Authors can''t review their own proposal';
  end if;
  if p.status <> 'open' then
    raise exception 'This proposal is not open for review';
  end if;
  if p_vote not in ('approve', 'reject') then
    raise exception 'Invalid vote';
  end if;
  if p_vote = 'reject' and coalesce(trim(p_comment), '') = '' then
    raise exception 'Please say why you are rejecting';
  end if;

  -- Serialize acceptance per artifact.
  perform 1 from public.artifacts where id = p.artifact_id for update;

  insert into public.reviews (proposal_id, revision, reviewer_id, vote, comment)
  values (pid, p.revision, auth.uid(), p_vote, coalesce(p_comment, ''))
  on conflict (proposal_id, revision, reviewer_id)
  do update set vote = excluded.vote, comment = excluded.comment, created_at = now();

  if p_vote = 'reject' then
    update public.proposals set status = 'rejected', updated_at = now() where id = pid;
    return 'rejected';
  end if;

  if public.try_accept_proposal(pid) then
    return 'accepted';
  end if;
  return 'open';
end;
$$;

-- Lock down direct execution of internal helpers.
revoke execute on function public.try_accept_proposal(uuid) from public, anon, authenticated;
revoke execute on function public.next_version_number(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_creator_as_member() from public, anon, authenticated;

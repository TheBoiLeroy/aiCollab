-- Shareable invite links. Anyone signed in who opens /join/<token> can join the
-- workspace, no matching email needed. The creator gets and rotates the link;
-- the table has no policies, so only these functions can read it.

create table public.workspace_invite_links (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.workspace_invite_links enable row level security;

create or replace function public.workspace_invite_token(ws uuid, rotate boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t uuid;
begin
  if not exists (select 1 from public.workspaces where id = ws and created_by = auth.uid()) then
    raise exception 'Only the workspace creator can share the invite link';
  end if;
  insert into public.workspace_invite_links (workspace_id) values (ws)
  on conflict (workspace_id) do update
    set token = case when rotate then gen_random_uuid() else public.workspace_invite_links.token end,
        created_at = case when rotate then now() else public.workspace_invite_links.created_at end
  returning token into t;
  return t;
end;
$$;

-- What the join page shows before the person commits.
create or replace function public.invite_link_preview(p_token uuid)
returns table (workspace_id uuid, name text, member_count int, already_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.name,
    (select count(*)::int from public.workspace_members m where m.workspace_id = w.id),
    exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = auth.uid())
  from public.workspace_invite_links l
  join public.workspaces w on w.id = l.workspace_id
  where l.token = p_token;
$$;

create or replace function public.join_workspace(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.workspace_invite_links where token = p_token;
  if ws is null then
    raise exception 'This invite link is invalid or was reset';
  end if;
  -- The member-limit trigger still caps the workspace at 5.
  insert into public.workspace_members (workspace_id, user_id)
  values (ws, auth.uid())
  on conflict do nothing;
  -- Clear any pending email invite for this person so it doesn't hold a seat.
  update public.workspace_invites set accepted_at = now()
  where workspace_id = ws and accepted_at is null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  return ws;
end;
$$;

revoke execute on function public.workspace_invite_token(uuid, boolean) from public, anon;
revoke execute on function public.invite_link_preview(uuid) from public, anon;
revoke execute on function public.join_workspace(uuid) from public, anon;
grant execute on function public.workspace_invite_token(uuid, boolean) to authenticated;
grant execute on function public.invite_link_preview(uuid) to authenticated;
grant execute on function public.join_workspace(uuid) to authenticated;

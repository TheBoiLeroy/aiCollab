-- The workspace creator can remove members. Removing someone:
--   * closes their in-flight proposals (they can no longer revise them, and the
--     approval count assumes the author is a member),
--   * re-checks everyone else's open proposals, since one fewer approval is needed,
--   * deletes their private threads here (they can no longer open them),
--   * clears their email invite and resets the invite link so they can't walk back in.

alter table public.proposals drop constraint proposals_status_check;
alter table public.proposals add constraint proposals_status_check
  check (status in ('open', 'accepted', 'rejected', 'needs_rebase', 'closed'));

create or replace function public.remove_member(ws uuid, target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator uuid;
  target_email text;
  pid uuid;
begin
  select created_by into creator from public.workspaces where id = ws for update;
  if creator is null or creator <> auth.uid() then
    raise exception 'Only the workspace creator can remove members';
  end if;
  if target = creator then
    raise exception 'The workspace creator can''t be removed';
  end if;
  if not exists (select 1 from public.workspace_members where workspace_id = ws and user_id = target) then
    raise exception 'That person isn''t a member';
  end if;

  -- Serialize with cast_review / revise_proposal, which lock the artifact.
  perform 1 from public.artifacts where workspace_id = ws order by id for update;

  delete from public.workspace_members where workspace_id = ws and user_id = target;

  update public.proposals
    set status = 'closed', resolved_at = now(), updated_at = now()
    where workspace_id = ws and author_id = target
      and status in ('open', 'rejected', 'needs_rebase');

  for pid in
    select id from public.proposals where workspace_id = ws and status = 'open' order by created_at
  loop
    perform public.try_accept_proposal(pid);
  end loop;

  delete from public.threads where workspace_id = ws and owner_id = target;

  select email into target_email from public.profiles where id = target;
  delete from public.workspace_invites where workspace_id = ws and lower(email) = lower(target_email);
  update public.workspace_invite_links set token = gen_random_uuid(), created_at = now() where workspace_id = ws;
end;
$$;

revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

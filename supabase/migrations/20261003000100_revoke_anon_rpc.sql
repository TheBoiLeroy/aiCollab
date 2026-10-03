-- Workflow RPCs are for signed-in users only.
revoke execute on function public.accept_invite(uuid) from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.publish_artifact(uuid, text, text, text, text) from public, anon;
revoke execute on function public.create_proposal(uuid, uuid, text, text, text, uuid) from public, anon;
revoke execute on function public.revise_proposal(uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.cast_review(uuid, text, text) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.publish_artifact(uuid, text, text, text, text) to authenticated;
grant execute on function public.create_proposal(uuid, uuid, text, text, text, uuid) to authenticated;
grant execute on function public.revise_proposal(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.cast_review(uuid, text, text) to authenticated;

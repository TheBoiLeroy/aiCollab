-- Demo accounts: four confirmed users added to one workspace.
-- Re-runnable: existing demo users are kept and only get their password reset.
-- Run in the Supabase SQL editor (or any session as postgres). Not a migration.
--
-- Sign in as demo1@example.com … demo4@example.com with the password below.

do $$
declare
  owner_email text := 'ian6502011@gmail.com';   -- whose workspace to join
  workspace_name text := null;                  -- null = that person's oldest workspace
  demo_password text := 'demo-pass-2026';
  ws uuid;
  u record;
  uid uuid;
begin
  select w.id into ws
  from public.workspaces w
  join public.profiles p on p.id = w.created_by
  where p.email = lower(owner_email) and (workspace_name is null or w.name = workspace_name)
  order by w.created_at
  limit 1;
  if ws is null then
    raise exception 'No workspace found for %', owner_email;
  end if;

  for u in
    select * from (values
      ('demo1@example.com', 'Ava (demo)'),
      ('demo2@example.com', 'Ben (demo)'),
      ('demo3@example.com', 'Cara (demo)'),
      ('demo4@example.com', 'Dev (demo)')
    ) as t (email, display_name)
  loop
    select id into uid from auth.users where email = u.email;

    if uid is null then
      uid := gen_random_uuid();
      -- Token columns must be '' rather than null or Auth fails to load the user.
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', u.email,
        extensions.crypt(demo_password, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('display_name', u.display_name), now(), now(),
        '', '', '', ''
      );
      insert into auth.identities (
        id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), uid, uid::text, 'email',
        jsonb_build_object('sub', uid::text, 'email', u.email, 'email_verified', true),
        now(), now(), now()
      );
      -- The on_auth_user_created trigger creates the profile.
    else
      update auth.users
      set encrypted_password = extensions.crypt(demo_password, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = uid;
    end if;

    insert into public.workspace_members (workspace_id, user_id)
    values (ws, uid)
    on conflict do nothing;
  end loop;
end;
$$;

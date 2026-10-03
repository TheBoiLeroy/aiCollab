-- Each person's own AI provider keys, used for their private threads.
-- The app encrypts keys (AES-256-GCM, PROVIDER_KEYS_SECRET) before storing them,
-- so this table only ever holds ciphertext. Owner-only, like threads.

create table public.user_provider_keys (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'google')),
  ciphertext text not null,
  hint text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.user_provider_keys enable row level security;

create policy "provider keys: owner all" on public.user_provider_keys for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.user_provider_keys from anon;

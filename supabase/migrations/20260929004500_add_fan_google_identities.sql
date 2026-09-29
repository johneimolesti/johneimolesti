create table if not exists public.fan_auth_identities (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  fan_id uuid not null references public.fans(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  email text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists fan_auth_identities_fan_id_idx
  on public.fan_auth_identities(fan_id);

alter table public.fan_auth_identities enable row level security;

revoke all on table public.fan_auth_identities
  from public, anon, authenticated;

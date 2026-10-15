create table if not exists public.ai_signin_transactions (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  workspace_id uuid not null references public.studio_workspaces(id) on delete cascade,
  nonce text not null,
  code_verifier_ciphertext text not null,
  redirect_uri text not null,
  return_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_signin_transactions_expiry_idx on public.ai_signin_transactions(expires_at);

create table if not exists public.ai_provider_connections (
  workspace_id uuid not null references public.studio_workspaces(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  subject text not null,
  email text,
  display_name text,
  picture_url text,
  scopes text[] not null default '{}',
  credentials_ciphertext text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, provider)
);

alter table public.ai_signin_transactions enable row level security;
alter table public.ai_provider_connections enable row level security;
revoke all on public.ai_signin_transactions, public.ai_provider_connections from anon, authenticated;
grant all on public.ai_signin_transactions, public.ai_provider_connections to service_role;

create or replace function public.consume_ai_signin_transaction(p_state_hash text)
returns setof public.ai_signin_transactions
language sql
security definer
set search_path = ''
as $$
  delete from public.ai_signin_transactions
  where state_hash = p_state_hash
  returning *;
$$;

revoke all on function public.consume_ai_signin_transaction(text) from public, anon, authenticated;
grant execute on function public.consume_ai_signin_transaction(text) to service_role;

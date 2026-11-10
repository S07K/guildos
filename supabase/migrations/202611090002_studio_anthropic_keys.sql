-- Claude (Anthropic API key) is an independent workspace BYOK connection.
create table if not exists public.studio_anthropic_keys (
 workspace_id uuid primary key references public.studio_workspaces(id) on delete cascade,
 ciphertext text not null,
 suffix text not null,
 model text not null default 'claude-opus-5-5',
 updated_at timestamptz not null default now()
);
alter table public.studio_anthropic_keys enable row level security;
revoke all on public.studio_anthropic_keys from anon,authenticated;
grant all on public.studio_anthropic_keys to service_role;

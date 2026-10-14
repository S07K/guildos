-- Codex-managed ChatGPT auth is stored only as an encrypted opaque payload.
create table if not exists public.studio_chatgpt_sessions (
 workspace_id uuid primary key references public.studio_workspaces(id) on delete cascade,
 ciphertext text not null,
 plan_type text,
 updated_at timestamptz not null default now()
);
alter table public.studio_chatgpt_sessions enable row level security;
revoke all on public.studio_chatgpt_sessions from public, anon, authenticated;
grant all on public.studio_chatgpt_sessions to service_role;

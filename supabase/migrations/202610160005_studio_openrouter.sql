-- OpenRouter is a separate encrypted workspace connection. Existing OpenAI
-- credentials are unchanged and never sent to OpenRouter.
create table if not exists public.studio_openrouter_keys (
 workspace_id uuid primary key references public.studio_workspaces(id) on delete cascade,
 ciphertext text not null,
 suffix text not null,
 model text not null default 'nvidia/nemotron-3-super-120b-a12b:free',
 updated_at timestamptz not null default now()
);
alter table public.studio_openrouter_keys enable row level security;
revoke all on public.studio_openrouter_keys from anon,authenticated;
grant all on public.studio_openrouter_keys to service_role;

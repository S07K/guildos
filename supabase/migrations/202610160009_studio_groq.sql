-- Groq is an independent workspace BYOK connection.
create table public.studio_groq_keys (
 workspace_id uuid primary key references public.studio_workspaces(id) on delete cascade,
 ciphertext text not null,
 suffix text not null,
 model text not null default 'openai/gpt-oss-120b',
 updated_at timestamptz not null default now()
);
alter table public.studio_groq_keys enable row level security;
revoke all on public.studio_groq_keys from anon,authenticated;
grant all on public.studio_groq_keys to service_role;

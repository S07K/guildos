-- Read-only share links for one screen or a whole board. The link token is a bearer
-- secret: only its SHA-256 is used for lookup, and an encrypted copy (STUDIO_VAULT_KEY,
-- bound to the workspace) lets the owner copy the link again. Links are revoked, never edited.

create table if not exists public.studio_share_links (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null,
 workspace_id uuid not null,
 screen_id uuid,
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 token_ciphertext text not null check (token_ciphertext like 'v1.%'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 revoked_at timestamptz,
 foreign key (project_id, workspace_id) references public.studio_projects(id, workspace_id) on delete cascade,
 foreign key (screen_id, project_id, workspace_id) references public.studio_screens(id, project_id, workspace_id) on delete cascade
);
create index if not exists studio_share_links_project on public.studio_share_links(project_id) where revoked_at is null;

alter table public.studio_share_links enable row level security;
drop policy if exists share_link_owner on public.studio_share_links;
create policy share_link_owner on public.studio_share_links for select to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id = (select auth.uid())));
-- Owners read their links; writes and public lookups go through the server (service role) after its own checks.
revoke all on public.studio_share_links from public, anon, authenticated;
grant select on public.studio_share_links to authenticated;
grant all on public.studio_share_links to service_role;

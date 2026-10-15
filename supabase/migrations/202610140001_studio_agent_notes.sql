-- Reviews are attached to one project and, when available, one saved design.
-- A composite foreign key prevents a note from referencing another tenant's version.
create unique index if not exists studio_versions_scope on public.studio_versions(id, project_id, workspace_id);

create table if not exists public.studio_agent_notes (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null,
 workspace_id uuid not null,
 version_id uuid,
 author_role text not null check (author_role in ('human','creative_director','ux_architect','copywriter','ui_designer','qa_critic')),
 mentioned_role text check (mentioned_role in ('creative_director','ux_architect','copywriter','ui_designer','qa_critic')),
 anchor text not null default 'page' check (anchor in ('page','header','hero','features','closing','footer')),
 body text not null check (length(body) between 1 and 2000),
 created_at timestamptz not null default now(),
 foreign key(project_id, workspace_id) references public.studio_projects(id, workspace_id) on delete cascade,
 foreign key(version_id, project_id, workspace_id) references public.studio_versions(id, project_id, workspace_id) on delete cascade
);

create index if not exists studio_agent_notes_project on public.studio_agent_notes(project_id, created_at, id);
alter table public.studio_agent_notes enable row level security;
revoke all on public.studio_agent_notes from anon, authenticated;
grant select on public.studio_agent_notes to authenticated;
grant all on public.studio_agent_notes to service_role;
drop policy if exists studio_agent_notes_owner on public.studio_agent_notes;
create policy studio_agent_notes_owner on public.studio_agent_notes for select to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id = (select auth.uid())));

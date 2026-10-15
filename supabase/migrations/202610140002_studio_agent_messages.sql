-- A conversation belongs to exactly one project and one specialist.
create table if not exists public.studio_agent_messages (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null,
 workspace_id uuid not null,
 agent_role text not null check (agent_role in ('creative_director','ux_architect','copywriter','ui_designer','qa_critic')),
 author_kind text not null check (author_kind in ('human','agent')),
 body text not null check (length(body) between 1 and 4000),
 model text,
 input_tokens integer not null default 0 check (input_tokens >= 0),
 output_tokens integer not null default 0 check (output_tokens >= 0),
 created_at timestamptz not null default now(),
 foreign key(project_id, workspace_id) references public.studio_projects(id, workspace_id) on delete cascade
);
create index if not exists studio_agent_messages_thread on public.studio_agent_messages(project_id, agent_role, created_at, id);
alter table public.studio_agent_messages enable row level security;
revoke all on public.studio_agent_messages from anon, authenticated;
grant select on public.studio_agent_messages to authenticated;
grant all on public.studio_agent_messages to service_role;
drop policy if exists studio_agent_messages_owner on public.studio_agent_messages;
create policy studio_agent_messages_owner on public.studio_agent_messages for select to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id = (select auth.uid())));

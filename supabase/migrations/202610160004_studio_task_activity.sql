-- Durable, tenant-scoped public progress updates for agent work.
alter table public.studio_tasks
 add constraint studio_tasks_event_scope unique (id,project_id,workspace_id);

create table public.studio_task_events (
 id bigint generated always as identity primary key,
 task_id uuid not null,
 project_id uuid not null,
 workspace_id uuid not null,
 kind text not null check (kind in ('status','handoff','result','error')),
 speaker_role text check (speaker_role in ('creative_director','ux_architect','copywriter','ui_designer','qa_critic')),
 recipient_role text check (recipient_role in ('creative_director','ux_architect','copywriter','ui_designer','qa_critic')),
 body text not null check (length(body) between 1 and 1000),
 created_at timestamptz not null default now(),
 foreign key (task_id,project_id,workspace_id)
  references public.studio_tasks(id,project_id,workspace_id) on delete cascade
);
create index studio_task_events_project on public.studio_task_events(project_id,id desc);
alter table public.studio_task_events enable row level security;
revoke all on public.studio_task_events from anon,authenticated;
grant select on public.studio_task_events to authenticated;
grant all on public.studio_task_events to service_role;
create policy studio_task_events_owner on public.studio_task_events for select to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id=(select auth.uid())));

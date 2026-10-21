-- Durable, tenant-scoped public progress updates for agent work.
-- This migration may already exist on databases initialized through SQL Editor.
-- Reuse the matching constraint without dropping its dependent foreign keys.
do $$
declare existing_definition text;
begin
 select pg_get_constraintdef(oid) into existing_definition
 from pg_constraint
 where conrelid='public.studio_tasks'::regclass and conname='studio_tasks_event_scope';
 if existing_definition is null then
  alter table public.studio_tasks
   add constraint studio_tasks_event_scope unique (id,project_id,workspace_id);
 elsif existing_definition <> 'UNIQUE (id, project_id, workspace_id)' then
  raise exception 'studio_tasks_event_scope has an unexpected definition; reconcile the schema before deploying';
 end if;
end $$;

create table if not exists public.studio_task_events (
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
create index if not exists studio_task_events_project on public.studio_task_events(project_id,id desc);
alter table public.studio_task_events enable row level security;
revoke all on public.studio_task_events from anon,authenticated;
grant select on public.studio_task_events to authenticated;
grant all on public.studio_task_events to service_role;
drop policy if exists studio_task_events_owner on public.studio_task_events;
create policy studio_task_events_owner on public.studio_task_events for select to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id=(select auth.uid())));

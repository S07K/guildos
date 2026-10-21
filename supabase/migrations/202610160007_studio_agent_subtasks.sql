-- Persist each agent handoff as a tenant-scoped Kanban subtask.
create table public.studio_task_subtasks (
 id uuid primary key default gen_random_uuid(),
 parent_task_id uuid not null,
 project_id uuid not null,
 workspace_id uuid not null,
 step_key text not null check (step_key ~ '^[a-z0-9-]{1,32}$'),
 agent_role text not null check (agent_role in ('creative_director','ux_architect','copywriter','ui_designer','qa_critic')),
 instruction text not null check (length(instruction) between 1 and 2000),
 status text not null check (status in ('queued','running','review','done','blocked','failed','cancelled')),
 summary text not null default '' check (length(summary) <= 2000),
 error text not null default '' check (length(error) <= 2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (parent_task_id,step_key),
 foreign key (parent_task_id,project_id,workspace_id)
  references public.studio_tasks(id,project_id,workspace_id) on delete cascade
);
create index studio_task_subtasks_project on public.studio_task_subtasks(project_id,created_at desc);
alter table public.studio_task_subtasks enable row level security;
revoke all on public.studio_task_subtasks from anon,authenticated;
grant select on public.studio_task_subtasks to authenticated;
grant all on public.studio_task_subtasks to service_role;
create policy studio_task_subtasks_owner on public.studio_task_subtasks for select to authenticated
 using (workspace_id in (select id from public.studio_workspaces where owner_id=(select auth.uid())));

create function public.set_studio_task_subtask(
 p_task uuid,p_token uuid,p_step_key text,p_agent_role text,p_instruction text,
 p_status text,p_summary text default '',p_error text default ''
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare parent public.studio_tasks%rowtype; child public.studio_task_subtasks%rowtype;
begin
 select * into parent from public.studio_tasks where id=p_task for update;
 if parent.id is null or parent.status<>'running' or parent.lease_token is distinct from p_token or parent.lease_until<now() then
  return jsonb_build_object('status','stale');
 end if;
 if p_step_key !~ '^[a-z0-9-]{1,32}$' or p_agent_role not in ('creative_director','ux_architect','copywriter','ui_designer','qa_critic')
  or p_status not in ('queued','running','review','done','blocked','failed','cancelled')
  or length(p_instruction) not between 1 and 2000 or length(p_summary)>2000 or length(p_error)>2000 then
  raise exception 'Invalid agent subtask';
 end if;
 insert into public.studio_task_subtasks(parent_task_id,project_id,workspace_id,step_key,agent_role,instruction,status,summary,error)
 values(parent.id,parent.project_id,parent.workspace_id,p_step_key,p_agent_role,p_instruction,p_status,p_summary,p_error)
 on conflict(parent_task_id,step_key) do update set agent_role=excluded.agent_role,instruction=excluded.instruction,
  status=excluded.status,summary=excluded.summary,error=excluded.error,updated_at=now()
 returning * into child;
 return jsonb_build_object('status','saved','id',child.id);
end $$;
revoke all on function public.set_studio_task_subtask(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.set_studio_task_subtask(uuid,uuid,text,text,text,text,text,text) to service_role;

create function public.reset_studio_task_subtasks(p_task uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
declare parent public.studio_tasks%rowtype;
begin
 select * into parent from public.studio_tasks where id=p_task for update;
 if parent.id is null or parent.status<>'running' or parent.lease_token is distinct from p_token or parent.lease_until<now() then return false; end if;
 delete from public.studio_task_subtasks where parent_task_id=p_task;
 return true;
end $$;
revoke all on function public.reset_studio_task_subtasks(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reset_studio_task_subtasks(uuid,uuid) to service_role;

create function public.sync_studio_task_subtasks() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.status in ('cancelled','failed','blocked') and old.status is distinct from new.status then
  update public.studio_task_subtasks set status=new.status,error=coalesce(nullif(new.error,''),nullif(new.summary,''),''),updated_at=now()
   where parent_task_id=new.id and status in ('queued','running');
 end if;
 return new;
end $$;
create trigger studio_task_subtasks_parent_status after update of status on public.studio_tasks
 for each row execute function public.sync_studio_task_subtasks();

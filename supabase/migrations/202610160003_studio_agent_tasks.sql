create table if not exists public.studio_tasks (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null,
 workspace_id uuid not null,
 actor_id uuid not null references auth.users(id),
 request_id uuid not null,
 source_note_id uuid not null references public.studio_agent_notes(id) on delete cascade,
 agent_role text not null check(agent_role in ('creative_director','ux_architect','copywriter','ui_designer','qa_critic')),
 instruction text not null check(length(instruction) between 1 and 2000),
 status text not null default 'queued' check(status in ('queued','running','review','done','blocked','failed','cancelled')),
 attempts integer not null default 0,
 lease_token uuid,
 lease_until timestamptz,
 available_at timestamptz not null default now(),
 result_version_id uuid,
 summary text not null default '',
 error text not null default '',
 input_tokens bigint not null default 0,
 output_tokens bigint not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(project_id,request_id),
 foreign key(project_id,workspace_id) references public.studio_projects(id,workspace_id) on delete cascade,
 foreign key(result_version_id,project_id,workspace_id) references public.studio_versions(id,project_id,workspace_id)
);
create index if not exists studio_tasks_queue on public.studio_tasks(status,available_at,created_at);
create index if not exists studio_tasks_workspace on public.studio_tasks(workspace_id,created_at desc);
alter table public.studio_tasks enable row level security;
revoke all on public.studio_tasks from anon,authenticated;
grant select on public.studio_tasks to authenticated;
grant all on public.studio_tasks to service_role;
drop policy if exists studio_tasks_owner on public.studio_tasks;
create policy studio_tasks_owner on public.studio_tasks for select to authenticated
 using(workspace_id in(select id from public.studio_workspaces where owner_id=(select auth.uid())));

-- The human message and dispatch intent are one transaction, with retry deduplication.
create or replace function public.enqueue_studio_task(p_project uuid,p_actor uuid,p_request uuid,p_text text,p_role text,p_version uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare workspace uuid; task studio_tasks%rowtype; note studio_agent_notes%rowtype;
begin
 select p.workspace_id into workspace from studio_projects p join studio_workspaces w on w.id=p.workspace_id
 where p.id=p_project and w.owner_id=p_actor for update of p;
 if not found then return jsonb_build_object('status','not_found'); end if;
 select * into task from studio_tasks where project_id=p_project and request_id=p_request;
 if found then
  if task.instruction<>p_text or task.agent_role<>p_role then return jsonb_build_object('status','conflict'); end if;
  select * into note from studio_agent_notes where id=task.source_note_id;
  if note.version_id is distinct from p_version then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','replayed','task',to_jsonb(task),'note',to_jsonb(note));
 end if;
 if p_version is not null and not exists(select 1 from studio_versions where id=p_version and project_id=p_project and workspace_id=workspace) then return jsonb_build_object('status','not_found'); end if;
 if (select count(*) from studio_tasks where workspace_id=workspace and status in('queued','running'))>=20 then return jsonb_build_object('status','full'); end if;
 insert into studio_agent_notes(project_id,workspace_id,version_id,author_role,mentioned_role,anchor,body)
 values(p_project,workspace,p_version,'human',p_role,'page',p_text) returning * into note;
 insert into studio_tasks(project_id,workspace_id,actor_id,request_id,source_note_id,agent_role,instruction)
 values(p_project,workspace,p_actor,p_request,note.id,p_role,p_text) returning * into task;
 return jsonb_build_object('status','queued','task',to_jsonb(task),'note',to_jsonb(note));
end; $$;

-- Lock the workspace as well as the task: multiple workers cannot claim two jobs
-- for one workspace. The existing generation budget is reserved by the worker.
create or replace function public.claim_studio_task(p_token uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task studio_tasks%rowtype;
begin
 update studio_tasks set status='failed',error='Worker stopped repeatedly. Retry when the worker is healthy.',updated_at=now(),lease_token=null,lease_until=null
 where status='running' and lease_until<now() and attempts>=3;
 select t.* into task from studio_tasks t join studio_workspaces w on w.id=t.workspace_id
 where ((t.status='queued' and t.available_at<=now()) or (t.status='running' and t.lease_until<now())) and t.attempts<3
 and not exists(select 1 from studio_tasks other where other.workspace_id=t.workspace_id and other.id<>t.id and other.status='running' and other.lease_until>=now())
 order by t.created_at,t.id for update of w,t skip locked limit 1;
 if not found then return null; end if;
 if exists(select 1 from studio_tasks where workspace_id=task.workspace_id and id<>task.id and status='running' and lease_until>=now()) then return null; end if;
 update studio_tasks set status='running',attempts=attempts+1,lease_token=p_token,lease_until=now()+interval '2 minutes',updated_at=now(),error=''
 where id=task.id returning * into task;
 return to_jsonb(task);
end; $$;

create or replace function public.heartbeat_studio_task(p_task uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update studio_tasks set lease_until=now()+interval '2 minutes',updated_at=now()
 where id=p_task and status='running' and lease_token=p_token and lease_until>now();
 return found;
end; $$;

create or replace function public.defer_studio_task(p_task uuid,p_token uuid,p_reason text,p_budget boolean default false)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update studio_tasks set status=case when not p_budget and attempts>=3 then 'failed' else 'queued' end,
 attempts=case when p_budget then greatest(0,attempts-1) else attempts end,
 available_at=now()+case when p_budget then interval '60 seconds' else interval '15 seconds'*attempts end,
 error=left(p_reason,500),lease_token=null,lease_until=null,updated_at=now()
 where id=p_task and status='running' and lease_token=p_token and lease_until>now();
 return found;
end; $$;

-- Cancellation and final commit lock the same task row. A cancelled/reclaimed
-- worker cannot write a canvas version or emit a success message.
create or replace function public.finish_studio_task(p_task uuid,p_token uuid,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task studio_tasks%rowtype; committed jsonb; target_status text; version uuid;
begin
 select * into task from studio_tasks where id=p_task for update;
 if not found or task.status<>'running' or task.lease_token is distinct from p_token or task.lease_until<=now() then return jsonb_build_object('status','stale'); end if;
 if p_result->>'mode' is null or p_result->>'mode' not in ('edit','reply','blocked') or p_result->>'summary' is null or length(p_result->>'summary')>2000 then raise exception 'Invalid result'; end if;
 target_status:=case when p_result->>'mode'='blocked' then 'blocked' when p_result->>'mode'='reply' then 'done' else 'review' end;
 if target_status='review' then
  committed:=commit_studio_version(task.project_id,task.workspace_id,task.actor_id,task.id,
   (p_result->>'expectedVersionId')::uuid,(p_result->>'expectedVersionId')::uuid,p_result->'document',task.instruction,
   p_result->>'model',(p_result->>'input_tokens')::integer,(p_result->>'output_tokens')::integer,p_result->'commands');
  if committed->>'status' not in('committed','replayed') then
   target_status:='blocked';
   p_result:=p_result||jsonb_build_object('summary','The canvas changed while I was working. Retry this task to work from the latest version.');
  else version:=(committed->'version'->>'id')::uuid; end if;
 end if;
 update studio_tasks set status=target_status,result_version_id=version,summary=p_result->>'summary',
 input_tokens=input_tokens+coalesce((p_result->>'input_tokens')::integer,0),output_tokens=output_tokens+coalesce((p_result->>'output_tokens')::integer,0),
 lease_token=null,lease_until=null,updated_at=now() where id=task.id;
 insert into studio_agent_notes(project_id,workspace_id,version_id,author_role,anchor,body)
 values(task.project_id,task.workspace_id,version,task.agent_role,'page',p_result->>'summary');
 -- Versions account for successful edits; other responses account as chat usage.
 if version is null then
  insert into studio_agent_messages(project_id,workspace_id,agent_role,author_kind,body,model,input_tokens,output_tokens)
  values(task.project_id,task.workspace_id,task.agent_role,'agent',p_result->>'summary',p_result->>'model',coalesce((p_result->>'input_tokens')::integer,0),coalesce((p_result->>'output_tokens')::integer,0));
 end if;
 return jsonb_build_object('status',target_status,'versionId',version);
end; $$;

create or replace function public.control_studio_task(p_task uuid,p_actor uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task studio_tasks%rowtype;
begin
 select t.* into task from studio_tasks t join studio_workspaces w on w.id=t.workspace_id
 where t.id=p_task and w.owner_id=p_actor for update of t;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if p_action='cancel' and task.status in('queued','running','blocked','failed') then
  update studio_tasks set status='cancelled',lease_token=null,lease_until=null,updated_at=now() where id=task.id;
 elsif p_action='retry' and task.status in('blocked','failed','cancelled') then
  update studio_tasks set status='queued',attempts=0,error='',available_at=now(),lease_token=null,lease_until=null,updated_at=now() where id=task.id;
 elsif p_action='approve' and task.status='review' then
  update studio_tasks set status='done',updated_at=now() where id=task.id;
 else return jsonb_build_object('status','invalid_transition'); end if;
 return jsonb_build_object('status','updated');
end; $$;

revoke all on function public.enqueue_studio_task(uuid,uuid,uuid,text,text,uuid),public.claim_studio_task(uuid),public.heartbeat_studio_task(uuid,uuid),public.defer_studio_task(uuid,uuid,text,boolean),public.finish_studio_task(uuid,uuid,jsonb),public.control_studio_task(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.enqueue_studio_task(uuid,uuid,uuid,text,text,uuid),public.claim_studio_task(uuid),public.heartbeat_studio_task(uuid,uuid),public.defer_studio_task(uuid,uuid,text,boolean),public.finish_studio_task(uuid,uuid,jsonb),public.control_studio_task(uuid,uuid,text) to service_role;

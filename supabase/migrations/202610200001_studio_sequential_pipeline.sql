-- Private, durable single-screen state. Only the final QA-approved draft becomes a version.
create table if not exists public.studio_pipeline_drafts (
 task_id uuid primary key,
 project_id uuid not null,
 workspace_id uuid not null,
 state jsonb not null check(jsonb_typeof(state)='object'),
 updated_at timestamptz not null default now(),
 foreign key(task_id,project_id,workspace_id) references public.studio_tasks(id,project_id,workspace_id) on delete cascade
);
alter table public.studio_pipeline_drafts enable row level security;
revoke all on public.studio_pipeline_drafts from public,anon,authenticated;
grant all on public.studio_pipeline_drafts to service_role;

-- Retire unfinished legacy children; restart their root prompt through all five stages.
-- Saved versions remain untouched. Expired leases cannot publish through the new gate.
do $$
declare restarting uuid[];
begin
 -- On replay, the pipeline RPC already exists. Never restart current work or
 -- cancel its children just because migration history is being adopted.
 if to_regprocedure('public.init_studio_pipeline(uuid,uuid,jsonb)') is not null then
  return;
 end if;
 select array_agg(id) into restarting from public.studio_tasks where parent_task_id is null and status in ('delegated','running');
 update public.studio_tasks set status='cancelled',lease_token=null,lease_until=null,updated_at=now()
 where parent_task_id is not null and status in ('queued','running');
 update public.studio_tasks set status='queued',attempts=0,available_at=now(),error='',
  lease_token=null,lease_until=null,delegation_id=null,updated_at=now()
 where id=any(restarting);
end $$;

create or replace function public.init_studio_pipeline(p_task uuid,p_token uuid,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task public.studio_tasks%rowtype; draft jsonb;
begin
 select * into task from public.studio_tasks where id=p_task for update;
 if task.id is null or task.parent_task_id is not null or task.status<>'running'
  or task.lease_token is distinct from p_token or task.lease_until<=now() then return jsonb_build_object('status','stale'); end if;
 if p_state->>'stage' is distinct from '0' or p_state->>'round' is distinct from '0' or p_state->>'action' is distinct from '0'
  or coalesce(p_state->>'targetScreenId','') !~ '^[a-zA-Z0-9_-]{1,80}$'
  or jsonb_typeof(p_state->'document') is distinct from 'object'
  or p_state->'commands' is distinct from '[]'::jsonb or p_state->'issues' is distinct from '[]'::jsonb
 then raise exception 'Invalid initial pipeline state'; end if;
 if p_state->>'baseVersionId' is not null and not exists(select 1 from public.studio_versions
  where id=(p_state->>'baseVersionId')::uuid and workspace_id=task.workspace_id and project_id=task.project_id)
 then raise exception 'Invalid base version scope'; end if;
 insert into public.studio_pipeline_drafts(task_id,project_id,workspace_id,state)
 values(task.id,task.project_id,task.workspace_id,p_state) on conflict(task_id) do nothing;
 select state into draft from public.studio_pipeline_drafts where task_id=task.id;
 return jsonb_build_object('status','initialized','state',draft);
end $$;

create or replace function public.checkpoint_studio_pipeline(p_task uuid,p_token uuid,p_previous jsonb,p_next jsonb,
 p_summary text,p_model text,p_input integer,p_output integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task public.studio_tasks%rowtype; current_state jsonb; old_stage integer; next_stage integer; speaker text;
begin
 select * into task from public.studio_tasks where id=p_task for update;
 if task.id is null or task.status<>'running' or task.lease_token is distinct from p_token
  or task.lease_until<=now() then return jsonb_build_object('status','stale'); end if;
 select state into current_state from public.studio_pipeline_drafts where task_id=task.id for update;
 if current_state is distinct from p_previous then return jsonb_build_object('status','stale'); end if;
 old_stage:=(current_state->>'stage')::integer; next_stage:=(p_next->>'stage')::integer;
 if next_stage is null or next_stage not between 0 and 5 or old_stage not between 0 and 4
  or coalesce(p_next->>'action','') !~ '^[0-7]$' or coalesce(p_next->>'round','') !~ '^[0-3]$'
  or p_input is null or p_output is null or p_input<0 or p_output<0
  or p_next->>'targetScreenId' is distinct from current_state->>'targetScreenId'
  or p_next->>'baseVersionId' is distinct from current_state->>'baseVersionId'
  or jsonb_typeof(p_next->'document') is distinct from 'object'
  or jsonb_typeof(p_next->'commands') is distinct from 'array'
  or jsonb_typeof(p_next->'issues') is distinct from 'array'
 then raise exception 'Invalid pipeline checkpoint'; end if;
 if old_stage<4 then
  if next_stage not in(old_stage,old_stage+1) or p_next->>'round' is distinct from current_state->>'round'
   or p_next->'issues' is distinct from current_state->'issues'
   or (next_stage=old_stage and (p_next->>'action')::integer<>(current_state->>'action')::integer+1)
   or (next_stage=old_stage+1 and p_next->>'action'<>'0')
  then raise exception 'Pipeline stages cannot be skipped'; end if;
 else
  if p_next->'document' is distinct from current_state->'document' or p_next->'commands' is distinct from current_state->'commands'
   or not ((next_stage=5 and p_next->'issues'='[]'::jsonb and p_next->>'round'=current_state->>'round')
    or (next_stage between 0 and 3 and jsonb_array_length(p_next->'issues')>0
     and (p_next->>'round')::integer=(current_state->>'round')::integer+1 and (p_next->>'round')::integer<=3))
  then raise exception 'QA must reject or approve without editing'; end if;
 end if;
 speaker:=(array['ux_architect','creative_director','ui_designer','copywriter','qa_critic'])[old_stage+1];
 update public.studio_pipeline_drafts set state=p_next,updated_at=now() where task_id=task.id;
 insert into public.studio_agent_messages(project_id,workspace_id,agent_role,author_kind,body,model,input_tokens,output_tokens)
 values(task.project_id,task.workspace_id,speaker,'agent',p_summary,p_model,p_input,p_output);
 update public.studio_tasks set status=case when next_stage=5 then 'running' else 'queued' end,
  attempts=0,available_at=now(),summary=p_summary,input_tokens=input_tokens+p_input,output_tokens=output_tokens+p_output,
  lease_token=case when next_stage=5 then lease_token else null end,
  lease_until=case when next_stage=5 then lease_until else null end,updated_at=now()
 where id=task.id;
 return jsonb_build_object('status','checkpointed');
end $$;
revoke all on function public.init_studio_pipeline(uuid,uuid,jsonb),public.checkpoint_studio_pipeline(uuid,uuid,jsonb,jsonb,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.init_studio_pipeline(uuid,uuid,jsonb),public.checkpoint_studio_pipeline(uuid,uuid,jsonb,jsonb,text,text,integer,integer) to service_role;

create or replace function public.claim_studio_task(p_token uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task studio_tasks%rowtype;
begin
 update studio_tasks set status='failed',error='Worker stopped repeatedly. Retry when the worker is healthy.',updated_at=now(),lease_token=null,lease_until=null
 where status='running' and lease_until<now() and attempts>=3;
 select t.* into task from studio_tasks t join studio_workspaces w on w.id=t.workspace_id
 where t.parent_task_id is null and ((t.status='queued' and t.available_at<=now()) or (t.status='running' and t.lease_until<now())) and t.attempts<3
 and not exists(select 1 from studio_tasks other where other.workspace_id=t.workspace_id and other.id<>t.id and other.status='running' and other.lease_until>=now())
 and not exists(select 1 from public.studio_pipeline_drafts draft join public.studio_tasks active on active.id=draft.task_id where active.workspace_id=t.workspace_id and active.id<>t.id and active.status in ('queued','running'))
 order by t.created_at,t.id for update of w,t skip locked limit 1;
 if not found then return null; end if;
 if exists(select 1 from studio_tasks where workspace_id=task.workspace_id and id<>task.id and status='running' and lease_until>=now()) then return null; end if;
 update studio_tasks set status='running',attempts=attempts+1,lease_token=p_token,lease_until=now()+interval '2 minutes',updated_at=now(),error=''
 where id=task.id returning * into task;
 return to_jsonb(task);
end; $$;

create or replace function public.finish_studio_task(p_task uuid,p_token uuid,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task studio_tasks%rowtype; committed jsonb; target_status text; version uuid;
begin
 select * into task from studio_tasks where id=p_task for update;
 if not found or task.status<>'running' or task.lease_token is distinct from p_token or task.lease_until<=now() then return jsonb_build_object('status','stale'); end if;
 if p_result->>'mode' is null or p_result->>'mode' not in ('edit','reply','blocked') or p_result->>'summary' is null or length(p_result->>'summary')>2000 then raise exception 'Invalid result'; end if;
 target_status:=case when p_result->>'mode'='blocked' then 'blocked' when p_result->>'mode'='reply' then 'done' else 'review' end;
 if target_status='review' then
  if not exists(select 1 from public.studio_pipeline_drafts d where d.task_id=task.id
   and (d.state->>'stage')::integer=5 and d.state->'issues'='[]'::jsonb
   and d.state->'document'=p_result->'document' and d.state->'commands'=p_result->'commands'
   and d.state->>'baseVersionId' is not distinct from p_result->>'expectedVersionId')
  then raise exception 'Only a QA-approved pipeline draft can be published'; end if;
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


-- Old workers must not recreate the free-form helper queue.
create or replace function public.delegate_studio_task(p_task uuid,p_token uuid,p_assignments jsonb,p_summary text,p_model text,p_input integer,p_output integer)
returns jsonb language plpgsql as $$ begin raise exception 'Use the sequential pipeline worker'; end $$;
create or replace function public.handoff_studio_task(p_task uuid,p_token uuid,p_role text,p_instruction text,p_summary text,p_model text,p_input integer,p_output integer)
returns jsonb language plpgsql as $$ begin raise exception 'Use the sequential pipeline worker'; end $$;
create or replace function public.claim_studio_task(p_token uuid,p_agent_role text)
returns jsonb language sql security invoker set search_path=public as $$ select public.claim_studio_task(p_token); $$;

-- Renew the model slot alongside the task so long requests cannot overlap a second generation.
create or replace function public.heartbeat_studio_task(p_task uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
declare workspace uuid;
begin
 update public.studio_tasks set lease_until=now()+interval '2 minutes',updated_at=now()
 where id=p_task and status='running' and lease_token=p_token and lease_until>now() returning workspace_id into workspace;
 if workspace is null then return false; end if;
 update public.studio_generation_limits set lease_until=now()+interval '3 minutes'
 where workspace_id=workspace and lease=p_token;
 return true;
end $$;

create or replace function public.reset_studio_pipeline() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if old.status in ('blocked','failed','cancelled') and new.status='queued' then
  delete from public.studio_pipeline_drafts where task_id=new.id;
 end if;
 return new;
end $$;
create or replace trigger reset_studio_pipeline after update of status on public.studio_tasks for each row execute function public.reset_studio_pipeline();

-- A private turn retains ownership between stages; unrelated generations must wait.
create or replace function public.reserve_studio_generation(workspace uuid,token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare allowed boolean;
begin
 perform 1 from public.studio_workspaces where id=workspace for update;
 if exists(select 1 from public.studio_pipeline_drafts draft join public.studio_tasks task on task.id=draft.task_id
  where task.workspace_id=workspace and task.status in ('queued','running') and task.lease_token is distinct from token)
 then return false; end if;
 insert into studio_generation_limits(workspace_id) values(workspace) on conflict do nothing;
 update studio_generation_limits set lease=token,lease_until=now()+interval '3 minutes',
  attempts=case when day=current_date then attempts+1 else 1 end,day=current_date
 where workspace_id=workspace and lease_until<=now() and (day<>current_date or attempts<30)
 returning true into allowed;
 return coalesce(allowed,false);
end $$;
create or replace function public.renew_studio_generation(p_workspace uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update public.studio_generation_limits set lease_until=now()+interval '3 minutes'
 where workspace_id=p_workspace and lease=p_token and lease_until>now();
 return found;
end $$;
revoke all on function public.renew_studio_generation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.renew_studio_generation(uuid,uuid) to service_role;

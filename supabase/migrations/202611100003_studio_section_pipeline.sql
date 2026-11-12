-- Section pipeline: plan → build sections → publish an html-screen version.
-- Drafts share studio_pipeline_drafts with the five-stage pipeline; their state
-- carries kind 'sections'. See docs/section-pipeline-redesign.md.

create or replace function public.init_studio_sections(p_task uuid,p_token uuid,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task public.studio_tasks%rowtype; draft jsonb;
begin
 select * into task from public.studio_tasks where id=p_task for update;
 if task.id is null or task.parent_task_id is not null or task.status<>'running'
  or task.lease_token is distinct from p_token or task.lease_until<=now() then return jsonb_build_object('status','stale'); end if;
 if p_state->>'kind' is distinct from 'sections' or p_state->>'phase' is distinct from 'plan'
  or jsonb_typeof(p_state->'document') is distinct from 'null' or p_state->'attempts' is distinct from '{}'::jsonb
 then raise exception 'Invalid initial section state'; end if;
 if p_state->>'baseVersionId' is not null and not exists(select 1 from public.studio_versions
  where id=(p_state->>'baseVersionId')::uuid and workspace_id=task.workspace_id and project_id=task.project_id)
 then raise exception 'Invalid base version scope'; end if;
 insert into public.studio_pipeline_drafts(task_id,project_id,workspace_id,state)
 values(task.id,task.project_id,task.workspace_id,p_state) on conflict(task_id) do nothing;
 select state into draft from public.studio_pipeline_drafts where task_id=task.id;
 return jsonb_build_object('status','initialized','state',draft);
end $$;

-- One checkpoint per plan or finished section. p_release hands the task back to
-- the queue so the next lease continues; otherwise the current lease keeps it.
create or replace function public.checkpoint_studio_sections(p_task uuid,p_token uuid,p_previous jsonb,p_next jsonb,
 p_speaker text,p_summary text,p_model text,p_input integer,p_output integer,p_release boolean)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task public.studio_tasks%rowtype; current_state jsonb; old_phase text; next_phase text;
begin
 select * into task from public.studio_tasks where id=p_task for update;
 if task.id is null or task.status<>'running' or task.lease_token is distinct from p_token
  or task.lease_until<=now() then return jsonb_build_object('status','stale'); end if;
 select state into current_state from public.studio_pipeline_drafts where task_id=task.id for update;
 if current_state is distinct from p_previous then return jsonb_build_object('status','stale'); end if;
 old_phase:=current_state->>'phase'; next_phase:=p_next->>'phase';
 if current_state->>'kind' is distinct from 'sections' or p_next->>'kind' is distinct from 'sections'
  or p_next->>'baseVersionId' is distinct from current_state->>'baseVersionId'
  or not ((old_phase='plan' and next_phase='build') or (old_phase='build' and next_phase in('build','done')))
  or p_next->'document'->>'kind' is distinct from 'html-screen'
  or jsonb_typeof(p_next->'document'->'sections') is distinct from 'array'
  or jsonb_typeof(p_next->'attempts') is distinct from 'object'
  or p_speaker not in('creative_director','ux_architect','ui_designer','copywriter','qa_critic')
  or p_input is null or p_output is null or p_input<0 or p_output<0 or p_summary is null
 then raise exception 'Invalid section checkpoint'; end if;
 update public.studio_pipeline_drafts set state=p_next,updated_at=now() where task_id=task.id;
 insert into public.studio_agent_messages(project_id,workspace_id,agent_role,author_kind,body,model,input_tokens,output_tokens)
 values(task.project_id,task.workspace_id,p_speaker,'agent',left(p_summary,2000),p_model,p_input,p_output);
 update public.studio_tasks set summary=left(p_summary,2000),input_tokens=input_tokens+p_input,output_tokens=output_tokens+p_output,
  status=case when p_release then 'queued' else status end,
  attempts=case when p_release then 0 else attempts end,
  available_at=case when p_release then now() else available_at end,
  lease_token=case when p_release then null else lease_token end,
  lease_until=case when p_release then null else lease_until end,updated_at=now()
 where id=task.id;
 return jsonb_build_object('status','checkpointed');
end $$;

revoke all on function public.init_studio_sections(uuid,uuid,jsonb),
 public.checkpoint_studio_sections(uuid,uuid,jsonb,jsonb,text,text,text,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.init_studio_sections(uuid,uuid,jsonb),
 public.checkpoint_studio_sections(uuid,uuid,jsonb,jsonb,text,text,text,integer,integer,boolean) to service_role;

-- Publishing accepts a QA-approved five-stage draft or a finished section draft.
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
   and d.state->'document'=p_result->'document'
   and d.state->>'baseVersionId' is not distinct from p_result->>'expectedVersionId'
   and ((d.state->>'kind' is null and (d.state->>'stage')::integer=5 and d.state->'issues'='[]'::jsonb and d.state->'commands'=p_result->'commands')
    or (d.state->>'kind'='sections' and d.state->>'phase'='done' and p_result->'commands'='[]'::jsonb)))
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
 if version is null then
  insert into studio_agent_messages(project_id,workspace_id,agent_role,author_kind,body,model,input_tokens,output_tokens)
  values(task.project_id,task.workspace_id,task.agent_role,'agent',p_result->>'summary',p_result->>'model',coalesce((p_result->>'input_tokens')::integer,0),coalesce((p_result->>'output_tokens')::integer,0));
 end if;
 return jsonb_build_object('status',target_status,'versionId',version);
end; $$;

-- Specialists can request a prerequisite from a colleague, then resume their own action.
alter table public.studio_tasks add column if not exists handoff_count integer not null default 0 check(handoff_count between 0 and 3);
alter table public.studio_tasks add column if not exists handoff_from_task_id uuid;
alter table public.studio_tasks drop constraint if exists studio_tasks_handoff_scope;
alter table public.studio_tasks add constraint studio_tasks_handoff_scope
 foreign key(handoff_from_task_id,project_id,workspace_id)
 references public.studio_tasks(id,project_id,workspace_id) on delete cascade;

create or replace function public.handoff_studio_task(p_task uuid,p_token uuid,p_role text,p_instruction text,
 p_summary text,p_model text,p_input integer,p_output integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare original public.studio_tasks%rowtype; helper_id uuid; root_id uuid; run_id uuid;
begin
 select * into original from public.studio_tasks where id=p_task for update;
 if original.id is null or original.status<>'running' or original.lease_token is distinct from p_token
  or original.lease_until<=now() then return jsonb_build_object('status','stale'); end if;
 if p_role is null or p_role not in ('creative_director','ux_architect','copywriter','ui_designer','qa_critic')
  or p_role=original.agent_role or p_instruction is null or length(trim(p_instruction)) not between 1 and 1600
  or p_summary is null or length(trim(p_summary)) not between 1 and 2000
  or p_model is null or length(p_model) not between 1 and 200
  or p_input is null or p_output is null or p_input<0 or p_output<0 then raise exception 'Invalid handoff'; end if;
 root_id:=coalesce(original.parent_task_id,original.id);
 run_id:=coalesce(original.delegation_id,gen_random_uuid());
 if original.parent_task_id is not null and not exists(select 1 from public.studio_tasks
  where id=root_id and workspace_id=original.workspace_id and project_id=original.project_id
   and delegation_id=run_id and status in ('delegated','queued')) then return jsonb_build_object('status','stale'); end if;
 -- Bound the whole run, including requests made by helpers, to avoid agent ping-pong.
 if original.handoff_count>=3 or (select count(*) from public.studio_tasks
  where parent_task_id=root_id and delegation_id=run_id and handoff_from_task_id is not null)>=3
 then return jsonb_build_object('status','limit_reached'); end if;
 insert into public.studio_tasks(project_id,workspace_id,actor_id,request_id,source_note_id,
  agent_role,instruction,parent_task_id,depends_on_task_id,delegation_id,task_kind,handoff_from_task_id,handoff_count)
 values(original.project_id,original.workspace_id,original.actor_id,gen_random_uuid(),original.source_note_id,
  p_role,p_instruction,root_id,original.depends_on_task_id,run_id,'work',original.id,original.handoff_count+1)
 returning id into helper_id;
 update public.studio_tasks set status='queued',depends_on_task_id=helper_id,delegation_id=run_id,
  handoff_count=handoff_count+1,attempts=0,available_at=now(),lease_token=null,lease_until=null,
  summary=p_summary,error='',input_tokens=input_tokens+p_input,output_tokens=output_tokens+p_output,updated_at=now()
 where id=original.id;
 insert into public.studio_task_events(task_id,project_id,workspace_id,kind,speaker_role,recipient_role,body)
 values(original.id,original.project_id,original.workspace_id,'handoff',original.agent_role,p_role,left(p_summary,1000));
 insert into public.studio_agent_notes(project_id,workspace_id,author_role,anchor,body)
 values(original.project_id,original.workspace_id,original.agent_role,'page',p_summary);
 insert into public.studio_agent_messages(project_id,workspace_id,agent_role,author_kind,body,model,input_tokens,output_tokens)
 values(original.project_id,original.workspace_id,original.agent_role,'agent',p_summary,p_model,p_input,p_output);
 return jsonb_build_object('status','handed_off','taskId',helper_id);
end $$;
revoke all on function public.handoff_studio_task(uuid,uuid,text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.handoff_studio_task(uuid,uuid,text,text,text,text,integer,integer) to service_role;

-- Root tasks can also wait for a helper. Surface helper failures on that waiting root.
create or replace function public.refresh_studio_parent() returns trigger language plpgsql security invoker set search_path=public as $$
declare next_status text; current_run uuid;
begin
 if new.parent_task_id is null or new.status=old.status then return new; end if;
 select delegation_id into current_run from public.studio_tasks where id=new.parent_task_id;
 if current_run is distinct from new.delegation_id then return new; end if;
 if exists(select 1 from public.studio_tasks where parent_task_id=new.parent_task_id
  and delegation_id=current_run and status in ('blocked','failed','cancelled')) then next_status:='blocked';
 elsif exists(select 1 from public.studio_tasks where parent_task_id=new.parent_task_id
  and delegation_id=current_run and task_kind='qa' and status in ('done','review'))
  and not exists(select 1 from public.studio_tasks where parent_task_id=new.parent_task_id
   and delegation_id=current_run and status not in ('review','done')) then next_status:='review';
 else return new; end if;
 update public.studio_tasks set status=next_status,updated_at=now(),
  error=case when next_status='blocked' then 'A delegated agent needs attention.' else error end
 where id=new.parent_task_id and (status='delegated' or (status='queued' and next_status='blocked' and depends_on_task_id is not null));
 return new;
end $$;

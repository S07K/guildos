-- Creative Direction can edit master containers; QA uses the shared component edit contract.
create or replace function public.delegate_studio_task(p_task uuid,p_token uuid,p_assignments jsonb,
 p_summary text,p_model text,p_input integer,p_output integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare parent public.studio_tasks%rowtype; item jsonb; child public.studio_tasks%rowtype;
 previous_id uuid; run_id uuid := gen_random_uuid(); created_ids uuid[] := '{}'; role_name text; assignment text; count_items integer;
begin
 select * into parent from public.studio_tasks where id=p_task for update;
 if parent.id is null or parent.status<>'running' or parent.task_kind<>'dispatch'
  or parent.lease_token is distinct from p_token or parent.lease_until<=now() then
  return jsonb_build_object('status','stale');
 end if;
 if jsonb_typeof(p_assignments)<>'array' or length(p_summary) not between 1 and 2000
  or p_input<0 or p_output<0 then raise exception 'Invalid delegation'; end if;
 count_items:=jsonb_array_length(p_assignments);
 if count_items<1 or count_items>12 then raise exception 'Invalid delegation size'; end if;
 for item in select value from jsonb_array_elements(p_assignments) loop
  role_name:=item->>'agent_role'; assignment:=item->>'instruction';
  if role_name not in ('creative_director','ux_architect','copywriter','ui_designer')
   or length(assignment) not between 1 and 2000 then raise exception 'Invalid assignment'; end if;
  insert into public.studio_tasks(project_id,workspace_id,actor_id,request_id,source_note_id,
   agent_role,instruction,parent_task_id,depends_on_task_id,delegation_id,task_kind)
  values(parent.project_id,parent.workspace_id,parent.actor_id,gen_random_uuid(),parent.source_note_id,
   role_name,assignment,parent.id,previous_id,run_id,'work') returning * into child;
  created_ids:=array_append(created_ids,child.id);
  previous_id:=child.id;
 end loop;
 insert into public.studio_tasks(project_id,workspace_id,actor_id,request_id,source_note_id,
  agent_role,instruction,parent_task_id,depends_on_task_id,delegation_id,task_kind)
 values(parent.project_id,parent.workspace_id,parent.actor_id,gen_random_uuid(),parent.source_note_id,
  'qa_critic','Audit and correct the latest component tree: 8px grid, axis sizing, contrast, labels and rendering health. Use the shared component JSON; at most 6 upserts per action.',parent.id,previous_id,run_id,'qa')
 returning * into child;
 created_ids:=array_append(created_ids,child.id);
 update public.studio_tasks set status='delegated',delegation_id=run_id,summary=p_summary,input_tokens=input_tokens+p_input,
  output_tokens=output_tokens+p_output,lease_token=null,lease_until=null,updated_at=now()
 where id=parent.id;
 insert into public.studio_agent_notes(project_id,workspace_id,author_role,anchor,body)
 values(parent.project_id,parent.workspace_id,parent.agent_role,'page',p_summary);
 insert into public.studio_agent_messages(project_id,workspace_id,agent_role,author_kind,body,model,input_tokens,output_tokens)
 values(parent.project_id,parent.workspace_id,parent.agent_role,'agent',p_summary,p_model,p_input,p_output);
 return jsonb_build_object('status','delegated','taskIds',to_jsonb(created_ids));
end $$;
revoke all on function public.delegate_studio_task(uuid,uuid,jsonb,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.delegate_studio_task(uuid,uuid,jsonb,text,text,integer,integer) to service_role;


-- QA may save component corrections before the parent reaches human review.
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
 where id=new.parent_task_id and status='delegated';
 return new;
end $$;

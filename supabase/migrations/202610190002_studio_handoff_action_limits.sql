-- Replace the delegation-wide handoff cap with the existing per-action/chain cap.
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
 -- Bound one action and its helper chain. Completed helpers for independent actions
 -- are progress, not a cycle, and must not exhaust another specialist's allowance.
 if original.handoff_count>=3 then return jsonb_build_object('status','limit_reached'); end if;
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

-- Resume roots that were stopped by the old delegation-wide cap. Give each a
-- fresh run ID so completed helpers remain as history without affecting it.
do $$
declare recoverable record;
begin
 for recoverable in
  select root.id,root.delegation_id
  from public.studio_tasks root
  where root.parent_task_id is null and root.status='blocked'
   and exists(select 1 from public.studio_tasks blocked_child
    where blocked_child.parent_task_id=root.id and blocked_child.delegation_id=root.delegation_id
     and blocked_child.status in ('blocked','failed')
     and blocked_child.summary like 'Automatic handoff limit reached.%')
  for update of root
 loop
  update public.studio_tasks child
  set status='cancelled',lease_token=null,lease_until=null,updated_at=now()
  where child.parent_task_id=recoverable.id and child.delegation_id=recoverable.delegation_id
   and child.status in ('queued','running','blocked','failed');
  update public.studio_tasks root
  set status='queued',attempts=0,error='',available_at=now(),delegation_id=gen_random_uuid(),
   lease_token=null,lease_until=null,updated_at=now()
  where root.id=recoverable.id;
 end loop;
end $$;

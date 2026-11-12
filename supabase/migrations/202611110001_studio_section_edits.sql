-- Section Edit and Add Section: a section draft may start in the build phase from
-- the saved screen it edits, with only the target section pending.
create or replace function public.init_studio_sections(p_task uuid,p_token uuid,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare task public.studio_tasks%rowtype; draft jsonb;
begin
 select * into task from public.studio_tasks where id=p_task for update;
 if task.id is null or task.parent_task_id is not null or task.status<>'running'
  or task.lease_token is distinct from p_token or task.lease_until<=now() then return jsonb_build_object('status','stale'); end if;
 if p_state->>'kind' is distinct from 'sections' or p_state->'attempts' is distinct from '{}'::jsonb
  or not ((p_state->>'phase'='plan' and jsonb_typeof(p_state->'document')='null')
   or (p_state->>'phase'='build' and p_state->>'baseVersionId' is not null
    and p_state->'document'->>'kind'='html-screen' and jsonb_typeof(p_state->'document'->'sections')='array'
    and p_state->'edit'->>'mode' in ('section','add')))
 then raise exception 'Invalid initial section state'; end if;
 if p_state->>'baseVersionId' is not null and not exists(select 1 from public.studio_versions
  where id=(p_state->>'baseVersionId')::uuid and workspace_id=task.workspace_id and project_id=task.project_id)
 then raise exception 'Invalid base version scope'; end if;
 insert into public.studio_pipeline_drafts(task_id,project_id,workspace_id,state)
 values(task.id,task.project_id,task.workspace_id,p_state) on conflict(task_id) do nothing;
 select state into draft from public.studio_pipeline_drafts where task_id=task.id;
 return jsonb_build_object('status','initialized','state',draft);
end $$;

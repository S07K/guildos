import { studioUser } from '@/lib/studio/supabase';
import { taskDisplay } from '@/lib/studio/task-display';
import { dailyLimitWait } from '@/lib/studio/task-wait';
import { taskReviewStatuses } from '@/lib/studio/review-state';
import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { privateJson as json, readCommitBody, uuid } from '@/lib/studio/version-commit';

export const runtime = 'nodejs';
const columns='id,parent_task_id,source_note_id,workspace_id,delegation_id,task_kind,project_id,agent_role,instruction,status,attempts,result_version_id,summary,error,input_tokens,output_tokens,created_at,updated_at';
export async function GET(request:Request) {
 if(!authConfig()) return json({error:'Studio access is not configured.'},503);
 const client=await sessionClient();
 const {data:{user}}=await studioUser(client);
 if(!user) return json({error:'Your session expired. Sign in again.'},401);
 const params=new URL(request.url).searchParams;
 const projectId=params.get('projectId');
 const offset=Number(params.get('offset')||0);
 if(!Number.isSafeInteger(offset)||offset<0) return json({error:'Invalid task page.'},400);
 if(projectId && !uuid.test(projectId)) return json({error:'Invalid project.'},400);
 let query=client.from('studio_tasks').select(columns).order('created_at',{ascending:false}).order('id').range(offset,offset+100);
 if(projectId) query=query.eq('project_id',projectId);
 const {data:rows,error}=await query;
 const data=rows?.slice(0,100);
 if(error) {
  console.error('Studio task query failed:',error.code,error.message);
  const unavailable=['PGRST205','42P01','42703'].includes(error.code);
  return json({error:unavailable?'Agent tasks need the latest database migration.':'Tasks could not be loaded.',code:unavailable?'TASKS_NOT_READY':'TASKS_UNAVAILABLE'},503);
 }
 // Workspace IDs come only from the authenticated, RLS-filtered task result.
 const waitingWorkspaces=[...new Set((data||[]).filter(task=>task.status==='queued').map(task=>task.workspace_id))];
 const budgets=waitingWorkspaces.length?await adminClient().from('studio_generation_limits').select('workspace_id,day,attempts').in('workspace_id',waitingWorkspaces):null;
 const now=new Date();
 const waits=new Map((budgets?.data||[]).map(limit=>[limit.workspace_id,dailyLimitWait(limit,now)]));
 const projectIds=[...new Set((data||[]).map(task=>task.project_id))];
 const projects=projectIds.length?await client.from('studio_projects').select('id,name').in('id',projectIds):null;
 if(projects?.error) console.error('Studio task project names failed:',projects.error.code,projects.error.message);
 const names=new Map((projects?.data||[]).map(project=>[project.id,project.name]));
 const taskIds=(data||[]).map(task=>task.id);
 const parentRuns=new Map((data||[]).filter(task=>!task.parent_task_id).map(task=>[task.id,task.delegation_id]));
 const legacy=taskIds.length?await client.from('studio_task_subtasks')
  .select('id,parent_task_id,project_id,agent_role,instruction,status,summary,error,created_at,updated_at')
  .in('parent_task_id',taskIds).order('created_at',{ascending:false}).limit(300):null;
 if(legacy?.error && legacy.error.code!=='PGRST205') console.error('Legacy subtask query failed:',legacy.error.code,legacy.error.message);
 const activity=taskIds.length?await client.from('studio_task_events').select('id,task_id,kind,speaker_role,recipient_role,body,created_at').in('task_id',taskIds).order('id',{ascending:false}).limit(300):null;
 if(activity?.error && activity.error.code!=='PGRST205') console.error('Studio task activity failed:',activity.error.code,activity.error.message);
 const legacyParentIds=new Set((legacy?.data||[]).map(task=>task.parent_task_id));
 const conversationOnlyReplies=new Set((data||[]).filter(task=>!task.parent_task_id&&task.task_kind==='dispatch'&&task.status==='done'
  &&!(data||[]).some(child=>child.parent_task_id===task.id)&&!legacyParentIds.has(task.id)).map(task=>task.id));
 return json({
  nextOffset:rows&&rows.length>100?offset+100:null,
  tasks:taskReviewStatuses([
   ...(data||[]).filter(task=>!conversationOnlyReplies.has(task.id)&&(!task.parent_task_id||!parentRuns.has(task.parent_task_id)||parentRuns.get(task.parent_task_id)===task.delegation_id))
    .map(task=>({...task,kind:task.parent_task_id?'subtask':'task',wait:task.status==='queued'?waits.get(task.workspace_id)||null:null,project_name:names.get(task.project_id)||'Project'})),
   ...(legacy?.data||[]).filter(task=>parentRuns.get(task.parent_task_id)==null)
    .map(task=>({...task,kind:'subtask',wait:null,source_note_id:null,result_version_id:null,project_name:names.get(task.project_id)||'Project'})),
  ]).map(task=>({...task,...taskDisplay(task)})).sort((a,b)=>b.created_at.localeCompare(a.created_at)),
  events:(activity?.data||[]).reverse(),
  activityAvailable:!activity?.error,
  subtasksAvailable:!legacy?.error,
 });
}
export async function PATCH(request:Request) {
 if(request.headers.get('origin')!==new URL(process.env.STUDIO_APP_URL||request.url).origin) return json({error:'Use your GuildOS studio to update tasks.'},403);
 if(!authConfig()) return json({error:'Studio access is not configured.'},503);
 const client=await sessionClient();
 const {data:{user}}=await studioUser(client);
 if(!user) return json({error:'Your session expired. Sign in again.'},401);
 let body;
 try {body=await readCommitBody(request);} catch{return json({error:'Invalid task action.'},400);}
 if(!body || typeof body.taskId!=='string'||!uuid.test(body.taskId)||typeof body.action!=='string'||!['cancel','retry','approve'].includes(body.action)) return json({error:'Invalid task action.'},400);
 if(body.action==='approve') {
  const {data:task,error:taskError}=await client.from('studio_tasks').select('id,parent_task_id,project_id,workspace_id,instruction,status,created_at,updated_at').eq('id',body.taskId).maybeSingle();
  if(taskError)return json({error:'The task could not be checked.'},503);
  if(!task)return json({error:'Task not found.'},404);
  const {data:followups,error:followupError}=await client.from('studio_tasks').select('id,parent_task_id,project_id,instruction,status,created_at,updated_at').eq('workspace_id',task.workspace_id).eq('project_id',task.project_id).gte('created_at',task.updated_at||task.created_at).order('created_at',{ascending:false}).limit(100);
  if(followupError)return json({error:'The task could not be checked.'},503);
  if(taskReviewStatuses([task,...(followups||[]).filter(item=>item.id!==task.id)])[0].status==='changes_requested')return json({error:'Changes have already been requested. Review the next revision when it is ready.'},409);
 }
 const {data,error}=await adminClient().rpc('control_studio_task',{p_task:body.taskId,p_actor:user.id,p_action:body.action});
 if(error||!data) return json({error:'The task could not be updated.'},503);
 if(data.status==='not_found') return json({error:'Task not found.'},404);
 if(data.status==='invalid_transition') return json({error:'The task changed. Refresh and try again.'},409);
 return json({ok:true});
}

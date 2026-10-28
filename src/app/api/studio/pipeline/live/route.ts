import { pipelineRoles } from '@/lib/studio/agents/pipeline';
import { isCanvas } from '@/lib/studio/canvas';
import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { privateJson as json, uuid } from '@/lib/studio/version-commit';

export const runtime = 'nodejs';

/** Returns only the authenticated project's current private generation checkpoint. */
export async function GET(request: Request) {
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await client.auth.getUser();
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 const projectId = new URL(request.url).searchParams.get('projectId');
 if (!projectId || !uuid.test(projectId)) return json({ error: 'Invalid project.' }, 400);

 // Resolve tenant scope through the caller's RLS session before using service credentials.
 const { data: project, error: projectError } = await client.from('studio_projects')
  .select('id,workspace_id').eq('id', projectId).maybeSingle();
 if (projectError) return json({ error: 'The project could not be checked.' }, 503);
 if (!project) return json({ error: 'Project not found.' }, 404);

 const { data: tasks, error: taskError } = await client.from('studio_tasks')
  .select('id,status').eq('project_id', project.id).in('status', ['queued', 'running'])
  .is('parent_task_id', null).order('updated_at', { ascending: false }).limit(20);
 if (taskError) return json({ error: 'Live agent work could not be loaded.' }, 503);
 const taskIds = (tasks || []).map(task => task.id);
 if (!taskIds.length) return json({ preview: null });

 const { data: rows, error } = await adminClient().from('studio_pipeline_drafts')
  .select('task_id,state,updated_at').eq('project_id', project.id).eq('workspace_id', project.workspace_id)
  .in('task_id', taskIds).order('updated_at', { ascending: false }).limit(1);
 if (error) {
  console.error('Live pipeline preview query failed:', error.code, error.message);
  return json({ error: 'The live canvas preview is temporarily unavailable.' }, 503);
 }
 const row = rows?.[0];
 const state = row?.state as { document?: unknown; stage?: number; targetScreenId?: string; focusNodeIds?: unknown } | undefined;
 if (!row || !state || !Number.isInteger(state.stage) || state.stage! < 0 || state.stage! > 4) return json({ preview: null });
 const document = state.document;
 if (!isCanvas(document)) return json({ preview: null });
 const taskStatus = tasks?.find(task => task.id === row.task_id)?.status;
 if (taskStatus !== 'queued' && taskStatus !== 'running') return json({ preview: null });
 const since = new URL(request.url).searchParams.get('since');
 const sinceStatus = new URL(request.url).searchParams.get('sinceStatus');
 if (since === row.updated_at && sinceStatus === taskStatus) return json({ unchanged: true });
 const role = pipelineRoles[state.stage!];
 const nodeIds = Array.isArray(state.focusNodeIds)
  ? state.focusNodeIds.filter((id): id is string => typeof id === 'string' && document.nodes.some(node => node.id === id)).slice(0, 3)
  : [];
 return json({ preview: {
  taskId: row.task_id, updatedAt: row.updated_at, status: taskStatus, document, targetScreenId: state.targetScreenId,
  stage: state.stage! + 1, role, nodeIds: nodeIds.length ? nodeIds : [state.targetScreenId].filter((id): id is string => typeof id === 'string' && document.nodes.some(node => node.id === id)),
 } });
}

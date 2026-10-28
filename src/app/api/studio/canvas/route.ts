import { studioUser } from '@/lib/studio/supabase';
import { authConfig, sessionClient } from '@/lib/studio/supabase';
import { blankCanvas } from '@/lib/studio/canvas';
import { privateJson as json, uuid } from '@/lib/studio/version-commit';

export const runtime = 'nodejs';
export async function GET(request: Request) {
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await studioUser(client);
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 const projectId = new URL(request.url).searchParams.get('projectId');
 if (!projectId || !uuid.test(projectId)) return json({ error: 'Invalid project.' }, 400);
 const { data: project } = await client.from('studio_projects').select('id,workspace_id').eq('id', projectId).single();
 if (!project) return json({ error: 'Project not found.' }, 404);
 const { data, error } = await client.from('studio_versions').select('id,document,feedback,created_at,model,input_tokens,output_tokens').eq('project_id', project.id).eq('workspace_id', project.workspace_id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
 if (error) return json({ error: 'The current design could not be loaded.' }, 503);
 return json({ version: data || null, projectId, versionId: data?.id || null, document: data?.document || blankCanvas() });
}

import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';

export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function PATCH(request: Request) {
 const origin = request.headers.get('origin');
 const expectedOrigin = new URL(request.url).origin;
 if (!origin || origin !== expectedOrigin) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await client.auth.getUser();
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 let body: { projectId?: unknown; name?: unknown };
 try { body = await request.json(); } catch { return json({ error: 'Invalid project name.' }, 400); }
 if (!body || typeof body.projectId !== 'string' || !uuid.test(body.projectId) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) return json({ error: 'Enter a project name up to 100 characters.' }, 400);
 const { data: workspace, error: workspaceError } = await client.from('studio_workspaces').select('id').eq('owner_id', user.id).single();
 if (workspaceError || !workspace) return json({ error: 'Project not found.' }, 404);
 const { data: project, error } = await adminClient().from('studio_projects').update({ name: body.name.trim() }).eq('id', body.projectId).eq('workspace_id', workspace.id).select('id,name').maybeSingle();
 if (error) return json({ error: 'Project name could not be saved.' }, 503);
 if (!project) return json({ error: 'Project not found.' }, 404);
 return json({ project });
}

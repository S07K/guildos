import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { agentRoles } from '@/lib/studio/agent-roles';

export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const anchors = ['page', 'header', 'hero', 'features', 'closing', 'footer'];
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function projectFor(client: Awaited<ReturnType<typeof sessionClient>>, id: string) {
 const { data } = await client.from('studio_projects').select('id,workspace_id').eq('id', id).single();
 return data;
}

export async function GET(request: Request) {
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await client.auth.getUser();
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 const projectId = new URL(request.url).searchParams.get('projectId');
 if (!projectId || !uuid.test(projectId) || !await projectFor(client, projectId)) return json({ error: 'Project not found.' }, 404);
 const { data, error } = await client.from('studio_agent_notes').select('*').eq('project_id', projectId).order('created_at', { ascending: true }).limit(200);
 if (error) return json({ error: 'The guild discussion could not be loaded. Apply the latest Supabase migration.' }, 503);
 return json({ notes: data || [] });
}

export async function POST(request: Request) {
 const origin = request.headers.get('origin');
 const expected = process.env.STUDIO_APP_URL || new URL(request.url).origin;
 if (!origin || origin !== new URL(expected).origin) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await client.auth.getUser();
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 let body: { projectId?: unknown; versionId?: unknown; anchor?: unknown; mentionedRole?: unknown; text?: unknown };
 try {
  const raw = await request.text();
  if (raw.length > 5000) return json({ error: 'Comment is too long.' }, 413);
  body = JSON.parse(raw);
 } catch { return json({ error: 'Invalid comment.' }, 400); }
 if (!body || typeof body.projectId !== 'string' || !uuid.test(body.projectId) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000 || !anchors.includes(String(body.anchor)) || (body.mentionedRole !== null && body.mentionedRole !== undefined && !agentRoles.includes(body.mentionedRole as typeof agentRoles[number])) || (body.versionId && (typeof body.versionId !== 'string' || !uuid.test(body.versionId)))) return json({ error: 'Invalid comment.' }, 400);
 const project = await projectFor(client, body.projectId);
 if (!project) return json({ error: 'Project not found.' }, 404);
 if (body.versionId) {
  const { data: version } = await client.from('studio_versions').select('id').eq('id', body.versionId).eq('project_id', project.id).eq('workspace_id', project.workspace_id).single();
  if (!version) return json({ error: 'Version not found.' }, 404);
 }
 const { data, error } = await adminClient().from('studio_agent_notes').insert({ project_id: project.id, workspace_id: project.workspace_id, version_id: body.versionId || null, author_role: 'human', mentioned_role: body.mentionedRole || null, anchor: body.anchor, body: body.text.trim() }).select('*').single();
 if (error || !data) return json({ error: 'Comment could not be saved. Apply the latest Supabase migration.' }, 503);
 return json({ note: data }, 201);
}

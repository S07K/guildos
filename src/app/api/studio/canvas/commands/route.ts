import { studioUser } from '@/lib/studio/supabase';
import { authConfig, sessionClient } from '@/lib/studio/supabase';
import { blankCanvas, isCanvas } from '@/lib/studio/canvas';
import { applyCanvasCommands } from '@/lib/studio/canvas-commands';
import { commitVersion, privateJson as json, readCommitBody, revision, uuid } from '@/lib/studio/version-commit';

export const runtime = 'nodejs';
export async function POST(request: Request) {
 const origin = request.headers.get('origin');
 if (!origin || origin !== new URL(process.env.STUDIO_APP_URL || request.url).origin) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await studioUser(client);
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 let body;
 try { body = await readCommitBody(request); }
 catch { return json({ error: 'Invalid commands or request exceeds 256 KB.' }, 400); }
 if (typeof body.projectId !== 'string' || !uuid.test(body.projectId) || typeof body.requestId !== 'string' || !uuid.test(body.requestId) || !revision(body.expectedVersionId)) return json({ error: 'Provide project, expected version, and request ID.' }, 400);
 const { data: project } = await client.from('studio_projects').select('id,workspace_id').eq('id', body.projectId).single();
 if (!project) return json({ error: 'Project not found.' }, 404);
 let base = blankCanvas();
 if (body.expectedVersionId) {
  const { data: version } = await client.from('studio_versions').select('document').eq('id', body.expectedVersionId).eq('project_id', project.id).eq('workspace_id', project.workspace_id).single();
  if (!version) return json({ error: 'Version not found.' }, 404);
  if (!isCanvas(version.document)) return json({ error: 'Commands require a canvas document.' }, 400);
  base = version.document;
 }
 let document;
 try { document = applyCanvasCommands(base, body.commands); }
 catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid commands.' }, 400); }
 const result = await commitVersion({ projectId: project.id, workspaceId: project.workspace_id, actorId: user.id,
  requestId: body.requestId, expectedVersionId: body.expectedVersionId, parentVersionId: body.expectedVersionId,
  document, feedback: 'Canvas commands', operations: body.commands as unknown[],
 });
 if (result.response) return result.response;
 return json({ version: result.version, replayed: result.replayed }, result.replayed ? 200 : 201);
}

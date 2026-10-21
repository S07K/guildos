import { authConfig, sessionClient } from '@/lib/studio/supabase';
import { validateDesign } from '@/lib/studio/design.mjs';
import { isCanvas, validateCanvas } from '@/lib/studio/canvas';
import { commitVersion, privateJson as json, readCommitBody, revision, uuid } from '@/lib/studio/version-commit';

export const runtime = 'nodejs';
export async function POST(request: Request) {
 const origin = request.headers.get('origin');
 const expected = process.env.STUDIO_APP_URL || new URL(request.url).origin;
 if (!origin || origin !== new URL(expected).origin) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await client.auth.getUser();
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 let body;
 try { body = await readCommitBody(request); }
 catch { return json({ error: 'Invalid design data or request exceeds 256 KB.' }, 400); }
 if (typeof body.projectId !== 'string' || !uuid.test(body.projectId) || !revision(body.expectedVersionId) || !revision(body.parentVersionId) || typeof body.requestId !== 'string' || !uuid.test(body.requestId) || (body.feedback !== undefined && (typeof body.feedback !== 'string' || body.feedback.length > 4000))) return json({ error: 'Provide project, parent, expected version, and request ID.' }, 400);
 let document;
 try { document = isCanvas(body.document) ? validateCanvas(body.document) : validateDesign(body.document); }
 catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid design data.' }, 400); }
 const { data: project } = await client.from('studio_projects').select('id,workspace_id').eq('id', body.projectId).single();
 if (!project) return json({ error: 'Project not found.' }, 404);
 const result = await commitVersion({ projectId: project.id, workspaceId: project.workspace_id, actorId: user.id,
  requestId: body.requestId, expectedVersionId: body.expectedVersionId, parentVersionId: body.parentVersionId,
  document, feedback: typeof body.feedback === 'string' ? body.feedback : 'Manual edits',
 });
 if (result.response) return result.response;
 return json({ version: result.version, replayed: result.replayed }, result.replayed ? 200 : 201);
}

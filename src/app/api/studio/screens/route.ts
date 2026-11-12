import { studioUser } from '@/lib/studio/supabase';
import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { cleanHtmlScreen, MAX_SCREEN_SECTIONS, MAX_SECTION_HTML_BYTES } from '@/lib/studio/html-screen';
import { loadBoard } from '@/lib/studio/screens';
import { privateJson as json, readCommitBody, revision, uuid } from '@/lib/studio/version-commit';

export const runtime = 'nodejs';

/** The caller's session and the project it may read (RLS), before any service-role write. */
async function scope(projectId: unknown) {
 if (!authConfig()) return { response: json({ error: 'Studio access is not configured.' }, 503) };
 const client = await sessionClient();
 const { data: { user } } = await studioUser(client);
 if (!user) return { response: json({ error: 'Your session expired. Sign in again.' }, 401) };
 if (typeof projectId !== 'string' || !uuid.test(projectId)) return { response: json({ error: 'Invalid project.' }, 400) };
 const { data: project, error } = await client.from('studio_projects').select('id,workspace_id').eq('id', projectId).maybeSingle();
 if (error) return { response: json({ error: 'The project could not be checked.' }, 503) };
 if (!project) return { response: json({ error: 'Project not found.' }, 404) };
 return { client, user, project };
}
const fromStudio = (request: Request) => request.headers.get('origin') === new URL(process.env.STUDIO_APP_URL || request.url).origin;

/** The project's board: every live screen with its head version. */
export async function GET(request: Request) {
 const checked = await scope(new URL(request.url).searchParams.get('projectId'));
 if (checked.response) return checked.response;
 try { return json({ screens: await loadBoard(checked.client, checked.project.id) }); }
 catch (error) { return json({ error: error instanceof Error ? error.message : 'The board could not be loaded.' }, 503); }
}

/** Saves a screen version from the manual editor (or creates a screen when screenId is null). */
export async function POST(request: Request) {
 if (!fromStudio(request)) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 let body: Record<string, unknown>;
 try { body = await readCommitBody(request, MAX_SCREEN_SECTIONS * MAX_SECTION_HTML_BYTES + 65536); }
 catch { return json({ error: 'Invalid screen data or the request is too large.' }, 400); }
 const checked = await scope(body.projectId);
 if (checked.response) return checked.response;
 if ((body.screenId !== null && (typeof body.screenId !== 'string' || !uuid.test(body.screenId))) || !revision(body.expectedVersionId) || typeof body.requestId !== 'string' || !uuid.test(body.requestId) || (body.feedback !== undefined && (typeof body.feedback !== 'string' || body.feedback.length > 4000)))
  return json({ error: 'Provide the screen, expected version and request ID.' }, 400);
 let document;
 try { document = cleanHtmlScreen(body.document); } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid screen.' }, 400); }
 const { data, error } = await adminClient().rpc('commit_studio_screen', {
  p_project: checked.project.id, p_workspace: checked.project.workspace_id, p_actor: checked.user.id, p_request_id: body.requestId,
  p_screen: body.screenId, p_expected: body.expectedVersionId, p_document: document, p_feedback: typeof body.feedback === 'string' ? body.feedback : 'Manual edits',
  p_model: 'manual-edit', p_input: 0, p_output: 0, p_x: null, p_y: null,
 });
 if (error || !data) return json({ error: 'Your edits could not be saved. Your local changes are still here; please retry.' }, 503);
 if (data.status === 'conflict') return json({ error: 'A newer version of this screen was saved. Reopen the screen to work from the latest version.', code: 'revision_conflict', currentVersionId: data.currentVersionId }, 409);
 if (data.status === 'idempotency_conflict') return json({ error: 'This request ID was already used for different edits.', code: 'idempotency_conflict' }, 409);
 if (data.status === 'not_found') return json({ error: 'Screen not found.' }, 404);
 return json({ screen: data.screen, version: data.version, replayed: data.status === 'replayed' }, data.status === 'replayed' ? 200 : 201);
}

/** Moves, renames or removes a screen on the board. */
export async function PATCH(request: Request) {
 if (!fromStudio(request)) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 let body: Record<string, unknown>;
 try { body = await readCommitBody(request, 4096); } catch { return json({ error: 'Invalid request.' }, 400); }
 const checked = await scope(body.projectId);
 if (checked.response) return checked.response;
 if (typeof body.screenId !== 'string' || !uuid.test(body.screenId)) return json({ error: 'Invalid screen.' }, 400);
 const change: Record<string, unknown> = { updated_at: new Date().toISOString() };
 for (const axis of ['x', 'y'] as const) if (body[axis] !== undefined) {
  if (!Number.isInteger(body[axis]) || Math.abs(body[axis] as number) > 200000) return json({ error: 'Invalid position.' }, 400);
  change[axis] = body[axis];
 }
 if (body.name !== undefined) { if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80) return json({ error: 'Names are 1–80 characters.' }, 400); change.name = body.name.trim(); }
 if (body.remove === true) change.deleted_at = new Date().toISOString();
 if (Object.keys(change).length === 1) return json({ error: 'Nothing to change.' }, 400);
 const { data, error } = await adminClient().from('studio_screens').update(change).eq('id', body.screenId).eq('project_id', checked.project.id).eq('workspace_id', checked.project.workspace_id).is('deleted_at', null).select('id,name,device,x,y,head_version_id,updated_at').maybeSingle();
 if (error) return json({ error: 'The screen could not be updated.' }, 503);
 if (!data) return json({ error: 'Screen not found.' }, 404);
 return json({ screen: data });
}

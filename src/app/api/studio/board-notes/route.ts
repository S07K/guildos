import { studioUser } from '@/lib/studio/supabase';
import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { privateJson as json, readCommitBody, uuid } from '@/lib/studio/version-commit';
import { isNoteColor } from '@/lib/studio/board-notes';

export const runtime = 'nodejs';
const columns = 'id,body,color,x,y,width,created_at,updated_at';

/** The caller's session and a project it can read (RLS) before any service-role write. */
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
/** Validated note fields from a request body (only the ones present). */
function fields(body: Record<string, unknown>): Record<string, unknown> | string {
 const change: Record<string, unknown> = {};
 if (body.body !== undefined) { if (typeof body.body !== 'string' || body.body.length > 2000) return 'Notes are up to 2,000 characters.'; change.body = body.body; }
 if (body.color !== undefined) { if (!isNoteColor(body.color)) return 'Unknown note colour.'; change.color = body.color; }
 for (const axis of ['x', 'y'] as const) if (body[axis] !== undefined) { if (!Number.isInteger(body[axis]) || Math.abs(body[axis] as number) > 200000) return 'Invalid position.'; change[axis] = body[axis]; }
 if (body.width !== undefined) { if (!Number.isInteger(body.width) || (body.width as number) < 160 || (body.width as number) > 640) return 'Invalid width.'; change.width = body.width; }
 return change;
}

/** The board's notes. */
export async function GET(request: Request) {
 const checked = await scope(new URL(request.url).searchParams.get('projectId'));
 if (checked.response) return checked.response;
 const { data, error } = await checked.client.from('studio_board_notes').select(columns).eq('project_id', checked.project.id).is('deleted_at', null).order('created_at', { ascending: true });
 if (error) return json({ error: ['PGRST205', '42P01'].includes(error.code) ? 'Notes need the latest database migration.' : 'Notes could not be loaded.' }, 503);
 return json({ notes: data || [] });
}

/** Adds a note at a board position. */
export async function POST(request: Request) {
 let body: Record<string, unknown>;
 try { body = await readCommitBody(request, 8192); } catch { return json({ error: 'Invalid note.' }, 400); }
 const checked = await scope(body.projectId);
 if (checked.response) return checked.response;
 const change = fields(body);
 if (typeof change === 'string') return json({ error: change }, 400);
 const { data, error } = await adminClient().from('studio_board_notes').insert({ ...change, project_id: checked.project.id, workspace_id: checked.project.workspace_id, created_by: checked.user.id }).select(columns).single();
 if (error || !data) return json({ error: 'The note could not be added.' }, 503);
 return json({ note: data }, 201);
}

/** Edits, moves, recolours or removes a note. */
export async function PATCH(request: Request) {
 let body: Record<string, unknown>;
 try { body = await readCommitBody(request, 8192); } catch { return json({ error: 'Invalid note.' }, 400); }
 const checked = await scope(body.projectId);
 if (checked.response) return checked.response;
 if (typeof body.noteId !== 'string' || !uuid.test(body.noteId)) return json({ error: 'Invalid note.' }, 400);
 const change = fields(body);
 if (typeof change === 'string') return json({ error: change }, 400);
 if (body.remove === true) change.deleted_at = new Date().toISOString();
 if (!Object.keys(change).length) return json({ error: 'Nothing to change.' }, 400);
 const { data, error } = await adminClient().from('studio_board_notes').update({ ...change, updated_at: new Date().toISOString() }).eq('id', body.noteId).eq('project_id', checked.project.id).eq('workspace_id', checked.project.workspace_id).is('deleted_at', null).select(columns).maybeSingle();
 if (error) return json({ error: 'The note could not be saved.' }, 503);
 if (!data) return json({ error: 'Note not found.' }, 404);
 return json({ note: data });
}

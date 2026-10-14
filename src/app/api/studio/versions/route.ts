import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { validateDesign } from '@/lib/studio/design.mjs';
import { isCanvas, validateCanvas } from '@/lib/studio/canvas';

export const runtime = 'nodejs';
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
 const origin = request.headers.get('origin');
 const expected = process.env.STUDIO_APP_URL || new URL(request.url).origin;
 if (!origin || origin !== new URL(expected).origin) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await client.auth.getUser();
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 const length = Number(request.headers.get('content-length') || 0);
 if (length > 30000) return json({ error: 'The design is too large to save.' }, 413);
 let body: { projectId?: unknown; document?: unknown; parentVersionId?: unknown; feedback?: unknown };
 try {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 30000) { await reader.cancel(); return json({ error: 'The design is too large to save.' }, 413); } chunks.push(value); }
  body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
 } catch { return json({ error: 'Invalid design data.' }, 400); }
 if (!body || typeof body.projectId !== 'string' || !uuid.test(body.projectId) || (body.parentVersionId !== undefined && (typeof body.parentVersionId !== 'string' || !uuid.test(body.parentVersionId))) || (body.feedback !== undefined && (typeof body.feedback !== 'string' || body.feedback.length > 4000))) return json({ error: 'Invalid design data.' }, 400);
 let document: Record<string, unknown>;
 try { document = (isCanvas(body.document) ? validateCanvas(body.document) : validateDesign(body.document)) as Record<string, unknown>; } catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid design data.' }, 400); }
 const { data: project } = await client.from('studio_projects').select('id, workspace_id').eq('id', body.projectId).single();
 if (!project) return json({ error: 'Project not found.' }, 404);
 if (body.parentVersionId) {
  const { data: parent } = await client.from('studio_versions').select('id').eq('id', body.parentVersionId).eq('project_id', project.id).eq('workspace_id', project.workspace_id).single();
  if (!parent) return json({ error: 'The version you edited no longer exists.' }, 404);
 }
 const admin = adminClient();
 const { data: version, error } = await admin.from('studio_versions').insert({
  project_id: project.id,
  workspace_id: project.workspace_id,
  parent_version_id: body.parentVersionId || null,
  document,
  feedback: typeof body.feedback === 'string' ? body.feedback : 'Manual edits',
  model: 'manual-edit',
  input_tokens: 0,
  output_tokens: 0,
 }).select('*').single();
 if (error || !version) return json({ error: 'Your edits could not be saved. Please try again.' }, 503);
 return json({ version }, 201);
}

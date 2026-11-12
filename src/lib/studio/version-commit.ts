import 'server-only';
import { adminClient } from './supabase';
import { isCanvas } from './canvas';
import { isKnownIcon } from './icon-library';

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const revision = (value: unknown): value is string | null => value === null || (typeof value === 'string' && uuid.test(value));
export const privateJson = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function readCommitBody(request: Request, maxBytes = 262144): Promise<Record<string, unknown>> {
 const reader = request.body?.getReader();
 if (!reader) throw new Error('Missing request body.');
 const chunks: Uint8Array[] = []; let size = 0;
 while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  size += value.byteLength;
  if (size > maxBytes) { await reader.cancel(); throw new Error(`Request exceeds ${Math.round(maxBytes / 1024)} KB.`); }
  chunks.push(value);
 }
 const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request body.');
 return body;
}
export async function commitVersion(input: {
 projectId: string; workspaceId: string; actorId: string; requestId: string;
 expectedVersionId: string | null; parentVersionId: string | null;
 document: object; feedback: string; model?: string; inputTokens?: number; outputTokens?: number; operations?: unknown[];
}) {
 if (isCanvas(input.document) && Array.isArray(input.document.nodes) && input.document.nodes.some(node => node.type === 'icon' && !isKnownIcon(node.iconName)))
  return { response: privateJson({ error: 'Use an icon from the Lucide library.' }, 400) };
 const { data, error } = await adminClient().rpc('commit_studio_version', {
  p_project: input.projectId, p_workspace: input.workspaceId, p_actor: input.actorId,
  p_request_id: input.requestId, p_expected: input.expectedVersionId, p_parent: input.parentVersionId,
  p_document: input.document, p_feedback: input.feedback, p_model: input.model || 'manual-edit',
  p_input: input.inputTokens || 0, p_output: input.outputTokens || 0, p_operations: input.operations || [],
 });
 if (error || !data) return { response: privateJson({ error: 'Your edits could not be saved. Your local changes are still here; please retry.' }, 503) };
 if (data.status === 'conflict') return { response: privateJson({ error: 'A newer version was saved. Your local edits are still here. Open the latest version in another tab to compare before reloading.', code: 'revision_conflict', currentVersionId: data.currentVersionId }, 409) };
 if (data.status === 'idempotency_conflict') return { response: privateJson({ error: 'This request ID was already used for different edits.', code: 'idempotency_conflict' }, 409) };
 if (data.status === 'not_found' || data.status === 'invalid_parent') return { response: privateJson({ error: 'Project or parent version not found.' }, 404) };
 if (!['committed','replayed'].includes(data.status) || !data.version?.id) return { response: privateJson({ error: 'The save returned an invalid result.' }, 503) };
 return { version: data.version, replayed: data.status === 'replayed' };
}

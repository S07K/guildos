import { studioUser } from '@/lib/studio/supabase';
import { taskDisplay } from '@/lib/studio/task-display';
import { scheduleWorker } from '@/lib/studio/worker-trigger';
import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { agentIdentity, agentRoles } from '@/lib/studio/agent-roles';
import { encodeLayerReference } from '@/lib/studio/revision-scope';
import { encodeDeviceVersion, encodeScreenScope, encodeScreenTarget, encodeNewScreenDevice, encodeReferences, encodeRegenerate, encodeVariation, isScreenScope, MAX_REFERENCES, MAX_VARIATIONS, parseReferences, stripScreenScope } from '@/lib/studio/html-screen';

export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const anchors = ['page', 'header', 'hero', 'features', 'closing', 'footer'];
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function projectFor(client: Awaited<ReturnType<typeof sessionClient>>, id: string) {
 // Use the same RLS-protected project lookup as the editor page so all owned
 // workspaces are handled consistently without a separate workspace assumption.
 const { data } = await client.from('studio_projects').select('id,workspace_id').eq('id', id).maybeSingle();
 return data;
}

export async function GET(request: Request) {
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await studioUser(client);
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 const projectId = new URL(request.url).searchParams.get('projectId');
 if (!projectId || !uuid.test(projectId)) return json({ error: 'Invalid project.' }, 400);
 // The notes query is already constrained by workspace RLS. Avoid a separate
 // project lookup here; it can disagree with the editor's project access and
 // incorrectly show "Project not found" just from opening the conversation.
 const { data, error } = await client.from('studio_agent_notes').select('*').eq('project_id', projectId).order('created_at', { ascending: true }).limit(200);
 if (error) return json({ error: 'The guild discussion could not be loaded. Apply the latest Supabase migration.' }, 503);
 const { data: tasks } = await client.from('studio_tasks').select('id,summary,source_note_id,instruction').eq('project_id', projectId);
 const taskIds = (tasks || []).map(task => task.id);
 const { data: events } = taskIds.length
  ? await client.from('studio_task_events').select('id,task_id,kind,speaker_role,body,created_at').in('task_id', taskIds).order('id', { ascending: false }).limit(300)
  : { data: [] };
 const conversationEvents = [...(events || [])].reverse().filter(event => event.speaker_role && (
  event.kind === 'result' || event.kind === 'error' || event.kind === 'status' && (event.body.startsWith('Working on: ') || /^Stage \d\/5 · /.test(event.body))
 ));
 const latestTaskSpeaker = new Map<string, string>();
 for (const event of conversationEvents) latestTaskSpeaker.set(event.task_id, event.speaker_role!);
 const savedNotes = (data || []).map(note => {
  const sourceTask = (tasks || []).find(item => item.source_note_id === note.id);
  const legacy = sourceTask && sourceTask.instruction === note.body && /^Revise the completed work for:/.test(note.body) && note.body.includes('Requested changes:');
  const legacyBody = legacy ? note.body.split('Requested changes:').at(-1)!.trim() : note.body;
  const displayContent = sourceTask && sourceTask.instruction === note.body ? stripScreenScope(legacyBody.replace(/\n?\u2063guildos-layer:[a-z0-9-]{1,80}\u2063/g,'')) : legacyBody;
  const task = (tasks || []).find(item => item.summary && item.summary === note.body);
  const speaker = task ? latestTaskSpeaker.get(task.id) : undefined;
  // Reference images attached to the request, shown as thumbnails on the message.
  const references = sourceTask ? parseReferences(sourceTask.instruction) : [];
  return speaker && agentRoles.includes(speaker as typeof agentRoles[number]) ? { ...note, author_role: speaker } : { ...note, displayContent, ...(references.length ? { references } : {}) };
 });
 const progressNotes = conversationEvents.filter(event => event.speaker_role && !(event.kind === 'error' && (tasks || []).some(task => task.id === event.task_id && task.summary === event.body)) && (
  event.kind === 'result' || event.kind === 'error' || event.kind === 'status' && (event.body.startsWith('Working on: ') || /^Stage \d\/5 · /.test(event.body))
 )).map(event => ({
  id: `event-${event.id}`, version_id: null, author_role: event.speaker_role, mentioned_role: null,
  anchor: 'page', body: event.kind === 'status' && event.body.startsWith('Stage ')
   ? `Working on: ${agentIdentity[event.speaker_role as keyof typeof agentIdentity].action}.` : event.body,
  created_at: event.created_at,
 }));
 return json({ notes: [...savedNotes, ...progressNotes].filter(note=>!(note.id.startsWith('event-')&&note.body==='The complete screen is ready for review.')).sort((a,b) => a.created_at.localeCompare(b.created_at)) });
}

/** Appends an invisible scope marker (layer or screen section) that the worker reads; the text stays within 2000 characters. */
const withMarker = (text: string, marker: string) => marker ? `${text.slice(0, 2000 - marker.length - 1)}\n${marker}` : text;

export async function POST(request: Request) {
 const origin = request.headers.get('origin');
 const expected = process.env.STUDIO_APP_URL || new URL(request.url).origin;
 if (!origin || origin !== new URL(expected).origin) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await studioUser(client);
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 let body: { projectId?: unknown; versionId?: unknown; anchor?: unknown; mentionedRole?: unknown; targetLayerId?:unknown; screenScope?: unknown; screenId?: unknown; deviceVersion?: unknown; variation?: unknown; regenerate?: unknown; device?: unknown; references?: unknown; text?: unknown; displayMessage?: unknown; requestId?: unknown };
 try {
  const raw = await request.text();
  if (raw.length > 16000) return json({ error: 'Comment is too long.' }, 413);
  body = JSON.parse(raw);
 } catch { return json({ error: 'Invalid comment.' }, 400); }
 if (!body || typeof body.displayMessage !== 'string' || !body.displayMessage.trim() || body.displayMessage.length > 2000 || typeof body.requestId !== 'string' || !uuid.test(body.requestId) || typeof body.projectId !== 'string' || !uuid.test(body.projectId) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000 || (body.screenScope !== undefined && !isScreenScope(body.screenScope)) || (body.screenId !== undefined && (typeof body.screenId !== 'string' || !uuid.test(body.screenId))) || (body.deviceVersion !== undefined && !['mobile', 'tablet', 'desktop'].includes(String(body.deviceVersion))) || (body.variation !== undefined && (!Number.isInteger(body.variation) || (body.variation as number) < 1 || (body.variation as number) > MAX_VARIATIONS)) || (body.regenerate !== undefined && body.regenerate !== true) || (body.device !== undefined && (body.screenId !== undefined || !['mobile', 'tablet', 'desktop'].includes(String(body.device)))) || (body.references !== undefined && (!Array.isArray(body.references) || body.references.length > MAX_REFERENCES || !body.references.every(id => typeof id === 'string' && uuid.test(id)))) || ([body.screenScope, body.deviceVersion, body.variation, body.regenerate].filter(value => value !== undefined).length > 1) || ((body.screenScope !== undefined || body.deviceVersion !== undefined || body.variation !== undefined || body.regenerate !== undefined) && body.screenId === undefined) || body.targetLayerId!==undefined&&(typeof body.targetLayerId!=='string'||!/^[a-z0-9-]{1,80}$/i.test(body.targetLayerId)) || !anchors.includes(String(body.anchor)) || (body.mentionedRole !== null && body.mentionedRole !== undefined && !agentRoles.includes(body.mentionedRole as typeof agentRoles[number])) || (body.versionId && (typeof body.versionId !== 'string' || !uuid.test(body.versionId)))) return json({ error: 'Invalid comment.' }, 400);
 const project = await projectFor(client, body.projectId);
 if (!project) return json({ error: 'Project not found.' }, 404);
 if (body.versionId) {
  const { data: version } = await client.from('studio_versions').select('id').eq('id', body.versionId).eq('project_id', project.id).eq('workspace_id', project.workspace_id).single();
  if (!version) return json({ error: 'Version not found.' }, 404);
 }
 // A screen-scoped request must name a screen of this project (RLS-checked); none means "add a new screen".
 if (typeof body.screenId === 'string') {
  const { data: screen } = await client.from('studio_screens').select('id').eq('id', body.screenId).eq('project_id', project.id).maybeSingle();
  if (!screen) return json({ error: 'That screen is no longer on the board.' }, 404);
 }
 const references = encodeReferences(Array.isArray(body.references) ? body.references as string[] : []);
 const markers = (typeof body.screenId === 'string'
  ? encodeScreenTarget(body.screenId) + (isScreenScope(body.screenScope) ? encodeScreenScope(body.screenScope) : body.deviceVersion ? encodeDeviceVersion(body.deviceVersion as 'mobile') : typeof body.variation === 'number' ? encodeVariation(body.variation) : body.regenerate ? encodeRegenerate() : '')
  : typeof body.targetLayerId === 'string' ? encodeLayerReference(body.targetLayerId) : body.device ? encodeNewScreenDevice(body.device as 'mobile') : '') + references;
 const { data, error } = await adminClient().rpc('enqueue_studio_task', {
  p_project: project.id, p_actor: user.id, p_request: body.requestId,
  p_text: withMarker(body.text.trim(), markers), p_role: body.mentionedRole || 'creative_director', p_version: body.versionId || null, p_display: body.displayMessage,
 });
 if (error || !data) {
  if(error) console.error('Studio task enqueue failed:',error.code,error.message);
  return json({ error: ['PGRST202','42883','42P01'].includes(error?.code || '') ? 'Agent tasks need the latest database migration before messages can be sent.' : 'Your message could not be queued. Please retry.' }, 503);
 }
 if (data.status === 'not_found') return json({ error: 'Project or version not found.' }, 404);
 if (data.status === 'full') return json({ error: 'Your workspace has 20 pending tasks. Wait for work to finish or cancel a task.' }, 429);
 if (data.status === 'conflict') return json({ error: 'This message request was already used. Please send a new message.' }, 409);
 scheduleWorker();
 return json({ note: data.note, task: data.task ? {...data.task,...taskDisplay(data.task)} : data.task }, data.status === 'replayed' ? 200 : 201);
}

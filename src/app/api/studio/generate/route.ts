import { studioUser } from '@/lib/studio/supabase';
import { commitVersion, revision } from '@/lib/studio/version-commit';
import { randomUUID } from 'node:crypto';
import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { openKey } from '@/lib/studio/vault.mjs';
import { generateChatGPT } from '@/lib/studio/chatgpt';
import { runGuild, type AgentNote } from '@/lib/studio/guild';
import { withProviderFallback, preferredProvider, type ModelProvider } from '@/lib/studio/provider-fallback.ts';
import { hasChatGPTPlan } from '@/lib/studio/chatgpt-oauth';

export const runtime = 'nodejs';
export const maxDuration = 120;
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
 const origin = request.headers.get('origin');
 const expected = process.env.STUDIO_APP_URL || new URL(request.url).origin;
 if (!origin || origin !== new URL(expected).origin) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await studioUser(client);
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 let body;
 try {
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 20000) { await reader.cancel(); return json({ error: 'Feedback is too long.' }, 413); } chunks.push(value); }
  body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
 } catch { return json({ error: 'Invalid request.' }, 400); }
 if (!body || !revision(body.expectedVersionId) || typeof body.projectId !== 'string' || !uuid.test(body.projectId) || typeof body.feedback !== 'string' || body.feedback.length > 4000 || (body.versionId && (typeof body.versionId !== 'string' || !uuid.test(body.versionId)))) return json({ error: 'Invalid project or feedback.' }, 400);
 const { data: project } = await client.from('studio_projects').select('*').eq('id', body.projectId).single();
 if (!project) return json({ error: 'Project not found.' }, 404);
 const { data: head, error: headError } = await client.from('studio_versions').select('id').eq('project_id', project.id).eq('workspace_id', project.workspace_id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
 if (headError) return json({ error: 'The current design could not be loaded.' }, 503);
 if ((head?.id || null) !== body.expectedVersionId) return json({ error: 'A newer version was saved. Open it before generating again.', code: 'revision_conflict', currentVersionId: head?.id || null }, 409);
 let previous = null;
 if (body.versionId) {
  const { data } = await client.from('studio_versions').select('document').eq('id', body.versionId).eq('project_id', project.id).eq('workspace_id', project.workspace_id).single();
  if (!data) return json({ error: 'Version not found.' }, 404);
  previous = data.document;
  if (!body.feedback.trim()) return json({ error: 'Describe the changes you would like.' }, 400);
 }
 const admin = adminClient();
 const { data: discussion, error: discussionError } = await client.from('studio_agent_notes').select('author_role,mentioned_role,anchor,body').eq('project_id', project.id).order('created_at', { ascending: false }).limit(30);
 if (discussionError) return json({ error: 'The guild discussion is unavailable. Apply the latest Supabase migration.' }, 503);
 const [{ data: credential }, {data:routerCredential,error:routerError}, {data:groqCredential,error:groqError}, planConnected] = await Promise.all([
  admin.from('studio_keys').select('ciphertext').eq('workspace_id', project.workspace_id).maybeSingle(),
  admin.from('studio_openrouter_keys').select('ciphertext,model').eq('workspace_id',project.workspace_id).maybeSingle(),
  admin.from('studio_groq_keys').select('ciphertext,model').eq('workspace_id',project.workspace_id).maybeSingle(),
  hasChatGPTPlan(project.workspace_id),
 ]);
 if(routerError && routerError.code!=='PGRST205') return json({error:'OpenRouter connection could not be loaded.'},503);
 if(groqError && groqError.code!=='PGRST205') return json({error:'Groq connection could not be loaded.'},503);
 const provider: ModelProvider = body.provider || preferredProvider({chatgpt:planConnected,groq:!!groqCredential,openrouter:!!routerCredential,api:!!credential});
 if (body.provider && !['api','chatgpt','openrouter','groq'].includes(body.provider)) return json({ error: 'Invalid model connection.' },400);
 const available = { api: !!credential, chatgpt: planConnected, openrouter:!!routerCredential, groq:!!groqCredential };
 if (provider === 'chatgpt' && !available.chatgpt) return json({ error: 'Reconnect ChatGPT in Connections; its generation service is unavailable.' },400);
 if (provider === 'api' && !available.api) return json({ error: 'Connect an OpenAI API key in Connections first.' },400);
 if (provider === 'openrouter' && !available.openrouter) return json({error:'Connect OpenRouter in Connections first.'},400);
 if (provider === 'groq' && !available.groq) return json({error:'Connect Groq in Connections first.'},400);
 const token = randomUUID();
 const { data: allowed, error: lockError } = await admin.rpc('reserve_studio_generation', { workspace: project.workspace_id, token });
 if (lockError) return json({ error: 'Generation is temporarily unavailable.' }, 503);
 if (!allowed) return json({ error: 'A generation is already running, or the daily limit of 30 requests has been reached. Try again later.' }, 429);
 let leaseLost=false,renewing=false;
 const heartbeat=setInterval(async()=>{if(renewing)return;renewing=true;try{const renewed=await admin.rpc('renew_studio_generation',{p_workspace:project.workspace_id,p_token:token});if(renewed.error||!renewed.data)leaseLost=true;}catch{leaseLost=true;}finally{renewing=false;}},20000);
 try {
  const attempt = await withProviderFallback({ preferred: provider, available, run: selectedProvider => selectedProvider === 'chatgpt'
   ? generateChatGPT({workspace:project.workspace_id,brief:project.brief,previous,feedback:body.feedback})
   : runGuild({ key: openKey((selectedProvider==='groq'?groqCredential:selectedProvider==='openrouter'?routerCredential:credential)!.ciphertext, project.workspace_id), brief: project.brief, previous, feedback: body.feedback, discussion: [...(discussion || [])].reverse(),provider:selectedProvider,model:selectedProvider==='groq'?groqCredential!.model:selectedProvider==='openrouter'?routerCredential!.model:process.env.STUDIO_OPENAI_MODEL||'gpt-4.1-mini' }) });
  if(leaseLost) return json({error:'The generation lease expired. No changes were published.'},409);
  const result = attempt.value;
  const notes: AgentNote[] = 'notes' in result && Array.isArray(result.notes) ? result.notes as AgentNote[] : [];
  const committed = await commitVersion({ projectId: project.id, workspaceId: project.workspace_id, actorId: user.id,
   requestId: token, expectedVersionId: body.expectedVersionId, parentVersionId: body.versionId || null,
   document: result.document, feedback: body.feedback, model: result.model, inputTokens: result.input_tokens, outputTokens: result.output_tokens });
  if (committed.response) {
   const failure = await committed.response.json();
   return json({ ...failure, error: `${failure.error} Model usage may still apply.`, generatedDocument: result.document }, committed.response.status);
  }
  const version = committed.version;
  if (notes.length) {
   const { data: savedNotes, error: notesError } = await admin.from('studio_agent_notes').insert(notes.map(note => ({ ...note, project_id: project.id, workspace_id: project.workspace_id, version_id: version.id }))).select('*');
   if (notesError) return json({ version, warning: 'The design was saved, but the guild discussion could not be saved. Apply the latest Supabase migration before generating again.' });
   return json({ version, notes: savedNotes, provider: attempt.provider, switchedFrom: attempt.switchedFrom });
  }
  return json({ version, notes: [], provider: attempt.provider, switchedFrom: attempt.switchedFrom });
 } catch (error) {
  const message = error instanceof Error ? error.message : '';
  const safe = /^(OpenAI|OpenRouter|Groq|ChatGPT|The (generation|generated design)|This brief)/.test(message);
  return json({ error: safe ? message : 'Generation could not finish. Please try again; your saved versions are safe.' }, 502);
 } finally { clearInterval(heartbeat);await admin.rpc('release_studio_generation', { workspace: project.workspace_id, token }); }
}

import { randomUUID } from 'node:crypto';
import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { openKey } from '@/lib/studio/vault.mjs';
import { replyAsAgent, replyAsChatGPT } from '@/lib/studio/agent-chat';
import { agentRoles } from '@/lib/studio/agent-roles';
import { withProviderFallback, preferredProvider } from '@/lib/studio/provider-fallback.ts';
import { hasChatGPTPlan } from '@/lib/studio/chatgpt-oauth';

export const runtime = 'nodejs';
export const maxDuration = 120;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function context(request: Request, role: string) {
 if (!authConfig()) return { error: json({ error: 'Studio access is not configured.' }, 503) };
 if (!agentRoles.includes(role as typeof agentRoles[number])) return { error: json({ error: 'Agent not found.' }, 404) };
 const client = await sessionClient();
 const { data: { user } } = await client.auth.getUser();
 if (!user) return { error: json({ error: 'Your session expired. Sign in again.' }, 401) };
 const projectId = new URL(request.url).searchParams.get('projectId');
 if (!projectId || !uuid.test(projectId)) return { error: json({ error: 'Project not found.' }, 404) };
 const { data: project } = await client.from('studio_projects').select('id,workspace_id,brief').eq('id', projectId).single();
 if (!project) return { error: json({ error: 'Project not found.' }, 404) };
 return { client, project, role: role as typeof agentRoles[number] };
}

export async function GET(request: Request, { params }: { params: Promise<{ role: string }> }) {
 const { role } = await params;
 const ctx = await context(request, role);
 if ('error' in ctx) return ctx.error;
 const { data, error } = await ctx.client.from('studio_agent_messages').select('id,project_id,agent_role,author_kind,body,model,input_tokens,output_tokens,created_at').eq('project_id', ctx.project.id).eq('workspace_id', ctx.project.workspace_id).eq('agent_role', ctx.role).order('created_at', { ascending: true }).limit(200);
 if (error) return json({ error: 'Agent messages are unavailable. Apply the latest Supabase migration.' }, 503);
 return json({ messages: data || [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ role: string }> }) {
 const origin = request.headers.get('origin');
 const expected = process.env.STUDIO_APP_URL || new URL(request.url).origin;
 if (!origin || origin !== new URL(expected).origin) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 const { role } = await params;
 const ctx = await context(request, role);
 if ('error' in ctx) return ctx.error;
 let body: { text?: unknown; sharedThread?: unknown };
 try { const raw = await request.text(); if (raw.length > 5000) return json({ error: 'Message is too long.' }, 413); body = JSON.parse(raw); }
 catch { return json({ error: 'Invalid message.' }, 400); }
 if (typeof body?.text !== 'string' || !body.text.trim() || body.text.length > 4000 || (body.sharedThread !== undefined && typeof body.sharedThread !== 'boolean')) return json({ error: 'Write a message under 4,000 characters.' }, 400);
 const admin = adminClient();
 const [{ data: prior, error: priorError }, { data: notes, error: notesError }, { data: latestVersion, error: versionError }, { data: credential }, {data:routerCredential,error:routerError}, {data:groqCredential,error:groqError}, planConnected] = await Promise.all([
  ctx.client.from('studio_agent_messages').select('author_kind,body').eq('project_id', ctx.project.id).eq('workspace_id', ctx.project.workspace_id).eq('agent_role', ctx.role).order('created_at', { ascending: false }).limit(12),
  ctx.client.from('studio_agent_notes').select('author_role,mentioned_role,anchor,body').eq('project_id', ctx.project.id).order('created_at', { ascending: false }).limit(20),
  ctx.client.from('studio_versions').select('id,document').eq('project_id', ctx.project.id).eq('workspace_id', ctx.project.workspace_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  admin.from('studio_keys').select('ciphertext').eq('workspace_id', ctx.project.workspace_id).maybeSingle(),
  admin.from('studio_openrouter_keys').select('ciphertext,model').eq('workspace_id',ctx.project.workspace_id).maybeSingle(),
  admin.from('studio_groq_keys').select('ciphertext,model').eq('workspace_id',ctx.project.workspace_id).maybeSingle(),
  hasChatGPTPlan(ctx.project.workspace_id),
 ]);
 if (priorError || notesError || versionError || (routerError&&routerError.code!=='PGRST205') || (groqError&&groqError.code!=='PGRST205')) return json({ error: 'Project context could not be loaded. Please try again.' }, 503);
 const available = { api: !!credential, chatgpt: planConnected, openrouter:!!routerCredential, groq:!!groqCredential };
 if (!available.api && !available.chatgpt && !available.openrouter && !available.groq) return json({ error: 'Connect Groq, OpenRouter, ChatGPT, or an OpenAI API key in Connections first.' }, 400);
 const token = randomUUID();
 const { data: allowed, error: lockError } = await admin.rpc('reserve_studio_generation', { workspace: ctx.project.workspace_id, token });
 if (lockError) return json({ error: 'Agent chat is temporarily unavailable.' }, 503);
 if (!allowed) return json({ error: 'Another model request is running, or the daily limit has been reached. Try again later.' }, 429);
 try {
  const input = { brief: ctx.project.brief, document: latestVersion?.document || null, notes: [...(notes || [])].reverse().slice(-10).map(note => ({ ...note, body: note.body.slice(0, 800) })), messages: [...(prior || [])].reverse().map(message => ({ ...message, body: message.body.slice(0, 1800) })), text: body.text.trim() };
  const attempt = await withProviderFallback({ preferred: preferredProvider(available), available, run: provider => provider === 'chatgpt'
   ? replyAsChatGPT({ ...input, workspace: ctx.project.workspace_id, role: ctx.role })
   : replyAsAgent({ ...input, key: openKey((provider==='openrouter'?routerCredential:provider==='groq'?groqCredential:credential)!.ciphertext, ctx.project.workspace_id), role: ctx.role,provider,model:provider==='openrouter'?routerCredential!.model:provider==='groq'?groqCredential!.model:undefined }) });
  const result = attempt.value;
  const now = Date.now();
  const rows = await admin.from('studio_agent_messages').insert([
   ...(!body.sharedThread ? [{ project_id: ctx.project.id, workspace_id: ctx.project.workspace_id, agent_role: ctx.role, author_kind: 'human', body: body.text.trim(), created_at: new Date(now).toISOString() }] : []),
   { project_id: ctx.project.id, workspace_id: ctx.project.workspace_id, agent_role: ctx.role, author_kind: 'agent', body: result.reply, model: result.model, input_tokens: result.input_tokens, output_tokens: result.output_tokens, created_at: new Date(now + 1).toISOString() },
  ]).select('id,project_id,agent_role,author_kind,body,model,input_tokens,output_tokens,created_at');
  if (rows.error || !rows.data) return json({ error: 'The reply was generated but could not be saved. Model usage may still apply.' }, 503);
  const mentionNames: Record<string, typeof agentRoles[number]> = { Ari: 'creative_director', Noor: 'ux_architect', Pip: 'copywriter', Mira: 'ui_designer', Vale: 'qa_critic' };
  const tag = result.reply.match(/@(Ari|Noor|Pip|Mira|Vale)\b/);
  const mentionedRole = tag ? mentionNames[tag[1]] : null;
  let sharedNote = null;
  if (body.sharedThread || (mentionedRole && mentionedRole !== ctx.role)) {
   const { data: note, error } = await admin.from('studio_agent_notes').insert({ project_id: ctx.project.id, workspace_id: ctx.project.workspace_id, version_id: latestVersion?.id || null, author_role: ctx.role, mentioned_role: mentionedRole && mentionedRole !== ctx.role ? mentionedRole : null, anchor: 'page', body: result.reply.trim().slice(0, 2000) }).select('*').single();
   if (error) return json({ messages: rows.data, warning: 'The reply was generated, but could not be added to the project conversation.' }, 201);
   sharedNote = note;
  }
  return json({ messages: rows.data, sharedNote, switchedFrom: attempt.switchedFrom, usage: { input_tokens: result.input_tokens, output_tokens: result.output_tokens, model: result.model } }, 201);
 } catch (error) {
  const message = error instanceof Error ? error.message : '';
  const safe = /^(OpenAI|OpenRouter|ChatGPT|The agent)/.test(message);
  return json({ error: safe ? message : 'The agent could not finish this reply. Please try again.' }, 502);
 } finally { await admin.rpc('release_studio_generation', { workspace: ctx.project.workspace_id, token }); }
}

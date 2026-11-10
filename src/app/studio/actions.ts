'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminClient, sessionClient, studioSession } from '@/lib/studio/supabase';
import { sealKey } from '@/lib/studio/vault.mjs';
import { cookies } from 'next/headers';
import { authCookieOptions, SESSION_EXPIRY_COOKIE, isAuthCookie } from '@/lib/auth/config';
import { issueSessionWindow } from '@/lib/auth/session-window';
import { codeDeliveryError } from '@/lib/studio/auth-errors.mjs';
import { randomUUID } from 'node:crypto';
import { firstRunDisplay, waitingForModelMessages } from '@/lib/studio/trial';
import { trackEvent } from '@/lib/analytics';
import { scheduleWorker } from '@/lib/studio/worker-trigger';
import Anthropic from '@anthropic-ai/sdk';
import { defaultAnthropicModel } from '@/lib/studio/agents/provider-request';

export async function sendCode(email: string) {
 if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
 try {
  const client = await sessionClient(true);
  const { error } = await client.auth.signInWithOtp({ email: email.trim().toLowerCase() });
  if (error) {
   const failure = codeDeliveryError(error);
   console.error('Studio code delivery failed', { code: failure.code, status: failure.status });
   return { error: failure.message };
  }
  return { sent: true };
 } catch { return { error: 'Sign-in is temporarily unavailable. Please try again later.' }; }
}
export async function verifyCode(email: string, token: string) {
 if (typeof email !== 'string' || email.length > 254 || typeof token !== 'string' || !/^\d{6,8}$/.test(token)) return { error: 'Enter the code from your email.' };
 try {
  const client = await sessionClient(true);
  const { data, error } = await client.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' });
  if (error || !data.session) return { error: 'That code is invalid or expired. Request a new code and try again.' };
  (await cookies()).set(SESSION_EXPIRY_COOKIE,issueSessionWindow(data.session),{...authCookieOptions,httpOnly:true});
 } catch { return { error: 'Sign-in is temporarily unavailable.' }; }
 await trackEvent('signed_in', { method: 'email' });
 return { verified: true };
}
export async function signOut() {
 const client = await sessionClient(true);
 try {await client.auth.signOut({scope:'local'});} finally {
  const jar=await cookies();
  for(const cookie of jar.getAll()) if(isAuthCookie(cookie.name)||cookie.name===SESSION_EXPIRY_COOKIE) jar.set(cookie.name,'',{...authCookieOptions,httpOnly:cookie.name===SESSION_EXPIRY_COOKIE,maxAge:0});
 }
 redirect('/signin');
}
function briefTitle(brief: string) {
 const words = brief.replace(/\s+/g, ' ').split(' ').filter(Boolean).slice(0, 6).join(' ');
 return words.length > 60 ? words.slice(0, 60).trimEnd() + '…' : words;
}
/** Kicks off the guild on a new brief so the first design starts without another click. */
// The brief the user wrote becomes their first chat message and starts the guild.
// With no model available the worker parks it with a "connect a model" note, and
// resumeWaitingBriefs restarts it as soon as a model is connected.
async function startFirstRun(projectId: string, userId: string, brief: string): Promise<boolean> {
 try {
  const { data, error } = await adminClient().rpc('enqueue_studio_task', {
   p_project: projectId, p_actor: userId, p_request: randomUUID(), p_role: 'creative_director', p_version: null,
   p_text: 'Design the first screen for this project from the brief. Make it complete and ready for review.',
   p_display: firstRunDisplay(brief),
  });
  if (!error && (data as { status?: string } | null)?.status === 'queued') scheduleWorker();
  if (error || (data as { status?: string } | null)?.status !== 'queued') {
   console.error('First run could not be queued:', error?.code === 'PGRST202' ? 'enqueue_studio_task is outdated. Apply the pending Supabase migrations (202610290001_separate_note_display.sql).' : error?.code || (data as { status?: string } | null)?.status);
   return false;
  }
  return true;
 } catch { return false; /* The project is saved; the user can still message the guild. */ }
}
/** Restart briefs that were parked only because the workspace had no model. */
async function resumeWaitingBriefs(workspaceId: string, userId: string) {
 try {
  const admin = adminClient();
  const { data } = await admin.from('studio_tasks').select('id').eq('workspace_id', workspaceId).is('parent_task_id', null)
   .eq('status', 'blocked').in('summary', waitingForModelMessages).order('created_at', { ascending: true }).limit(20);
  for (const task of data || []) await admin.rpc('control_studio_task', { p_task: task.id, p_actor: userId, p_action: 'retry' });
  if (data?.length) scheduleWorker();
 } catch { /* Best effort: the user can still press Retry on the task. */ }
}
export async function createProject(form: FormData) {
 const { client, user, workspace } = await studioSession();
 const brief = String(form.get('brief') || '').trim();
 const name = String(form.get('name') || '').trim() || briefTitle(brief);
 if (!name || name.length > 100 || brief.length < 20 || brief.length > 12000) return { error: 'Write a brief of 20–12,000 characters (and a title under 100 characters).' };
 const { data, error } = await client.from('studio_projects').insert({ name, brief, workspace_id: workspace.id }).select('id').single();
 if (error || !data) return { error: 'Your brief could not be saved. Please try again.' };
 const started = await startFirstRun(data.id, user.id, brief);
 await trackEvent('project_created', { autoStarted: started });
 revalidatePath('/studio');
 redirect('/studio/projects/' + data.id);
}
export async function saveProviderKey(form: FormData) {
 const { user, workspace } = await studioSession();
 const key = String(form.get('key') || '').trim();
 if (!/^sk-[A-Za-z0-9_-]{16,500}$/.test(key)) return { error: 'Enter a valid OpenAI API key beginning with sk-.' };
 try {
  const ciphertext = sealKey(key, workspace.id);
  const { error } = await adminClient().from('studio_keys').upsert({ workspace_id: workspace.id, ciphertext, suffix: key.slice(-4), updated_at: new Date().toISOString() });
  if (error) throw error;
  await resumeWaitingBriefs(workspace.id, user.id);
  await trackEvent('provider_connected', { provider: 'openai' });
  return { saved: true };
 } catch { return { error: 'Your key could not be saved securely. Please try again later.' }; }
}
export async function removeProviderKey() {
 const { workspace } = await studioSession();
 const { error } = await adminClient().from('studio_keys').delete().eq('workspace_id', workspace.id);
 if (error) return { error: 'Your key could not be removed. Please try again.' };
 revalidatePath('/studio/settings');
 return { saved: true };
}

export async function saveOpenRouterKey(form: FormData) {
 const { user, workspace } = await studioSession();
 const key = String(form.get('key') || '').trim();
 if (!/^sk-or-v1-[A-Za-z0-9_-]{16,500}$/.test(key)) return { error: 'Enter a valid OpenRouter API key beginning with sk-or-v1-.' };
 try {
  const verified = await fetch('https://openrouter.ai/api/v1/key', {
   headers: { Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (!verified.ok) return { error: verified.status === 401 ? 'OpenRouter rejected this key. Check that it is active.' : 'OpenRouter could not verify this key. Try again.' };
  const info=await verified.json() as {data?:{is_management_key?:boolean;is_provisioning_key?:boolean}};
  if (!info.data) return { error: 'OpenRouter did not confirm this key. Try again.' };
  if(info.data.is_management_key||info.data.is_provisioning_key) return {error:'Use an OpenRouter inference API key, not a management key.'};
  const ciphertext = sealKey(key, workspace.id);
  const { error } = await adminClient().from('studio_openrouter_keys').upsert({
   workspace_id: workspace.id, ciphertext, suffix: key.slice(-4),
   model: 'nvidia/nemotron-3-super-120b-a12b:free', updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.code === 'PGRST205' ? 'Apply the OpenRouter database migration before connecting a key.' : 'Your OpenRouter key could not be saved securely.' };
  revalidatePath('/studio/settings');
  await resumeWaitingBriefs(workspace.id, user.id);
  await trackEvent('provider_connected', { provider: 'openrouter' });
  return { saved: true };
 } catch { return { error: 'OpenRouter could not verify this key. Check your connection and try again.' }; }
}

export async function removeOpenRouterKey() {
 const { workspace } = await studioSession();
 const { error } = await adminClient().from('studio_openrouter_keys').delete().eq('workspace_id', workspace.id);
 if (error) return { error: 'Your OpenRouter key could not be removed.' };
 revalidatePath('/studio/settings');
 return { saved: true };
}

export async function saveGroqKey(form: FormData) {
 const { user, workspace } = await studioSession();
 const key = String(form.get('key') || '').trim();
 if (!/^gsk_[A-Za-z0-9_-]{16,500}$/.test(key)) return { error: 'Enter a valid Groq API key beginning with gsk_.' };
 try {
  const verified = await fetch('https://api.groq.com/openai/v1/models', {
   headers: { Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (!verified.ok) return { error: verified.status === 401 ? 'Groq rejected this key. Check that it is active.' : 'Groq could not verify this key. Try again.' };
  const info=await verified.json() as {data?:{id?:string}[]};
  if (!Array.isArray(info.data)||!info.data.some(model=>model.id==='openai/gpt-oss-120b')) return { error: 'Groq verified the key but the GPT OSS 120B model is unavailable to this account.' };
  const ciphertext=sealKey(key,workspace.id);
  const {error}=await adminClient().from('studio_groq_keys').upsert({workspace_id:workspace.id,ciphertext,suffix:key.slice(-4),model:'openai/gpt-oss-120b',updated_at:new Date().toISOString()});
  if(error) return {error:error.code==='PGRST205'?'Apply the Groq database migration before connecting a key.':'Your Groq key could not be saved securely.'};
  revalidatePath('/studio/settings');
  revalidatePath('/studio/projects');
  await resumeWaitingBriefs(workspace.id, user.id);
  await trackEvent('provider_connected', { provider: 'groq' });
  return {saved:true};
 } catch { return {error:'Groq could not verify this key. Check your connection and try again.'}; }
}

export async function removeGroqKey() {
 const {workspace}=await studioSession();
 const {error}=await adminClient().from('studio_groq_keys').delete().eq('workspace_id',workspace.id);
 if(error) return {error:'Your Groq key could not be removed.'};
 revalidatePath('/studio/settings');
 revalidatePath('/studio/projects');
 return {saved:true};
}

export async function saveAnthropicKey(form: FormData) {
 const { user, workspace } = await studioSession();
 const key = String(form.get('key') || '').trim();
 if (/^sk-ant-oat/i.test(key)) return { error: 'That is a Claude subscription sign-in token. GuildOS needs an API key from the Claude Console (platform.claude.com).' };
 if (/^sk-ant-admin/i.test(key)) return { error: 'Use a regular Claude API key, not an Admin API key.' };
 if (!/^sk-ant-[A-Za-z0-9_-]{20,500}$/.test(key)) return { error: 'Enter a valid Claude API key beginning with sk-ant-.' };
 const model = process.env.STUDIO_ANTHROPIC_MODEL || defaultAnthropicModel;
 try {
  // Confirms the key works and can reach the model GuildOS will use.
  await new Anthropic({ apiKey: key, maxRetries: 1, timeout: 10000 }).models.retrieve(model);
 } catch (error) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return { error: 'Claude rejected this key. Check that it is active.' };
  if (error instanceof Anthropic.NotFoundError) return { error: 'Claude verified the key, but this account cannot use the configured model.' };
  return { error: 'Claude could not verify this key. Check your connection and try again.' };
 }
 const ciphertext = sealKey(key, workspace.id);
 const { error } = await adminClient().from('studio_anthropic_keys').upsert({ workspace_id: workspace.id, ciphertext, suffix: key.slice(-4), model, updated_at: new Date().toISOString() });
 if (error) return { error: error.code === 'PGRST205' ? 'Apply the Claude database migration before connecting a key.' : 'Your Claude key could not be saved securely.' };
 revalidatePath('/studio/settings');
 revalidatePath('/studio/projects');
 await resumeWaitingBriefs(workspace.id, user.id);
 await trackEvent('provider_connected', { provider: 'anthropic' });
 return { saved: true };
}

export async function removeAnthropicKey() {
 const { workspace } = await studioSession();
 const { error } = await adminClient().from('studio_anthropic_keys').delete().eq('workspace_id', workspace.id);
 if (error) return { error: 'Your Claude key could not be removed.' };
 revalidatePath('/studio/settings');
 revalidatePath('/studio/projects');
 return { saved: true };
}

'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminClient, sessionClient, studioSession } from '@/lib/studio/supabase';
import { sealKey } from '@/lib/studio/vault.mjs';
import { codeDeliveryError } from '@/lib/studio/auth-errors.mjs';

export async function sendCode(email: string) {
 if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
 try {
  const client = await sessionClient();
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
  const client = await sessionClient();
  const { error } = await client.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' });
  if (error) return { error: 'That code is invalid or expired. Request a new code and try again.' };
 } catch { return { error: 'Sign-in is temporarily unavailable.' }; }
 return { verified: true };
}
export async function signOut() {
 const client = await sessionClient();
 await client.auth.signOut();
 redirect('/signin');
}
export async function createProject(form: FormData) {
 const { client, workspace } = await studioSession();
 const name = String(form.get('name') || '').trim();
 const brief = String(form.get('brief') || '').trim();
 if (!name || name.length > 100 || brief.length < 20 || brief.length > 12000) return { error: 'Add a title and a brief of 20–12,000 characters.' };
 const { data, error } = await client.from('studio_projects').insert({ name, brief, workspace_id: workspace.id }).select('id').single();
 if (error || !data) return { error: 'Your brief could not be saved. Please try again.' };
 revalidatePath('/studio');
 redirect('/studio/projects/' + data.id);
}
export async function saveProviderKey(form: FormData) {
 const { workspace } = await studioSession();
 const key = String(form.get('key') || '').trim();
 if (!/^sk-[A-Za-z0-9_-]{16,500}$/.test(key)) return { error: 'Enter a valid OpenAI API key beginning with sk-.' };
 try {
  const ciphertext = sealKey(key, workspace.id);
  const { error } = await adminClient().from('studio_keys').upsert({ workspace_id: workspace.id, ciphertext, suffix: key.slice(-4), updated_at: new Date().toISOString() });
  if (error) throw error;
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
 const { workspace } = await studioSession();
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
 const { workspace } = await studioSession();
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

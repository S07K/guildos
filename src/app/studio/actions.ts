'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminClient, sessionClient, studioSession } from '@/lib/studio/supabase';
import { sealKey } from '@/lib/studio/vault.mjs';
import { validDestination } from '@/lib/studio/design.mjs';
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
 const cta_url = String(form.get('cta_url') || '').trim();
 if (!name || name.length > 100 || brief.length < 20 || brief.length > 12000 || !validDestination(cta_url)) return { error: 'Add a title, a brief of 20–12,000 characters, and a valid HTTPS button destination.' };
 const { data, error } = await client.from('studio_projects').insert({ name, brief, cta_url, workspace_id: workspace.id }).select('id').single();
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

import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { authCookieOptions, isAuthCookie, SESSION_EXPIRY_COOKIE } from '../auth/config';
import { readSessionWindow, validateStudioSession } from '../auth/session-window';
import type { SupabaseClient } from '@supabase/supabase-js';

export function authConfig() {
 const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 return url && key ? { url, key } : null;
}
export async function sessionClient(login = false) {
 const config = authConfig();
 if (!config) throw new Error('Studio authentication is not configured.');
 const jar = await cookies();
 const valid = login || !!readSessionWindow(jar.get(SESSION_EXPIRY_COOKIE)?.value);
 return createServerClient(config.url, config.key, { cookieOptions:authCookieOptions, auth:{flowType:'pkce',autoRefreshToken:false}, cookies: {
  getAll: () => jar.getAll().filter(cookie=>valid || !isAuthCookie(cookie.name)),
  setAll: values => { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Server components use the proxy to refresh cookies. */ } },
 } });
}
export async function studioUser(client: SupabaseClient) {
 const jar = await cookies();
 const user = await validateStudioSession(client,jar.get(SESSION_EXPIRY_COOKIE)?.value);
 return {data:{user},error:user?null:new Error('Your session has expired. Sign in again.')};
}
export function adminClient() {
 const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!url || !key) throw new Error('Studio storage is not configured.');
 return createClient(url, key, { global: { headers: { Prefer: 'timezone=UTC' } }, auth: { persistSession: false, autoRefreshToken: false } });
}
export const studioSession = cache(async () => {
 if (!authConfig()) redirect('/signin');
 const client = await sessionClient();
 const { data: { user }, error } = await studioUser(client);
 if (error || !user) redirect('/signin');
 let { data: workspace } = await client.from('studio_workspaces').select('id, name').eq('owner_id', user.id).maybeSingle();
 if (!workspace) {
  const { error: insertError } = await client.from('studio_workspaces').insert({ owner_id: user.id });
  if (insertError && insertError.code !== '23505') throw new Error('Your workspace could not be opened. Please try again.');
  const result = await client.from('studio_workspaces').select('id, name').eq('owner_id', user.id).single();
  workspace = result.data;
 }
 if (!workspace) throw new Error('Your workspace could not be opened. Please try again.');
 return { client, user, workspace };
});

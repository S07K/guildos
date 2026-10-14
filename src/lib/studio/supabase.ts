import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

export function authConfig() {
 const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 return url && key ? { url, key } : null;
}
export async function sessionClient() {
 const config = authConfig();
 if (!config) throw new Error('Studio authentication is not configured.');
 const jar = await cookies();
 return createServerClient(config.url, config.key, { cookies: {
  getAll: () => jar.getAll(),
  setAll: values => { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Server components use the proxy to refresh cookies. */ } },
 } });
}
export function adminClient() {
 const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!url || !key) throw new Error('Studio storage is not configured.');
 return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export const studioSession = cache(async () => {
 if (!authConfig()) redirect('/signin');
 const client = await sessionClient();
 const { data: { user }, error } = await client.auth.getUser();
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

'use client';
import { createBrowserClient } from '@supabase/ssr';
import { authCookieOptions, safeNextUrl } from './config';

type BrowserConfig = {url:string;key:string};
let config: BrowserConfig | undefined;
/** Server-rendered publishable configuration also supports existing server-only env names. */
export function configureBrowserAuth(value: BrowserConfig) {config=value;}
export function browserAuthClient() {
  const url = config?.url || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = config?.key || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Studio authentication is not configured.');
  return createBrowserClient(url,key,{cookieOptions:authCookieOptions,auth:{flowType:'pkce',autoRefreshToken:false,detectSessionInUrl:false}});
}
export async function signInWithGoogle(nextUrl?: string) {
  const {error} = await browserAuthClient().auth.signInWithOAuth({
    provider:'google',
    options:{
      redirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNextUrl(nextUrl))}`,
      queryParams:{access_type:'offline',prompt:'select_account'},
    },
  });
  if (error) throw error;
}

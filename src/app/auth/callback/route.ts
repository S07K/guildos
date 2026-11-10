import { trackEvent } from '@/lib/analytics';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authConfig, sessionClient } from '@/lib/studio/supabase';
import { authCookieOptions, isAuthCookie, SESSION_EXPIRY_COOKIE, safeNextUrl } from '@/lib/auth/config';
import { issueSessionWindow } from '@/lib/auth/session-window';

export async function GET(request: Request) {
 const url=new URL(request.url);
 const origin=new URL(process.env.STUDIO_APP_URL||request.url).origin;
 const next=safeNextUrl(url.searchParams.get('next'));
 const code=url.searchParams.get('code');
 const jar=await cookies();
 if(code&&!url.searchParams.has('error')&&authConfig()) {
  try {
   const client=await sessionClient(true);
   const {data,error}=await client.auth.exchangeCodeForSession(code);
   if(!error&&data.session) {
    jar.set(SESSION_EXPIRY_COOKIE,issueSessionWindow(data.session),{...authCookieOptions,httpOnly:true});
    await trackEvent('signed_in',{method:'oauth'});
    return NextResponse.redirect(new URL(next,origin),{headers:{'Cache-Control':'private, no-store'}});
   }
  } catch { /* Never expose provider errors, authorization codes, or tokens in redirects. */ }
 }
 for(const cookie of jar.getAll()) if(isAuthCookie(cookie.name)||cookie.name===SESSION_EXPIRY_COOKIE||/^sb-.+-auth-token-code-verifier$/.test(cookie.name)) jar.set(cookie.name,'',{...authCookieOptions,maxAge:0,httpOnly:cookie.name===SESSION_EXPIRY_COOKIE});
 const login=new URL('/signin',origin);login.searchParams.set('error','oauth');login.searchParams.set('next',next);
 return NextResponse.redirect(login,{headers:{'Cache-Control':'private, no-store'}});
}

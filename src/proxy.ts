import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authCookieOptions, isAuthCookie, SESSION_EXPIRY_COOKIE, safeNextUrl } from '@/lib/auth/config';
import { readSessionWindow, validateStudioSession } from '@/lib/auth/session-window';

export async function proxy(request: NextRequest) {
 if(request.nextUrl.pathname==='/'&&request.nextUrl.searchParams.has('code')) {
  const callbackUrl=request.nextUrl.clone();
  callbackUrl.pathname='/auth/callback';
  if(!callbackUrl.searchParams.has('next'))callbackUrl.searchParams.set('next','/studio');
  return NextResponse.redirect(callbackUrl);
 }
 const path=request.nextUrl.pathname;
 const api=path.startsWith('/api/studio/');
 const studio=path==='/studio'||path.startsWith('/studio/')||path==='/signin';
 if(!api&&!studio)return NextResponse.next({request});
 const protectedRoute=api||request.nextUrl.pathname==='/studio'||request.nextUrl.pathname.startsWith('/studio/');
 // Preserve the existing mutation origin boundary before authentication.
 if(api&&!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.get('origin')!==new URL(process.env.STUDIO_APP_URL||request.url).origin) {
  return NextResponse.json({error:'Use your GuildOS studio to make this request.'},{status:403,headers:{'Cache-Control':'private, no-store'}});
 }
 let response=NextResponse.next({request});
 const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const marker=request.cookies.get(SESSION_EXPIRY_COOKIE)?.value;
 const window=readSessionWindow(marker);
 let authorized=false;
 if(url&&key&&window) {
  const client=createServerClient(url,key,{cookieOptions:authCookieOptions,auth:{flowType:'pkce',autoRefreshToken:false},cookies:{
   getAll:()=>request.cookies.getAll(),
   setAll:values=>{
    values.forEach(({name,value})=>request.cookies.set(name,value));
    values.forEach(({name,value,options})=>response.cookies.set(name,value,options));
   },
  }});
  authorized=!!await validateStudioSession(client,marker);
  // Forward refreshed request cookies while retaining every Set-Cookie on the response.
  const forwarded=NextResponse.next({request});
  response.cookies.getAll().forEach(cookie=>forwarded.cookies.set(cookie));
  response=forwarded;
 }
 if(protectedRoute&&!authorized) {
  if(api) response=NextResponse.json({error:'Your session has expired. Sign in again.',code:'SESSION_EXPIRED'},{status:401});
  else {
   const login=new URL('/signin',request.url);
   if(marker)login.searchParams.set('reason','expired');
   const next=safeNextUrl(request.nextUrl.pathname+request.nextUrl.search);
   if(next!=='/studio')login.searchParams.set('next',next);
   response=NextResponse.redirect(login);
  }
 }
 if(!authorized) {
  for(const cookie of request.cookies.getAll()) if(isAuthCookie(cookie.name)||cookie.name===SESSION_EXPIRY_COOKIE) response.cookies.set(cookie.name,'',{...authCookieOptions,httpOnly:cookie.name===SESSION_EXPIRY_COOKIE,maxAge:0});
 }
 response.headers.set('Cache-Control','private, no-store');
 response.headers.set('Pragma','no-cache');
 return response;
}
export const config={matcher:['/:path*']};

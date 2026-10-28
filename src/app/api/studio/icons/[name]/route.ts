import { sessionClient, studioUser } from '@/lib/studio/supabase';
import { renderIconSvg } from '@/lib/studio/icon-library';

export async function GET(request:Request,{params}:{params:Promise<{name:string}>}) {
 const client=await sessionClient();
 const {data:{user}}=await studioUser(client);
 if(!user)return Response.json({error:'Sign in to access studio icons.'},{status:401,headers:{'Cache-Control':'private, no-store'}});
 const {name}=await params;
 const query=new URL(request.url).searchParams;
 try {
  const svg=renderIconSvg(name,query.get('color')||'#202b38',Number(query.get('strokeWidth')||2));
  return new Response(svg,{headers:{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'none'",'Cross-Origin-Resource-Policy':'same-origin'}});
 } catch {return new Response('Icon not found.',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
}

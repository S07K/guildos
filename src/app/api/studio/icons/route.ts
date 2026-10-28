import { sessionClient, studioUser } from '@/lib/studio/supabase';
import { iconLicense, searchIcons } from '@/lib/studio/icon-library';

export async function GET(request:Request) {
 const client=await sessionClient();
 const {data:{user}}=await studioUser(client);
 if(!user)return Response.json({error:'Sign in to access studio icons.'},{status:401,headers:{'Cache-Control':'private, no-store'}});
 const params=new URL(request.url).searchParams;
 const query=(params.get('query')||'').slice(0,80);
 const limit=Math.min(60,Math.max(1,Number(params.get('limit'))||32));
 return Response.json({icons:searchIcons(query,limit),source:iconLicense},{headers:{'Cache-Control':'private, no-store'}});
}

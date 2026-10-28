import { studioUser } from '@/lib/studio/supabase';
import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { privateJson as json, uuid } from '@/lib/studio/version-commit';

export const runtime = 'nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 if(!authConfig()) return json({error:'Studio access is not configured.'},503);
 const {id}=await params;
 const projectId=new URL(request.url).searchParams.get('projectId');
 if(!uuid.test(id)||!projectId||!uuid.test(projectId)) return json({error:'Invalid image.'},400);
 const client=await sessionClient();
 const {data:{user}}=await studioUser(client);
 if(!user) return json({error:'Your session expired. Sign in again.'},401);
 const {data:project}=await client.from('studio_projects').select('id,workspace_id').eq('id',projectId).single();
 if(!project) return json({error:'Image not found.'},404);
 const downloaded=await adminClient().storage.from('studio-assets').download(`${project.workspace_id}/${project.id}/${id}`);
 if(downloaded.error||!downloaded.data) return json({error:'Image not found.'},404);
 const type=downloaded.data.type;
 if(!['image/png','image/jpeg','image/webp'].includes(type)) return json({error:'Image format is unavailable.'},415);
 return new Response(downloaded.data,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Cross-Origin-Resource-Policy':'same-origin'}});
}

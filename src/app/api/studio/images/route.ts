import { studioUser } from '@/lib/studio/supabase';
import { authConfig, sessionClient } from '@/lib/studio/supabase';
import { privateJson as json, readCommitBody, uuid } from '@/lib/studio/version-commit';
import { searchUnsplash, ImageConnectorError } from '@/lib/studio/unsplash';
export const runtime='nodejs';
export async function POST(request:Request) {
 if(request.headers.get('origin')!==new URL(process.env.STUDIO_APP_URL||request.url).origin)return json({error:'Search images from your GuildOS studio.'},403);
 if(!authConfig())return json({error:'Studio access is not configured.'},503);
 const client=await sessionClient();const {data:{user}}=await studioUser(client);
 if(!user)return json({error:'Sign in to search images.'},401);
 let body;try{body=await readCommitBody(request);}catch{return json({error:'Invalid image search.'},400);}
 if(typeof body.projectId!=='string'||!uuid.test(body.projectId)||typeof body.query!=='string'||body.query.trim().length<2||body.query.length>100)return json({error:'Provide a project and a specific search query (2–100 characters).'},400);
 const {data:project}=await client.from('studio_projects').select('id').eq('id',body.projectId).maybeSingle();
 if(!project)return json({error:'Project not found.'},404);
 try{return json({photos:await searchUnsplash(body.query),source:'Unsplash'});}
 catch(error){return json({error:error instanceof ImageConnectorError?error.message:'Image search is temporarily unavailable.'},503);}
}

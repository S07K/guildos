import { studioUser } from '@/lib/studio/supabase';
import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { privateJson as json, uuid } from '@/lib/studio/version-commit';
import { ASSET_BUCKET, imageType, MAX_ASSET_BYTES as maxBytes, storeProjectImage } from '@/lib/studio/project-assets';

export const runtime = 'nodejs';
export async function POST(request:Request) {
 if(request.headers.get('origin')!==new URL(process.env.STUDIO_APP_URL||request.url).origin) return json({error:'Upload images from your GuildOS studio.'},403);
 if(!authConfig()) return json({error:'Studio access is not configured.'},503);
 const length=Number(request.headers.get('content-length'));
 if(Number.isFinite(length)&&length>maxBytes+65536) return json({error:'Images must be under 5 MB.'},413);
 const client=await sessionClient();
 const {data:{user}}=await studioUser(client);
 if(!user) return json({error:'Your session expired. Sign in again.'},401);
 let form:FormData;
 try {form=await request.formData();} catch {return json({error:'Choose a PNG, JPEG, or WebP image.'},400);}
 const projectId=form.get('projectId'),file=form.get('image');
 if(typeof projectId!=='string'||!uuid.test(projectId)||!(file instanceof File)||file.size<1||file.size>maxBytes) return json({error:'Choose an image under 5 MB for this project.'},400);
 const {data:project}=await client.from('studio_projects').select('id,workspace_id').eq('id',projectId).single();
 if(!project) return json({error:'Project not found.'},404);
 const bytes=new Uint8Array(await file.arrayBuffer());
 const type=imageType(bytes);
 if(!type) return json({error:'Use a PNG, JPEG, or WebP image.'},400);
 let stored;
 try { stored=await storeProjectImage(adminClient(),{workspaceId:project.workspace_id,projectId:project.id},bytes); }
 catch(error) { return json({error:error instanceof Error&&/storage is unavailable/.test(error.message)?error.message:'The image could not be uploaded securely.'},503); }
 const {id,path}=stored;
 // A project may be deleted while the file is uploading. Remove the late upload.
 const current=await client.from('studio_projects').select('id').eq('id',project.id).maybeSingle();
 if(current.error||!current.data){
  await adminClient().storage.from(ASSET_BUCKET).remove([path]);
  return json({error:current.error?'The project could not be verified. Please retry.':'This project was deleted before the image finished uploading.'},current.error?503:404);
 }
 return json({id,type,size:bytes.byteLength},201);
}

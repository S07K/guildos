import { randomUUID } from 'node:crypto';
import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';
import { privateJson as json, uuid } from '@/lib/studio/version-commit';

export const runtime = 'nodejs';
const bucket = 'studio-assets';
const maxBytes = 5 * 1024 * 1024;

function imageType(bytes:Uint8Array) {
 if(bytes.length>=8 && bytes.slice(0,8).every((byte,index)=>byte===[137,80,78,71,13,10,26,10][index])) return 'image/png';
 if(bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
 if(bytes.length>=12 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') return 'image/webp';
 return null;
}

export async function POST(request:Request) {
 if(request.headers.get('origin')!==new URL(process.env.STUDIO_APP_URL||request.url).origin) return json({error:'Upload images from your GuildOS studio.'},403);
 if(!authConfig()) return json({error:'Studio access is not configured.'},503);
 const length=Number(request.headers.get('content-length'));
 if(Number.isFinite(length)&&length>maxBytes+65536) return json({error:'Images must be under 5 MB.'},413);
 const client=await sessionClient();
 const {data:{user}}=await client.auth.getUser();
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
 const storage=adminClient().storage;
 const existing=await storage.getBucket(bucket);
 if(existing.error){
  const created=await storage.createBucket(bucket,{public:false,fileSizeLimit:maxBytes,allowedMimeTypes:['image/png','image/jpeg','image/webp']});
  if(created.error){const retry=await storage.getBucket(bucket);if(retry.error) return json({error:'Private image storage is unavailable.'},503);}
 }
 const id=randomUUID(),path=`${project.workspace_id}/${project.id}/${id}`;
 const uploaded=await storage.from(bucket).upload(path,bytes,{contentType:type,upsert:false,cacheControl:'3600'});
 if(uploaded.error) return json({error:'The image could not be uploaded securely.'},503);
 // A project may be deleted while the file is uploading. Remove the late upload.
 const current=await client.from('studio_projects').select('id').eq('id',project.id).maybeSingle();
 if(current.error||!current.data){
  await storage.from(bucket).remove([path]);
  return json({error:current.error?'The project could not be verified. Please retry.':'This project was deleted before the image finished uploading.'},current.error?503:404);
 }
 return json({id,type,size:bytes.byteLength},201);
}

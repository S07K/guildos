import { adminClient, authConfig, sessionClient } from '@/lib/studio/supabase';

export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function PATCH(request: Request) {
 const origin = request.headers.get('origin');
 const expectedOrigin = new URL(request.url).origin;
 if (!origin || origin !== expectedOrigin) return json({ error: 'Submit this request from your GuildOS studio.' }, 403);
 if (!authConfig()) return json({ error: 'Studio access is not configured.' }, 503);
 const client = await sessionClient();
 const { data: { user } } = await client.auth.getUser();
 if (!user) return json({ error: 'Your session expired. Sign in again.' }, 401);
 let body: { projectId?: unknown; name?: unknown };
 try { body = await request.json(); } catch { return json({ error: 'Invalid project name.' }, 400); }
 if (!body || typeof body.projectId !== 'string' || !uuid.test(body.projectId) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) return json({ error: 'Enter a project name up to 100 characters.' }, 400);
 const { data: workspace, error: workspaceError } = await client.from('studio_workspaces').select('id').eq('owner_id', user.id).single();
 if (workspaceError || !workspace) return json({ error: 'Project not found.' }, 404);
 const { data: project, error } = await adminClient().from('studio_projects').update({ name: body.name.trim() }).eq('id', body.projectId).eq('workspace_id', workspace.id).select('id,name').maybeSingle();
 if (error) return json({ error: 'Project name could not be saved.' }, 503);
 if (!project) return json({ error: 'Project not found.' }, 404);
 return json({ project });
}

export async function DELETE(request:Request) {
 if(request.headers.get('origin')!==new URL(process.env.STUDIO_APP_URL||request.url).origin)return json({error:'Submit this request from your GuildOS studio.'},403);
 if(!authConfig())return json({error:'Studio access is not configured.'},503);
 const client=await sessionClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user)return json({error:'Your session expired. Sign in again.'},401);
 let body:{projectId?:unknown};
 try{body=await request.json();}catch{return json({error:'Invalid project.'},400);}
 if(!body||typeof body.projectId!=='string'||!uuid.test(body.projectId))return json({error:'Invalid project.'},400);
 const {data:workspace,error:workspaceError}=await client.from('studio_workspaces').select('id').eq('owner_id',user.id).maybeSingle();
 if(workspaceError)return json({error:'Your workspace could not be loaded. Please retry.'},503);
 if(!workspace)return json({error:'Project not found.'},404);
 // RLS plus the workspace predicate scope deletion. Cascades remove all dependent records.
 // Repeating a completed delete is safe and can finish an interrupted storage cleanup.
 const {error:deleteError}=await client.from('studio_projects').delete().eq('id',body.projectId).eq('workspace_id',workspace.id);
 if(deleteError)return json({error:'The project could not be deleted. Please retry.'},503);
 try {
  const storage=adminClient().storage;
  const bucket=await storage.getBucket('studio-assets');
  if(bucket.error){
   if(bucket.error.status===404||String(bucket.error.statusCode)==='404'||bucket.error.message==='Bucket not found')return json({deleted:true});
   throw bucket.error;
  }
  const prefix=`${workspace.id}/${body.projectId}`;
  // Remove one page at a time. Start at zero because each removal shifts the next page.
  while(true){
   const {data:files,error}=await storage.from('studio-assets').list(prefix,{limit:100,sortBy:{column:'name',order:'asc'}});
   if(error||!files)throw error||new Error('Image listing failed.');
   if(!files.length)break;
   if(files.some(file=>!file.id))throw new Error('Unexpected image folder.');
   const removed=await storage.from('studio-assets').remove(files.map(file=>`${prefix}/${file.name}`));
   if(removed.error)throw removed.error;
  }
 }catch{
  return json({deleted:true,error:'The project was removed, but uploaded images could not be cleaned up. Retry deletion to finish.'},503);
 }
 return json({deleted:true});
}

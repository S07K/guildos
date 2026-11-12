// Local browser-test service only. Never imported by application code or deployed.
import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'studio-test@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const token = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user.id, session_id:'00000000-0000-4000-8000-000000000002', exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' })).toString('base64url') + '.fixture-signature';
const tables = { studio_workspaces: [], studio_projects: [], studio_keys: [], studio_versions: [], studio_screens: [], studio_screen_versions: [], studio_share_links: [], studio_agent_notes: [], studio_agent_messages: [], studio_canvas_commits: [], studio_tasks: [], studio_openrouter_keys: [], studio_groq_keys: [], studio_anthropic_keys: [], studio_trial_runs: [], studio_task_events: [], studio_task_subtasks: [], studio_generation_limits: [], studio_pipeline_drafts: [] };
const storageFiles=new Set();
let failedStorageDeletes=0;
let projectReadDelay=null;
const server = createServer(async (req, res) => {
 const url = new URL(req.url, 'http://localhost');
 let raw = ''; for await (const chunk of req) raw += chunk;
 const body = raw ? JSON.parse(raw) : {};
 const send = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
 if (url.pathname === '/health') return send({ ok: true });
 if(url.pathname==='/__test/delay-project'&&req.method==='POST'){projectReadDelay={id:body.id,ms:Math.min(5000,Math.max(0,Number(body.ms)||0))};return send({ok:true});}
 if (url.pathname === '/auth/v1/otp') return send({});
 if (url.pathname === '/auth/v1/verify') return body.token === '123456' ? send({ access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }) : send({ message: 'Invalid token' }, 400);
 if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type')==='pkce') return body.auth_code==='fixture-oauth-code'&&body.code_verifier ? send({access_token:token,refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,user}) : send({message:'Invalid code'},400);
 if (url.pathname === '/auth/v1/logout') return send({});
 const authenticated = req.headers.authorization === 'Bearer ' + token;
 const admin = req.headers.apikey === 'sb_secret_test-studio-only';
 if (url.pathname === '/auth/v1/user') return authenticated ? send(user) : send({ message: 'Unauthorized' }, 401);
 if(url.pathname==='/rest/v1/rpc/reserve_studio_generation')return admin?send(true):send({},403);
 if(url.pathname==='/rest/v1/rpc/release_studio_generation')return admin?send(null):send({},403);
 if (url.pathname === '/rest/v1/rpc/enqueue_studio_task') {
  if(!admin)return send({},403);
  const project=tables.studio_projects.find(p=>p.id===body.p_project);
  if(!project||body.p_actor!==user.id)return send({status:'not_found'});
  const prior=tables.studio_tasks.find(t=>t.project_id===body.p_project&&t.request_id===body.p_request);
  if(prior)return send(prior.instruction===body.p_text&&prior.agent_role===body.p_role?{status:'replayed',task:prior,note:tables.studio_agent_notes.find(n=>n.id===prior.source_note_id)}:{status:'conflict'});
  const note={id:randomUUID(),project_id:project.id,workspace_id:project.workspace_id,version_id:body.p_version,author_role:'human',mentioned_role:body.p_role,anchor:'page',body:body.p_display ?? body.p_text,created_at:new Date().toISOString()};
  const task={id:randomUUID(),project_id:project.id,workspace_id:project.workspace_id,request_id:body.p_request,source_note_id:note.id,agent_role:body.p_role,instruction:body.p_text,status:'queued',attempts:0,result_version_id:null,summary:'',error:'',input_tokens:0,output_tokens:0,created_at:note.created_at,updated_at:note.created_at};
  tables.studio_agent_notes.push(note);tables.studio_tasks.push(task);return send({status:'queued',note,task});
 }
 if(url.pathname==='/rest/v1/rpc/control_studio_task'){
  if(!admin)return send({},403);
  const task=tables.studio_tasks.find(t=>t.id===body.p_task);
  if(!task||body.p_actor!==user.id)return send({status:'not_found'});
  if(body.p_action==='cancel'&&['queued','running','blocked','failed'].includes(task.status))task.status='cancelled';
  else if(body.p_action==='retry'&&['blocked','failed','cancelled'].includes(task.status))task.status='queued';
  else if(body.p_action==='approve'&&task.status==='review')task.status='done';
  else return send({status:'invalid_transition'});
  return send({status:'updated'});
 }
 if (url.pathname === '/rest/v1/rpc/commit_studio_version') {
  if (!admin) return send({},403);
  const project = tables.studio_projects.find(p=>p.id===body.p_project && p.workspace_id===body.p_workspace);
  const workspace = tables.studio_workspaces.find(w=>w.id===body.p_workspace && w.owner_id===body.p_actor);
  if (!project || !workspace) return send({status:'not_found'});
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const prior = tables.studio_canvas_commits.find(c=>c.project_id===body.p_project && c.request_id===body.p_request_id);
  if (prior) return send(prior.hash===hash ? {status:'replayed',version:tables.studio_versions.find(v=>v.id===prior.version_id)} : {status:'idempotency_conflict'});
  const head = tables.studio_versions.filter(v=>v.project_id===body.p_project).at(-1);
  if ((head?.id || null)!==body.p_expected) return send({status:'conflict',currentVersionId:head?.id || null});
  if (body.p_parent && !tables.studio_versions.some(v=>v.id===body.p_parent && v.project_id===body.p_project)) return send({status:'invalid_parent'});
  const version = {id:randomUUID(),project_id:body.p_project,workspace_id:body.p_workspace,parent_version_id:body.p_parent,document:body.p_document,feedback:body.p_feedback,model:body.p_model,input_tokens:body.p_input,output_tokens:body.p_output,created_at:new Date(Math.max(Date.now(),head ? Date.parse(head.created_at)+1 : 0)).toISOString()};
  tables.studio_versions.push(version);
  tables.studio_canvas_commits.push({project_id:body.p_project,request_id:body.p_request_id,version_id:version.id,hash});
  return send({status:'committed',version});
 }
 // Mirrors commit_studio_screen: a new screen (p_screen null) or the next version of one, with optimistic concurrency.
 if (url.pathname === '/rest/v1/rpc/commit_studio_screen') {
  if (!admin) return send({},403);
  const project = tables.studio_projects.find(p=>p.id===body.p_project && p.workspace_id===body.p_workspace);
  if (!project) return send({status:'not_found'});
  let screen = body.p_screen ? tables.studio_screens.find(row=>row.id===body.p_screen && row.project_id===project.id && !row.deleted_at) : null;
  if (body.p_screen && !screen) return send({status:'not_found'});
  if ((screen?.head_version_id || null)!==body.p_expected) return send({status:'conflict',currentVersionId:screen?.head_version_id || null});
  const now = new Date().toISOString();
  if (!screen) { screen = {id:randomUUID(),project_id:project.id,workspace_id:project.workspace_id,name:body.p_document.name,device:body.p_document.device,x:body.p_x ?? tables.studio_screens.filter(row=>row.project_id===project.id&&!row.deleted_at).reduce((right,row)=>Math.max(right,row.x+({mobile:375,tablet:768,desktop:1440}[row.device]||375)+160),0),y:body.p_y ?? 0,head_version_id:null,deleted_at:null,created_at:now,updated_at:now}; tables.studio_screens.push(screen); }
  const version = {id:randomUUID(),screen_id:screen.id,project_id:project.id,workspace_id:project.workspace_id,document:body.p_document,feedback:body.p_feedback,model:body.p_model,input_tokens:body.p_input,output_tokens:body.p_output,created_at:now};
  tables.studio_screen_versions.push(version);
  Object.assign(screen,{head_version_id:version.id,name:body.p_document.name,updated_at:now});
  return send({status:'committed',screen,version});
 }
 // Seeds a board screen with its first version, as a finished agent task would.
 if (url.pathname === '/testing/screen' && req.method === 'POST') {
  const project = tables.studio_projects.find(row => row.id === body.project_id);
  if (!project) return send({ message: 'Project not found' }, 404);
  const now = new Date().toISOString(), screenId = body.screen_id || randomUUID(), versionId = randomUUID();
  let screen = tables.studio_screens.find(row => row.id === screenId);
  if (!screen) { screen = { id: screenId, project_id: project.id, workspace_id: project.workspace_id, name: body.document.name, device: body.document.device, x: body.x ?? 0, y: body.y ?? 0, deleted_at: null, created_at: now }; tables.studio_screens.push(screen); }
  tables.studio_screen_versions.push({ id: versionId, screen_id: screenId, project_id: project.id, workspace_id: project.workspace_id, document: body.document, feedback: body.feedback || 'Generated', model: 'test', input_tokens: 0, output_tokens: 0, created_at: now });
  Object.assign(screen, { head_version_id: versionId, name: body.document.name, updated_at: now });
  return send(screen);
 }
 // Seeds or advances one live agent task with its private pipeline draft.
 if (url.pathname === '/testing/live' && req.method === 'POST') {
  const project = tables.studio_projects.find(row => row.id === body.project_id);
  if (!project) return send({ message: 'Project not found' }, 404);
  const now = new Date().toISOString();
  let task = tables.studio_tasks.find(row => row.id === body.task_id);
  if (!task) { task = { id: body.task_id, project_id: project.id, workspace_id: project.workspace_id, parent_task_id: null, agent_role: 'ui_designer', instruction: 'Design the home screen', status: 'running', created_at: now }; tables.studio_tasks.push(task); }
  Object.assign(task, { status: body.status || 'running', updated_at: now }, body.instruction ? { instruction: body.instruction } : {});
  tables.studio_pipeline_drafts = tables.studio_pipeline_drafts.filter(row => row.task_id !== task.id);
  tables.studio_pipeline_drafts.push({ task_id: task.id, project_id: project.id, workspace_id: project.workspace_id, state: body.state, updated_at: now });
  return send({ ok: true });
 }
 if (url.pathname === '/testing/version' && req.method === 'POST') {
  const project = tables.studio_projects.find(row => row.id === body.project_id);
  if (!project) return send({ message: 'Project not found' }, 404);
  const version = { ...body, workspace_id: project.workspace_id };
  tables.studio_versions.push(version); return send(version);
 }
 if(url.pathname==='/testing/assets'&&req.method==='POST'){
  const project=tables.studio_projects.find(row=>row.id===body.project_id);
  if(!project)return send({},404);
  const paths=Array.from({length:body.count||1},()=>`${project.workspace_id}/${project.id}/${randomUUID()}`);
  paths.forEach(path=>storageFiles.add(path));failedStorageDeletes=body.failDeletes||0;
  return send({paths});
 }
 if(url.pathname==='/testing/assets')return send({paths:[...storageFiles]});
 if(url.pathname==='/storage/v1/bucket/studio-assets')return admin?send({id:'studio-assets',name:'studio-assets',public:false}):send({},403);
 if(url.pathname==='/storage/v1/object/list/studio-assets'){
  if(!admin)return send({},403);
  return send([...storageFiles].filter(path=>path.startsWith(body.prefix+'/')).slice(0,body.limit||100).map(path=>({id:path.split('/').at(-1),name:path.split('/').at(-1),metadata:{}})));
 }
 if(url.pathname==='/storage/v1/object/studio-assets'&&req.method==='DELETE'){
  if(!admin)return send({},403);
  if(failedStorageDeletes>0){failedStorageDeletes--;return send({message:'Storage unavailable',statusCode:'503'},503);}
  const removed=body.prefixes.map(path=>({name:path}));body.prefixes.forEach(path=>storageFiles.delete(path));return send(removed);
 }
 if (!authenticated && !admin) return send({ message: 'Unauthorized' }, 401);
 const name = url.pathname.split('/').pop();
 if (!Object.hasOwn(tables, name)) return send({ message: 'Not found' }, 404);
 if(name==='studio_projects'&&req.method==='GET'&&projectReadDelay&&url.searchParams.get('id')===`eq.${projectReadDelay.id}`){const delay=projectReadDelay.ms;projectReadDelay=null;await new Promise(resolve=>setTimeout(resolve,delay));}
 const matches = row => [...url.searchParams].every(([field, value]) => value.startsWith('eq.') ? String(row[field]) === value.slice(3) : value.startsWith('gte.') ? String(row[field]) >= value.slice(4)
  : value.startsWith('in.(') ? value.slice(4, -1).split(',').map(item => item.replace(/^"|"$/g, '')).includes(String(row[field])) : value === 'is.null' ? row[field] == null : true);
 if (req.method === 'PATCH') {
  const updated = tables[name].filter(matches);
  updated.forEach(row => Object.assign(row, body));
  if (req.headers.accept?.includes('vnd.pgrst.object')) return updated.length === 1 ? send(updated[0]) : send({ code: 'PGRST116', details: 'The result contains ' + updated.length + ' rows' }, 406);
  return send(updated);
 }
 if (req.method === 'POST') {
  const incoming = Array.isArray(body) ? body[0] : body;
  if (name === 'studio_workspaces' && tables[name].some(row => row.owner_id === incoming.owner_id)) return send({ code: '23505', message: 'Duplicate owner' }, 409);
  if (name === 'studio_keys') {
   if (!admin || !incoming.ciphertext?.startsWith('v1.')) return send({ message: 'Encrypted storage required' }, 403);
   tables[name] = tables[name].filter(row => row.workspace_id !== incoming.workspace_id);
  }
  const inserted = { id: randomUUID(), name: 'My creative studio', created_at: new Date().toISOString(), ...incoming };
  tables[name].push(inserted);
  // PostgREST returns the inserted row, rather than every existing table row.
  return send(req.headers.accept?.includes('vnd.pgrst.object') ? inserted : [inserted]);
 }
 if(req.method==='DELETE'){
  const deleted=tables[name].filter(matches);tables[name]=tables[name].filter(row=>!matches(row));
  if(name==='studio_projects')for(const key of ['studio_versions','studio_agent_notes','studio_agent_messages','studio_canvas_commits','studio_tasks'])tables[key]=tables[key].filter(row=>!deleted.some(project=>project.id===row.project_id));
  return send(null);
 }
 let rows = tables[name].filter(matches);
 if (url.searchParams.get('order')?.includes('desc')) rows = [...rows].reverse();
 const select = url.searchParams.get('select');
 if (select && select !== '*') rows = rows.map(row => {
  const columns = select.replace(/studio_versions\([^)]*\)/, '').replace(/studio_projects\([^)]*\)/, '').split(',').filter(Boolean);
  const result = Object.fromEntries(columns.map(key => [key, row[key]]));
  if (select.includes('studio_versions(')) {
   const latest = tables.studio_versions.filter(version => version.project_id === row.id)
    .sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
   result.studio_versions = latest ? [Object.fromEntries(['kind','brand','headline','palette','cta'].map(key => [key, latest.document[key] || null]))] : [];
  }
  if(select.includes('studio_projects('))result.studio_projects={name:tables.studio_projects.find(p=>p.id===row.project_id)?.name};
  return result;
 });
 const offset = Number(url.searchParams.get('offset') || 0);
 const limit = Number(url.searchParams.get('limit') || rows.length);
 rows = rows.slice(offset, offset + limit);
 if (req.headers.accept?.includes('vnd.pgrst.object')) return rows.length === 1 ? send(rows[0]) : send({ code: 'PGRST116', details: 'The result contains ' + rows.length + ' rows' }, 406);
 send(rows);
});
server.listen(3199, '127.0.0.1');

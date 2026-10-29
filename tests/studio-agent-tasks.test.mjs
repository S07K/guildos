import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { blankCanvas } from '../src/lib/studio/canvas.ts';
import { validateProposal, proposeCanvasWork, ProviderFailure } from '../src/lib/studio/agents/proposal.ts';
import { runNextTask } from '../src/lib/studio/agents/worker.ts';
import { sealKey } from '../src/lib/studio/vault.mjs';

const node={id:'title',type:'text',parentId:'screen',layoutMode:'VERTICAL',primaryAxisSizingMode:'HUG',counterAxisSizingMode:'FILL',padding:0,itemSpacing:0,properties:{name:'Title',text:'Order lunch',color:'text',fontSize:32,fontWeight:600}};
const screen={id:'screen',parentId:null,type:'container',properties:{name:'Home screen',screenPreset:'mobile'}};
const primary={id:'order',parentId:'screen',type:'button',properties:{text:'Order now'}};
const proposal={mode:'edit',summary:'A first food ordering headline is ready for review.',upsert_nodes:[screen,node,primary],delete_ids:[]};
test('provider proposals become validated canvas commands and refuse unsafe or inconsistent output',async()=>{
 const result=validateProposal(proposal,blankCanvas());assert.equal(result.commands[0].type,'create');assert.equal(result.document.nodes.find(node=>node.id==='title').text,'Order lunch');
 assert.throws(()=>validateProposal({...proposal,mode:'reply'},blankCanvas()),/Invalid component proposal/);
 assert.throws(()=>validateProposal({...proposal,upsert_nodes:[{...node,x:20}]},blankCanvas()));
 assert.throws(()=>validateProposal({...proposal,upsert_nodes:[node,node]},blankCanvas()));
 const input={key:'test-only',model:'gpt-4.1-mini',role:'ui_designer',instruction:'Build food ordering',brief:'A cafe app',document:blankCanvas(),notes:[]};
 const output=await proposeCanvasWork(input,async(url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
  return Response.json({status:'completed',model:input.model,usage:{input_tokens:10,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(proposal)}]}]});
 });assert.equal(output.input_tokens,10);
 for(const response of [Response.json({}, {status:429}),Response.json({status:'incomplete'}),Response.json({status:'completed',usage:{input_tokens:1,output_tokens:1},output:[{type:'message',content:[{type:'refusal'}]}]})]) await assert.rejects(proposeCanvasWork(input,async()=>response));
});

test('assigned actions retry empty replies with edit-only instructions and preserve valid changes',async()=>{
 const progress=[];
 const input={key:'test',model:'test',role:'ux_architect',instruction:'Create the home heading',brief:'Cafe',document:blankCanvas(),notes:[],requireEdits:true,onProgress:async message=>progress.push(message)};
 let calls=0;
 const result=await proposeCanvasWork(input,async(_url,options)=>{
  const body=JSON.parse(options.body);
  assert.deepEqual(body.text.format.schema.properties.mode.enum,['edit']);
  assert.match(body.instructions,/must return mode edit/);
  assert.doesNotMatch(body.instructions,/For questions or requests needing clarification/);
  calls++;
  if(calls===2)assert.match(body.instructions,/Both operation arrays were empty/);
  return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(calls===1?{mode:'edit',summary:'I will create a heading.',upsert_nodes:[],delete_ids:[]}:proposal)}]}]});
 });
 assert.equal(calls,2);assert.equal(result.mode,'edit');assert.equal(result.document.nodes.find(node=>node.id==='title').id,'title');
 assert.equal(result.input_tokens,20);assert.equal(progress.length,1);
});

test('persistently empty actions allow provider fallback without claiming canvas rejection',async()=>{
 let calls=0;
 await assert.rejects(proposeCanvasWork({key:'test',model:'test',provider:'groq',role:'ux_architect',instruction:'Create heading',brief:'Cafe',document:blankCanvas(),notes:[],requireEdits:true},async()=>{
  calls++;
  return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({mode:'edit',summary:'Ready.',upsert_nodes:[],delete_ids:[]})}]}]});
 }),error=>{
  assert.equal(error.retryable,false);assert.equal(error.fallbackable,true);
  assert.match(error.message,/Groq returned no editing operations/);assert.doesNotMatch(error.message,/canvas rejected/);return true;
 });
 assert.equal(calls,2);
});

test('required editing actions also accept delete-only operations',async()=>{
 const document=validateProposal(proposal,blankCanvas()).document;
 const result=await proposeCanvasWork({key:'test',model:'test',role:'ui_designer',instruction:'Delete title',brief:'Cafe',document,notes:[],requireEdits:true},async()=>Response.json({status:'completed',usage:{input_tokens:10,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({mode:'edit',summary:'Remove title.',upsert_nodes:[],delete_ids:['title']})}]}]}));
 assert.equal(result.mode,'edit');assert.equal(result.document.nodes.length,2);
});

test('an unknown component field is corrected on one bounded repair attempt',async()=>{
 let calls=0;
 const result=await proposeCanvasWork({key:'test',model:'test',role:'ui_designer',instruction:'Add a heading',brief:'Cafe',document:blankCanvas(),notes:[],requireEdits:true},async(_url,options)=>{
  calls++;
  if(calls===2)assert.match(JSON.parse(options.body).instructions,/previous proposal failed validation/);
  return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(calls===1?{...proposal,upsert_nodes:[{...node,x:50}]}:proposal)}]}]});
 });
 assert.equal(calls,2);assert.equal(result.document.nodes[0].flow,true);assert.equal(result.input_tokens,20);
});

test('Groq agent tasks omit the unsupported store parameter',async()=>{
 const requests=[];
 const request=async(url,options)=>{
  const body=JSON.parse(options.body);
  assert.equal(url,'https://api.groq.com/openai/v1/responses');
  assert.equal(Object.hasOwn(body,'store'),false);
  requests.push(body);
  const value=body.text.format.name==='agent_assignment'
   ? {mode:'edit',summary:'Mira will design the screen.',assignments:[{assignee_role:'ui_designer',assignment:'Design the screen.'}]}
   : proposal;
  return Response.json({status:'completed',model:body.model,usage:{input_tokens:10,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
 };
 const base={key:'test-only',model:'openai/gpt-oss-120b',instruction:'Build food ordering',brief:'A cafe app',document:blankCanvas(),provider:'groq'};
 await proposeCanvasWork({...base,role:'ui_designer',notes:[]},request);
 assert.deepEqual(requests.map(body=>body.text.format.name),['canvas_proposal']);
 assert.equal(requests[0].max_output_tokens,3000);
 await assert.rejects(proposeCanvasWork({...base,role:'ui_designer',notes:[]},async()=>Response.json({error:{code:'rate_limit_exceeded'}},{status:413})),error=>{
  assert.match(error.message,/token-per-minute limit/);
  assert.equal(error.fallbackable,true);
  return true;
 });
});

test('OpenRouter truncation retries a compact action without increasing the output budget',async()=>{
 const limits=[],progress=[];
 const input={key:'test-only',model:'test-model',provider:'openrouter',role:'ui_designer',instruction:'Build the screens',brief:'Food ordering',document:blankCanvas(),notes:[],onProgress:async message=>{progress.push(message);}};
 const result=await proposeCanvasWork(input,async(_url,options)=>{
  limits.push(JSON.parse(options.body).max_output_tokens);
  if(limits.length===1)return Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:100,output_tokens:7000},output:[{type:'message',content:[{type:'output_text',text:'{"mode":"edit",'}]}]});
  return Response.json({status:'completed',model:'test-model',usage:{input_tokens:110,output_tokens:500},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(proposal)}]}]});
 });
 assert.deepEqual(limits,[4000,4000]);
 assert.equal(result.input_tokens,210);assert.equal(result.output_tokens,7500);
 assert.equal(result.document.nodes.length,3);assert.match(progress[0],/compact payload/);
});

test('persistent truncation stops identical queue retries and permits provider fallback',async()=>{
 const limits=[];
 await assert.rejects(proposeCanvasWork({key:'test-only',model:'test-model',provider:'openrouter',role:'ui_designer',instruction:'Build screens',brief:'Food ordering',document:blankCanvas(),notes:[]},async(_url,options)=>{
  const limit=JSON.parse(options.body).max_output_tokens;limits.push(limit);
  return Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:10,output_tokens:limit}});
 }),error=>{assert.equal(error.retryable,false);assert.equal(error.fallbackable,true);assert.match(error.message,/4000 output tokens/);return true;});
 assert.deepEqual(limits,[4000,4000]);
});

test('content filtering and missing usage are not mislabeled as output truncation',async()=>{
 const input={key:'test-only',model:'test-model',provider:'openrouter',role:'ui_designer',instruction:'Build screens',brief:'Food ordering',document:blankCanvas(),notes:[]};
 let calls=0;
 await assert.rejects(proposeCanvasWork(input,async()=>{calls++;return Response.json({status:'incomplete',incomplete_details:{reason:'content_filter'}});}),error=>{assert.equal(error.retryable,false);assert.match(error.message,/content filter/);return true;});
 assert.equal(calls,1);
 await assert.rejects(proposeCanvasWork(input,async()=>Response.json({status:'completed',output:[]})),/valid token usage/);
});

// A narrow Supabase-shaped adapter executes actual SQL for worker integration.
function adapter(db){
 return {
  async rpc(name,args){try{const keys=Object.keys(args);const result=await db.query(`select ${name}(${keys.map((key,i)=>`${key}=>$${i+1}`).join(',')}) as data`,keys.map(key=>typeof args[key]==='object'&&args[key]!==null?JSON.stringify(args[key]):args[key]));return {data:result.rows[0].data,error:null};}catch(error){return {data:null,error};}},
  from(table){let fields='*',conditions=[],values=[],orders=[],count,one=false;
   const query={select(v){fields=v;return query;},insert(row){const keys=Object.keys(row);return db.query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_,i)=>`$${i+1}`).join(',')})`,keys.map(key=>row[key])).then(()=>({data:null,error:null}),error=>({data:null,error}));},eq(k,v){values.push(v);conditions.push(`${k}=$${values.length}`);return query;},lte(k,v){values.push(v);conditions.push(`${k}<=$${values.length}`);return query;},order(k,{ascending=true}={}){orders.push(`${k} ${ascending?'asc':'desc'}`);return query;},limit(v){count=v;return query;},single(){one=true;return query;},maybeSingle(){one=true;return query;},async then(resolve,reject){try{const result=await db.query(`select ${fields} from ${table}${conditions.length?' where '+conditions.join(' and '):''}${orders.length?' order by '+orders.join(','):''}${count?' limit '+count:''}`,values);return resolve({data:one?result.rows[0]||null:result.rows,error:null});}catch(error){return resolve({data:null,error});}}};return query;
  },
 };
}

test('sequential pipeline checkpoints privately, fences publication, resumes credits and publishes once after QA',async()=>{
 const db=new PGlite();const alice=randomUUID(),bob=randomUUID();const secret='c'.repeat(64);const priorSecret=process.env.STUDIO_VAULT_KEY;process.env.STUDIO_VAULT_KEY=secret;
 try{
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
  for(const file of ['202610110001_studio.sql','202610140001_studio_agent_notes.sql','202610140002_studio_agent_messages.sql','202610160002_studio_canvas_commits.sql','202610160003_studio_agent_tasks.sql','202610160004_studio_task_activity.sql','202610160005_studio_openrouter.sql','202610160006_studio_openrouter_free_default.sql','202610160007_studio_agent_subtasks.sql','202610160008_studio_agent_job_queue.sql','202610160009_studio_groq.sql','202610160010_studio_generation_wait_reason.sql','202610180001_studio_small_actions.sql','202610180002_studio_component_actions.sql','202610190001_studio_agent_handoffs.sql','202610190002_studio_handoff_action_limits.sql','202610200001_studio_sequential_pipeline.sql','202610290001_separate_note_display.sql']){const sql=await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');await db.exec(sql);}
  await db.query('insert into auth.users values($1),($2)',[alice,bob]);
  const wa=(await db.query('insert into studio_workspaces(owner_id) values($1) returning id',[alice])).rows[0].id;
  const wb=(await db.query('insert into studio_workspaces(owner_id) values($1) returning id',[bob])).rows[0].id;
  const project=(await db.query("insert into studio_projects(workspace_id,name,brief,cta_url) values($1,'Food','Build a food ordering application','https://example.com') returning id",[wa])).rows[0].id;
  await db.query('insert into studio_keys(workspace_id,ciphertext,suffix) values($1,$2,$3)',[wa,sealKey('test-only',wa,secret),'only']);
  await db.exec('SET ROLE service_role');const client=adapter(db);
  const rpc=async(name,args)=>{const result=await client.rpc(name,args);if(result.error)throw result.error;return result.data;};
  const enqueue=(request=randomUUID(),actor=alice)=>rpc('enqueue_studio_task',{p_project:project,p_actor:actor,p_request:request,p_text:'@Mira build a food app',p_role:'ui_designer',p_version:null});
  const displayRequest=randomUUID();
  const displayArgs={p_project:project,p_actor:alice,p_request:displayRequest,p_text:'Revise the completed work for: original\nRequested changes:  Make it blue  ',p_role:'ui_designer',p_version:null,p_display:'  Make it blue  '};
  const separated=await rpc('enqueue_studio_task',displayArgs);
  assert.equal(separated.note.body,displayArgs.p_display);assert.equal(separated.task.instruction,displayArgs.p_text);
  assert.equal((await rpc('enqueue_studio_task',displayArgs)).status,'replayed');
  assert.equal((await rpc('enqueue_studio_task',{...displayArgs,p_display:'different'})).status,'conflict');
  await db.query('delete from studio_tasks where id=$1',[separated.task.id]);
  await db.query('delete from studio_agent_notes where id=$1',[separated.note.id]);
  const request=randomUUID();const first=await enqueue(request);assert.equal(first.status,'queued');assert.equal((await enqueue(request)).task.id,first.task.id);
  assert.equal((await enqueue(randomUUID(),bob)).status,'not_found');
  const roles=[];
  const propose=async input=>{
   roles.push(input.role);
   const upsert_nodes=input.role==='ux_architect'?[{...screen,layoutMode:'VERTICAL'}]:input.role==='ui_designer'?[node,primary]:[];
   return {...validateProposal({...proposal,upsert_nodes},input.document,[],input.targetScreenId,true),stageComplete:true,model:'test',input_tokens:10,output_tokens:20};
  };
  let audits=0;
  const audit=async()=>({summary:'Read-only audit',issues:audits++===0?Array.from({length:23},(_,i)=>({agent_role:'ui_designer',message:`Specific layout issue ${i}`})):[],model:'test',input_tokens:1,output_tokens:2});
  const work=()=>runNextTask(client,propose,undefined,audit);
  for(let stage=0;stage<4;stage++){
   await work();
   assert.equal((await db.query('select count(*)::int n from studio_versions')).rows[0].n,0);
   assert.equal((await db.query('select state from studio_pipeline_drafts where task_id=$1',[first.task.id])).rows[0].state.stage,stage+1);
  }
  // A second prompt must not interleave with a private draft between checkpoints.
  const second=(await enqueue()).task;
  await work();
  let state=(await db.query('select state from studio_pipeline_drafts where task_id=$1',[first.task.id])).rows[0].state;
  assert.equal(state.stage,2);assert.equal(state.issues.length,23);assert.equal(state.round,1);
  assert.equal((await db.query('select count(*)::int n from studio_versions')).rows[0].n,0);
  // Credits can run out mid-turn. No stage is lost, and reset resumes automatically.
  await db.query('update studio_generation_limits set attempts=30,lease_until=now() where workspace_id=$1',[wa]);
  await work();assert.equal((await db.query('select state from studio_pipeline_drafts where task_id=$1',[first.task.id])).rows[0].state.stage,2);
  await db.query('update studio_generation_limits set attempts=0 where workspace_id=$1',[wa]);
  await db.query('update studio_tasks set available_at=now() where id=$1',[first.task.id]);
  // Reject stage skipping and premature publication, including old worker payloads.
  const token=randomUUID();const claimed=await rpc('claim_studio_task',{p_token:token});assert.equal(claimed.id,first.task.id);
  await assert.rejects(rpc('checkpoint_studio_pipeline',{p_task:first.task.id,p_token:token,p_previous:state,p_next:{...state,stage:5},p_summary:'skip',p_model:'test',p_input:0,p_output:0}),/cannot be skipped/);
  await assert.rejects(rpc('finish_studio_task',{p_task:first.task.id,p_token:token,p_result:{mode:'edit',summary:'too early',document:state.document,commands:state.commands,expectedVersionId:null,model:'test',input_tokens:0,output_tokens:0}}),/QA-approved/);
  assert.equal((await rpc('checkpoint_studio_pipeline',{p_task:first.task.id,p_token:randomUUID(),p_previous:state,p_next:state,p_summary:'stale',p_model:'test',p_input:0,p_output:0})).status,'stale');
  await rpc('defer_studio_task',{p_task:first.task.id,p_token:token,p_reason:'Test release',p_budget:true});
  await db.query('update studio_tasks set available_at=now() where id=$1',[first.task.id]);
  await work();await work();await work();
  assert.deepEqual(roles,['ux_architect','creative_director','ui_designer','copywriter','ui_designer','copywriter']);
  assert.equal((await db.query('select count(*)::int n from studio_versions')).rows[0].n,1);
  const completed=(await db.query('select * from studio_tasks where id=$1',[first.task.id])).rows[0];
  assert.equal(completed.status,'review');assert.ok(completed.result_version_id);
  assert.equal((await db.query('select status from studio_tasks where id=$1',[second.id])).rows[0].status,'queued');
  await assert.rejects(rpc('delegate_studio_task',{p_task:second.id,p_token:randomUUID(),p_assignments:[],p_summary:'legacy',p_model:'test',p_input:0,p_output:0}),/sequential pipeline/);
  // Cancellation fences a worker even while its private checkpoint exists.
  await work();
  const cancelledToken=randomUUID();await rpc('claim_studio_task',{p_token:cancelledToken});
  const privateState=(await db.query('select state from studio_pipeline_drafts where task_id=$1',[second.id])).rows[0].state;
  await rpc('control_studio_task',{p_task:second.id,p_actor:alice,p_action:'cancel'});
  assert.equal((await rpc('checkpoint_studio_pipeline',{p_task:second.id,p_token:cancelledToken,p_previous:privateState,p_next:{...privateState,stage:2},p_summary:'late result',p_model:'test',p_input:0,p_output:0})).status,'stale');
  assert.equal((await db.query('select count(*)::int n from studio_versions')).rows[0].n,1);
  await rpc('control_studio_task',{p_task:second.id,p_actor:alice,p_action:'retry'});
  assert.equal((await db.query('select count(*)::int n from studio_pipeline_drafts where task_id=$1',[second.id])).rows[0].n,0);
  await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[alice]);await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query('select * from studio_pipeline_drafts'));
 }finally{if(priorSecret===undefined)delete process.env.STUDIO_VAULT_KEY;else process.env.STUDIO_VAULT_KEY=priorSecret;await db.close();}
});

test('specialists cannot emit ad hoc handoffs',()=>{
 assert.throws(()=>validateProposal({mode:'edit',summary:'Need help',upsert_nodes:[],delete_ids:[],handoff:{agent_role:'ux_architect',instruction:'Help'}},blankCanvas()),/cannot hand off/);
});

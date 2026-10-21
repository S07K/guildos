import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { runGuild } from '../src/lib/studio/guild.ts';
import { ProviderCapacityError, withProviderFallback, preferredProvider } from '../src/lib/studio/provider-fallback.ts';

const design = { brand: 'Cove', eyebrow: 'Space to think', headline: 'Good work starts here.', description: 'A studio for small creative teams.', cta: 'Book a visit', style: 'editorial', palette: 'ocean', features: [{ title: 'Space', description: 'Room for your work.' }, { title: 'Community', description: 'Meet other makers.' }, { title: 'Focus', description: 'Quiet when you need it.' }], closingTitle: 'Find your space.', closingDescription: 'Come see the studio.', designNotes: 'A quiet editorial direction.' };

test('provider fallback retries a connected alternative only after a capacity error', async () => {
 const calls = [];
 const result = await withProviderFallback({ preferred: 'api', available: { api: true, chatgpt: true }, run: async provider => {
  calls.push(provider);
  if (provider === 'api') throw new ProviderCapacityError('api', 'OpenAI usage limit reached.');
  return 'completed';
 } });
 assert.deepEqual(calls, ['api', 'chatgpt']);
 assert.equal(result.value, 'completed');
 assert.equal(result.provider, 'chatgpt');
 assert.equal(result.switchedFrom, 'api');
});

test('provider fallback leaves non-capacity failures alone', async () => {
 const calls = [];
 await assert.rejects(withProviderFallback({ preferred: 'api', available: { api: true, chatgpt: true }, run: async provider => {
  calls.push(provider);
  throw new Error('The API key is invalid.');
 } }), /API key is invalid/);
 assert.deepEqual(calls, ['api']);
});

const component=(id,type,parentId=null,properties={})=>({id,parentId,type,layoutMode:'VERTICAL',primaryAxisSizingMode:'HUG',counterAxisSizingMode:'FILL',padding:16,itemSpacing:8,properties});
function guildResponse(payload){
 if(payload.text.format.name==='pipeline_audit')return {summary:'Complete screen passes QA.',issues:[]};
 const instruction=payload.instructions;
 const nodes=instruction.includes('UX Architecture Agent')?[component('screen','container'),component('content','container','screen')]
  :instruction.includes('UI Design Agent')?[component('headline','text','content',{text:'Welcome to Cove'}),component('cta','button','content',{text:'Visit',backgroundColor:'accent',color:'on-accent'})]
  :instruction.includes('Copywriting Agent')?[component('cta','button','content',{text:'Book a visit',backgroundColor:'accent',color:'on-accent'})]:[];
 return {mode:'edit',summary:'Updated the requested component.',upsert_nodes:nodes,delete_ids:[],handoff:null,stage_complete:true};
}
test('guild follows the five-stage pipeline and returns only the QA-approved turn',async()=>{
 const calls=[];
 const result=await runGuild({key:'test',brief:'A thoughtful workspace page',discussion:[{author_role:'human',mentioned_role:'copywriter',anchor:'hero',body:'Make the CTA clearer.'}]},async(_url,options)=>{
  const payload=JSON.parse(options.body);calls.push(payload);
  if(payload.instructions.includes('UI Design Agent')){
   const context=JSON.parse(payload.input);assert.equal(context.current_canvas.nodes.length,2);assert.equal(context.recent_discussion[0].body,'Make the CTA clearer.');
  }
  return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:5},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(guildResponse(payload))}]}]});
 });
 assert.equal(calls.length,5);assert.equal(result.notes.length,5);
 assert.deepEqual(result.notes.map(note=>note.author_role),['ux_architect','creative_director','ui_designer','copywriter','qa_critic']);
 assert.equal(result.input_tokens,50);assert.equal(result.output_tokens,25);
 assert.equal(result.document.nodes.find(node=>node.id==='cta').text,'Book a visit');assert.ok(result.document.nodes.every(node=>node.flow));
 for(const call of calls.slice(0,4))assert.deepEqual(call.text.format.schema,calls[1].text.format.schema);
});

test('Groq guild requests omit the unsupported store parameter',async()=>{
 let calls=0;
 await runGuild({key:'test',brief:'Cafe app',model:'openai/gpt-oss-120b',provider:'groq'},async(url,options)=>{
  const payload=JSON.parse(options.body);calls++;
  assert.equal(url,'https://api.groq.com/openai/v1/responses');assert.equal(Object.hasOwn(payload,'store'),false);
  return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:5},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(guildResponse(payload))}]}]});
 });assert.equal(calls,5);
});

test('agent comments are tenant scoped and cannot point at another project version', async () => {
 const db = new PGlite();
 const alice = '00000000-0000-4000-8000-000000000001';
 const bob = '00000000-0000-4000-8000-000000000002';
 try {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
  await db.query('INSERT INTO auth.users VALUES ($1), ($2)', [alice, bob]);
  for (const file of ['202610110001_studio.sql', '202610140001_studio_agent_notes.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  await db.exec('SET ROLE service_role');
  const wa = (await db.query('INSERT INTO studio_workspaces(owner_id) VALUES ($1) RETURNING id', [alice])).rows[0].id;
  const wb = (await db.query('INSERT INTO studio_workspaces(owner_id) VALUES ($1) RETURNING id', [bob])).rows[0].id;
  const pa = (await db.query("INSERT INTO studio_projects(workspace_id,name,brief,cta_url) VALUES ($1,'Cove','A long enough creative brief for Cove.','https://example.com') RETURNING id", [wa])).rows[0].id;
  const pb = (await db.query("INSERT INTO studio_projects(workspace_id,name,brief,cta_url) VALUES ($1,'Other','A long enough creative brief for Other.','https://example.com') RETURNING id", [wb])).rows[0].id;
  const va = (await db.query("INSERT INTO studio_versions(project_id,workspace_id,document,model,input_tokens,output_tokens) VALUES ($1,$2,$3,'test',1,1) RETURNING id", [pa, wa, JSON.stringify(design)])).rows[0].id;
  const note = (await db.query("INSERT INTO studio_agent_notes(project_id,workspace_id,version_id,author_role,anchor,body) VALUES ($1,$2,$3,'qa_critic','hero','Check contrast') RETURNING id", [pa, wa, va])).rows[0].id;
  await assert.rejects(db.query("INSERT INTO studio_agent_notes(project_id,workspace_id,version_id,author_role,anchor,body) VALUES ($1,$2,$3,'qa_critic','hero','Wrong tenant')", [pb, wb, va]));
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [bob]);
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT * FROM studio_agent_notes WHERE id=$1', [note])).rows.length, 0);
  await assert.rejects(db.query("INSERT INTO studio_agent_notes(project_id,workspace_id,author_role,anchor,body) VALUES ($1,$2,'creative_director','hero','Impersonation')", [pb, wb]));
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [alice]);
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT * FROM studio_agent_notes WHERE id=$1', [note])).rows.length, 1);
 } finally { await db.close(); }
});


test('connected ChatGPT is preferred and falls back through Groq, OpenRouter, then OpenAI API',async()=>{
 const available={chatgpt:true,groq:true,openrouter:true,api:true},calls=[];
 assert.equal(preferredProvider(available),'chatgpt');
 assert.equal(preferredProvider({...available,chatgpt:false}),'groq');
 const result=await withProviderFallback({preferred:preferredProvider(available),available,run:async provider=>{
  calls.push(provider);if(provider!=='api')throw new ProviderCapacityError(provider,'Capacity exhausted.');return 'done';
 }});
 assert.deepEqual(calls,['chatgpt','groq','openrouter','api']);assert.equal(result.value,'done');
});

test('pipeline rejects ad hoc handoffs instead of executing another specialist out of order',async()=>{
 const called=[];
 await assert.rejects(runGuild({key:'test',brief:'A thoughtful workspace page'},async(_url,options)=>{
  const payload=JSON.parse(options.body);called.push(payload.instructions);
  let response=guildResponse(payload);
  if(payload.instructions.includes('UI Design Agent'))response={...response,upsert_nodes:[],handoff:{agent_role:'copywriter',instruction:'Skip ahead to copy'}};
  return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:5},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(response)}]}]});
 }),/cannot hand off/);
 assert.equal(called.some(instruction=>instruction.includes('Copywriting Agent')),false);
});

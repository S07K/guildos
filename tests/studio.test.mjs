import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { sealKey, openKey } from '../src/lib/studio/vault.mjs';
import { renderDesign, validDestination } from '../src/lib/studio/design.mjs';
import { runGuild } from '../src/lib/studio/guild.ts';

const design = { brand: 'Cove', eyebrow: 'Space to think', headline: 'Good work starts here.', description: 'A studio for small creative teams.', cta: 'Book a visit', style: 'editorial', palette: 'ocean', features: [{ title: 'Space', description: 'Room for your work.' }, { title: 'Community', description: 'Meet other makers.' }, { title: 'Focus', description: 'Quiet when you need it.' }], closingTitle: 'Find your space.', closingDescription: 'Come see the studio.', designNotes: 'A quiet editorial direction.' };

test('vault encrypts with randomized nonces and rejects tampering, wrong tenants and wrong secrets', () => {
 const secret = 'a'.repeat(64); const encrypted = sealKey('sk-private-key', 'workspace-a', secret);
 assert.notEqual(encrypted, sealKey('sk-private-key', 'workspace-a', secret));
 assert.ok(!encrypted.includes('sk-private-key'));
 assert.equal(openKey(encrypted, 'workspace-a', secret), 'sk-private-key');
 assert.throws(() => openKey(encrypted, 'workspace-b', secret));
 assert.throws(() => openKey(encrypted, 'workspace-a', 'b'.repeat(64)));
 const parts = encrypted.split('.'); parts[3] = Buffer.from('tampered').toString('base64');
 assert.throws(() => openKey(parts.join('.'), 'workspace-a', secret));
 assert.throws(() => sealKey('key', 'workspace', 'short'));
});

test('renderer escapes model content and restricts destinations and page themes', () => {
 const html = renderDesign({ ...design, headline: '<script>alert(1)</script>' }, 'https://example.com/join');
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('default-src'));
 const withoutDestination=renderDesign(design,null);
 assert.match(withoutDestination,/<button class="button" type="button" disabled>/);
 assert.doesNotMatch(withoutDestination,/href="(?:null|undefined)"/);
 assert.throws(()=>renderDesign(design,'javascript:alert(1)'));
 for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.com', 'https://name:secret@example.com']) assert.equal(validDestination(url), false);
 assert.throws(() => renderDesign({ ...design, palette: 'url(evil)' }, 'https://example.com'));
 assert.throws(() => renderDesign({ ...design, features: [] }, 'https://example.com'));
});

test('generated design sections can be reordered safely', () => {
 const html=renderDesign({...design,sectionOrder:['features','closing','hero']},'https://example.com');
 const positions=['class="features"','class="closing"','class="hero"'].map(section=>html.indexOf(section));
 assert.ok(positions[0]>=0&&positions[0]<positions[1]&&positions[1]<positions[2]);
 assert.throws(()=>renderDesign({...design,sectionOrder:['hero','hero','closing']},'https://example.com'));
});

test('generation and revision share the component pipeline and retain canvas context and total usage',async()=>{
 const payloads=[];
 const request=async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  const payload=JSON.parse(options.body);payloads.push(payload);assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);
  const root={id:'screen',parentId:null,type:'container',layoutMode:'VERTICAL',properties:{backgroundColor:'#ffffff'}};
  const nodes=payload.instructions.includes('UX Architecture Agent')?[root]:payload.instructions.includes('UI Design Agent')?[{id:'headline',parentId:'screen',type:'text',properties:{text:'Welcome'}},{id:'primary',parentId:'screen',type:'button',properties:{text:'Get started'}}]:[];
  const value=payload.text.format.name==='pipeline_audit'?{summary:'Passed',issues:[]}:{mode:'edit',summary:'Updated the screen.',upsert_nodes:nodes,delete_ids:[],handoff:null,stage_complete:true};
  return Response.json({status:'completed',model:'gpt-4.1-mini',usage:{input_tokens:300,output_tokens:200},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
 };
 const first=await runGuild({key:'test-only',brief:'Create a studio page.'},request);
 assert.equal(first.input_tokens,1500);assert.equal(first.document.kind,'canvas');
 assert.equal(JSON.parse(payloads[0].input).current_canvas.nodes.length,0);
 await runGuild({key:'test-only',brief:'Create a studio page.',previous:first.document,feedback:'Make it warmer.'},request);
 assert.equal(JSON.parse(payloads[5].input).instruction,'Make it warmer.');
 assert.equal(JSON.parse(payloads[5].input).current_canvas.nodes[0].id,'screen');
 for(const response of [Response.json({}, {status:401}),Response.json({}, {status:429}),Response.json({status:'incomplete'}),Response.json({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}),Response.json({status:'completed',output:[]})])await assert.rejects(runGuild({key:'test-only',brief:'test'},async()=>response));
});

test('studio RLS isolates tenants, protects credentials and versions, and enforces persistent generation locks', async () => {
 const db = new PGlite();
 const alice = '00000000-0000-4000-8000-000000000001';
 const bob = '00000000-0000-4000-8000-000000000002';
 try {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
  await db.query('INSERT INTO auth.users VALUES ($1), ($2)', [alice, bob]);
  const sql = await readFile(new URL('../supabase/migrations/202610110001_studio.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  async function asUser(id) { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]); await db.exec('SET ROLE authenticated'); }
  await asUser(alice);
  const wa = (await db.query('INSERT INTO studio_workspaces(owner_id) VALUES ($1) RETURNING id', [alice])).rows[0].id;
  const pa = (await db.query("INSERT INTO studio_projects(workspace_id,name,brief,cta_url) VALUES ($1,'Cove','A long enough creative brief for Cove.','https://example.com') RETURNING id", [wa])).rows[0].id;
  await asUser(bob);
  const wb = (await db.query('INSERT INTO studio_workspaces(owner_id) VALUES ($1) RETURNING id', [bob])).rows[0].id;
  assert.equal((await db.query('SELECT * FROM studio_projects WHERE id=$1', [pa])).rows.length, 0);
  await assert.rejects(db.query("INSERT INTO studio_projects(workspace_id,name,brief,cta_url) VALUES ($1,'attack','A long enough attack brief.','https://example.com')", [wa]));
  await db.query('DELETE FROM studio_projects WHERE id=$1', [pa]);
  await assert.rejects(db.query('SELECT * FROM studio_keys'));
  await assert.rejects(db.query('SELECT public.reserve_studio_generation($1,$2)', [wb, bob]));
  await db.exec('RESET ROLE; SET ROLE service_role');
  const va = (await db.query("INSERT INTO studio_versions(project_id,workspace_id,document,model,input_tokens,output_tokens) VALUES ($1,$2,$3,'test',1,1) RETURNING id", [pa, wa, JSON.stringify(design)])).rows[0].id;
  await assert.rejects(db.query("INSERT INTO studio_versions(project_id,workspace_id,document,model,input_tokens,output_tokens) VALUES ($1,$2,$3,'test',1,1)", [pa, wb, JSON.stringify(design)]));
  const reserve = async token => (await db.query('SELECT reserve_studio_generation($1,$2) AS allowed', [wa, token])).rows[0].allowed;
  assert.equal(await reserve(alice), true); assert.equal(await reserve(bob), false);
  await db.query('SELECT release_studio_generation($1,$2)', [wa, bob]); assert.equal(await reserve(bob), false);
  await db.query('SELECT release_studio_generation($1,$2)', [wa, alice]); assert.equal(await reserve(bob), true);
  await db.query("UPDATE studio_generation_limits SET attempts=30, lease_until=now()-interval '1 second' WHERE workspace_id=$1", [wa]); assert.equal(await reserve(alice), false);
  await db.query("UPDATE studio_generation_limits SET day=current_date-1 WHERE workspace_id=$1", [wa]); assert.equal(await reserve(alice), true);
  await asUser(bob); assert.equal((await db.query('SELECT * FROM studio_versions WHERE id=$1', [va])).rows.length, 0);
  await asUser(alice); assert.equal((await db.query('SELECT * FROM studio_projects WHERE id=$1', [pa])).rows.length, 1);
  assert.equal((await db.query('SELECT * FROM studio_versions WHERE id=$1', [va])).rows.length, 1);
  await assert.rejects(db.query("UPDATE studio_versions SET model='spoofed' WHERE id=$1", [va]));
  await db.exec('RESET ROLE; SET ROLE anon'); await assert.rejects(db.query('SELECT * FROM studio_projects'));
 } finally { await db.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { blankCanvas } from '../src/lib/studio/canvas.ts';
import { applyCanvasCommands } from '../src/lib/studio/canvas-commands.ts';

const node = { id:'title', type:'text', name:'Title', x:20, y:20, width:300, height:60, fill:'#202b38', stroke:'#ffffff', strokeWidth:0, radius:0, opacity:1, text:'Order lunch', fontSize:32, fontWeight:600 };
test('command batches compose without mutating the source and fail atomically', () => {
 const source = blankCanvas();
 const next = applyCanvasCommands(source, [{ type:'create', node }, { type:'update', id:'title', patch:{ text:'Choose your meal', x:40 } }, { type:'document', patch:{ background:'#fafafa' } }]);
 assert.equal(source.nodes.length, 0);
 assert.equal(next.nodes[0].text, 'Choose your meal');
 assert.equal(next.nodes[0].x, 40);
 assert.throws(() => applyCanvasCommands(next, [{type:'update',id:'title',patch:{text:'Changed'}},{type:'delete',id:'missing'}]), /not found/);
 assert.equal(next.nodes[0].text, 'Choose your meal');
 for (const commands of [[], [{type:'create',node}], [{type:'update',id:'title',patch:{id:'spoof'}}], [{type:'update',id:'title',patch:{width:-1}}], [{type:'reorder',ids:['missing']}], [{type:'document',patch:JSON.parse('{"__proto__":{}}')}], [{type:'execute',code:'no'}]]) {
  assert.throws(() => applyCanvasCommands(next, commands));
 }
});
test('deleting frames detaches children and reorder requires a permutation', () => {
 const frame = {...node,id:'frame',type:'frame',width:500,height:500,text:''};
 const doc = applyCanvasCommands(blankCanvas(), [{type:'create',node:frame},{type:'create',node:{...node,parentId:'frame'}},{type:'reorder',ids:['title','frame']}]);
 assert.deepEqual(doc.nodes.map(n=>n.id), ['title','frame']);
 const detached = applyCanvasCommands(doc,[{type:'delete',id:'frame'}]);
 assert.equal(detached.nodes[0].parentId, undefined);
 assert.equal(detached.nodes[0].x,20);
 assert.throws(() => applyCanvasCommands(doc,[{type:'reorder',ids:['title','title']}]), /every layer/);
 assert.throws(() => applyCanvasCommands(doc,[{type:'update',id:'frame',patch:{parentId:'frame'}}]), /parent/);
});

test('commits serialize revisions, replay safely, validate ancestry and isolate tenants', async () => {
 const db = new PGlite();
 const alice=randomUUID(), bob=randomUUID();
 try {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
  for (const file of ['202610110001_studio.sql','202610140001_studio_agent_notes.sql','202610140002_studio_agent_messages.sql','202610160001_studio_dashboard_indexes.sql','202610160002_studio_canvas_commits.sql']) {
   const sql = await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
   await db.exec(sql); await db.exec(sql);
  }
  await db.query('insert into auth.users values ($1),($2)',[alice,bob]);
  const workspace = async owner => (await db.query('insert into studio_workspaces(owner_id) values ($1) returning id',[owner])).rows[0].id;
  const wa=await workspace(alice), wb=await workspace(bob);
  const project = async w => (await db.query("insert into studio_projects(workspace_id,name,brief,cta_url) values ($1,'Food app','A food ordering application for local cafes','https://example.com') returning id",[w])).rows[0].id;
  const pa=await project(wa), pb=await project(wb);
  await db.exec('SET ROLE service_role');
  const commit = async ({p=pa,w=wa,actor=alice,key=randomUUID(),expected=null,parent=null,document=blankCanvas()}={}) => (await db.query("select commit_studio_version($1,$2,$3,$4,$5,$6,$7,'Edit','manual-edit',0,0,'[]') as result",[p,w,actor,key,expected,parent,JSON.stringify(document)])).rows[0].result;
  const key=randomUUID();
  const first=await commit({key});
  assert.equal(first.status,'committed');
  const replay=await commit({key});
  assert.equal(replay.status,'replayed'); assert.equal(replay.version.id,first.version.id);
  assert.equal((await commit({key,document:{...blankCanvas(),background:'#eeeeee'}})).status,'idempotency_conflict');
  const siblings=await Promise.all([commit({expected:first.version.id,parent:first.version.id}),commit({expected:first.version.id,parent:first.version.id})]);
  assert.deepEqual(siblings.map(r=>r.status).sort(),['committed','conflict']);
  const head=siblings.find(r=>r.status==='committed').version.id;
  assert.equal((await commit()).status,'conflict');
  // Replay remains stable even after newer work; no extra version is created.
  assert.equal((await commit({key})).version.id,first.version.id);
  assert.equal((await db.query('select count(*)::int as n from studio_versions where project_id=$1',[pa])).rows[0].n,2);
  const foreign=await commit({p:pb,w:wb,actor:bob});
  assert.equal((await commit({expected:head,parent:foreign.version.id})).status,'invalid_parent');
  assert.equal((await commit({p:pa,w:wb,actor:bob})).status,'not_found');
  assert.equal((await commit({actor:bob})).status,'not_found');
  // Restoring a historical version is allowed only with the actual current head.
  assert.equal((await commit({expected:head,parent:first.version.id})).status,'committed');
  await db.exec('RESET ROLE');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[bob]);
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('select * from studio_canvas_commits where project_id=$1',[pa])).rows.length,0);
  await assert.rejects(commit());
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query('select * from studio_canvas_commits'));
 } finally {await db.close();}
});

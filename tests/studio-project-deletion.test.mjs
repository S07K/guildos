import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('project deletion cascades through designs and agent work while preserving other projects and credentials',async()=>{
 const db=new PGlite();
 try{
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
  for(const file of ['202610110001_studio.sql','202610140001_studio_agent_notes.sql','202610140002_studio_agent_messages.sql','202610160002_studio_canvas_commits.sql','202610160003_studio_agent_tasks.sql','202610160004_studio_task_activity.sql','202610160007_studio_agent_subtasks.sql','202610160008_studio_agent_job_queue.sql','202610180001_studio_small_actions.sql','202610180002_studio_component_actions.sql','202610180003_studio_optional_destination.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  const alice=randomUUID(),bob=randomUUID();await db.query('insert into auth.users values($1),($2)',[alice,bob]);
  const workspace=async owner=>(await db.query('insert into studio_workspaces(owner_id) values($1) returning id',[owner])).rows[0].id;
  const wa=await workspace(alice),wb=await workspace(bob);
  const project=async workspace=>(await db.query("insert into studio_projects(workspace_id,name,brief) values($1,'Test','A project for testing deletion.') returning id",[workspace])).rows[0].id;
  const target=await project(wa),keep=await project(wa),foreign=await project(wb);
  assert.equal((await db.query('select cta_url from studio_projects where id=$1',[target])).rows[0].cta_url,null);
  await db.query("insert into studio_keys(workspace_id,ciphertext,suffix) values($1,'encrypted','test')",[wa]);
  const version=(await db.query("insert into studio_versions(project_id,workspace_id,document,model,input_tokens,output_tokens) values($1,$2,'{}','test',1,1) returning id",[target,wa])).rows[0].id;
  const note=(await db.query("insert into studio_agent_notes(project_id,workspace_id,version_id,author_role,anchor,body) values($1,$2,$3,'human','page','Build a screen') returning id",[target,wa,version])).rows[0].id;
  const task=(await db.query("insert into studio_tasks(project_id,workspace_id,actor_id,request_id,source_note_id,agent_role,instruction,result_version_id) values($1,$2,$3,$4,$5,'ui_designer','Build a screen',$6) returning id",[target,wa,alice,randomUUID(),note,version])).rows[0].id;
  await db.query("insert into studio_task_events(task_id,project_id,workspace_id,kind,body) values($1,$2,$3,'status','Queued')",[task,target,wa]);
  await db.query("insert into studio_task_subtasks(parent_task_id,project_id,workspace_id,step_key,agent_role,instruction,status) values($1,$2,$3,'one','copywriter','Write labels','queued')",[task,target,wa]);
  await db.query("insert into studio_agent_messages(project_id,workspace_id,agent_role,author_kind,body) values($1,$2,'ui_designer','agent','A draft')",[target,wa]);
  await db.query("insert into studio_canvas_commits(project_id,workspace_id,actor_id,request_id,request_hash,version_id) values($1,$2,$3,$4,'hash',$5)",[target,wa,alice,randomUUID(),version]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice]);await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('delete from studio_projects where id=$1 returning id',[foreign])).rows.length,0);
  assert.equal((await db.query('delete from studio_projects where id=$1 returning id',[target])).rows.length,1);
  await db.exec('RESET ROLE');
  for(const table of ['studio_versions','studio_agent_notes','studio_agent_messages','studio_canvas_commits','studio_tasks','studio_task_events','studio_task_subtasks'])assert.equal((await db.query(`select count(*)::int n from ${table} where project_id=$1`,[target])).rows[0].n,0,table);
  assert.equal((await db.query('select id from studio_projects where id in ($1,$2)',[keep,foreign])).rows.length,2);
  assert.equal((await db.query('select count(*)::int n from studio_keys where workspace_id=$1',[wa])).rows[0].n,1);
 }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('the complete migration directory applies in deployment order to a fresh database', async () => {
 const db = new PGlite();
 try {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort();
  assert.ok(files.length > 0);
  const versions = files.map(file => {
   assert.match(file, /^\d+_[a-z0-9_]+\.sql$/);
   return file.split('_')[0];
  });
  assert.equal(new Set(versions).size, files.length, 'migration versions must be unique');
  for (const file of files) {
   try { await db.exec(await readFile(new URL(file, directory), 'utf8')); }
   catch (error) { throw new Error(`Migration ${file} failed`, { cause: error }); }
  }
  const { rows } = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  assert.ok(rows.some(row => row.tablename === 'waitlist'));
  assert.ok(rows.some(row => row.tablename === 'studio_projects'));
 } finally { await db.close(); }
});

test('task activity migration recovers partial/manual application and preserves events on replay', async () => {
 const db = new PGlite();
 try {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon;");
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const target = '202610160004_studio_task_activity.sql';
  const files = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort();
  for (const file of files.filter(file => file < target)) await db.exec(await readFile(new URL(file, directory), 'utf8'));
  const sql = await readFile(new URL(target, directory), 'utf8');
  await db.exec('ALTER TABLE studio_tasks ADD CONSTRAINT studio_tasks_event_scope UNIQUE (id)');
  await assert.rejects(db.exec(sql), /unexpected definition/);
  await db.exec('ALTER TABLE studio_tasks DROP CONSTRAINT studio_tasks_event_scope');
  // Reproduce the reported failure: the constraint exists, but the migration is pending.
  await db.exec('ALTER TABLE studio_tasks ADD CONSTRAINT studio_tasks_event_scope UNIQUE (id,project_id,workspace_id)');
  await db.exec(sql);
  const { rows: [event] } = await db.query(`
   WITH actor AS (INSERT INTO auth.users VALUES (gen_random_uuid()) RETURNING id),
   workspace AS (INSERT INTO studio_workspaces(owner_id) SELECT id FROM actor RETURNING id,owner_id),
   project AS (INSERT INTO studio_projects(workspace_id,name,brief,cta_url)
    SELECT id,'Migration test','A project to verify durable task events','https://example.com' FROM workspace RETURNING id,workspace_id),
   note AS (INSERT INTO studio_agent_notes(project_id,workspace_id,author_role,body)
    SELECT id,workspace_id,'human','Create a design' FROM project RETURNING id,project_id,workspace_id),
   task AS (INSERT INTO studio_tasks(project_id,workspace_id,actor_id,request_id,source_note_id,agent_role,instruction)
    SELECT note.project_id,note.workspace_id,workspace.owner_id,gen_random_uuid(),note.id,'creative_director','Create a design'
    FROM note,workspace RETURNING id,project_id,workspace_id)
   INSERT INTO studio_task_events(task_id,project_id,workspace_id,kind,body)
    SELECT id,project_id,workspace_id,'status','Keep this event' FROM task RETURNING *`);
  // Replay against an evolved schema with downstream foreign keys as well.
  for (const file of files.filter(file => file > target)) await db.exec(await readFile(new URL(file, directory), 'utf8'));
  await db.exec(sql);
  assert.deepEqual((await db.query('SELECT * FROM studio_task_events')).rows, [event]);
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='studio_task_events'::regclass")).rows[0].relrowsecurity, true);
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT * FROM studio_task_events')).rows.length, 0, 'other tenants cannot read existing events');
  await db.exec('RESET ROLE');
  await assert.rejects(db.query("INSERT INTO studio_task_events(task_id,project_id,workspace_id,kind,body) VALUES ($1,$2,gen_random_uuid(),'status','Wrong tenant')", [event.task_id,event.project_id]), /foreign key/);
 } finally { await db.close(); }
});

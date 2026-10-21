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
   try {
    const sql=await readFile(new URL(file, directory), 'utf8');
    await db.exec(sql);
    // A database manually initialized up to any intermediate migration must
    // accept that migration again and still finish the remaining chain.
    if(file >= '202610160005') await db.exec(sql);
   }
   catch (error) { throw new Error(`Migration ${file} failed`, { cause: error }); }
  }
  const { rows } = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  assert.ok(rows.some(row => row.tablename === 'waitlist'));
  assert.ok(rows.some(row => row.tablename === 'studio_projects'));
 } finally { await db.close(); }
});

test('pending studio migrations replay over existing schema without losing data or permissions', async () => {
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
  // Keep real work and encrypted credential values in place during adoption.
  for (const table of ['studio_keys','studio_openrouter_keys','studio_groq_keys']) {
   await db.query(`INSERT INTO ${table}(workspace_id,ciphertext,suffix) VALUES ($1,'encrypted-test-value','alue')`, [event.workspace_id]);
  }
  await db.query("UPDATE studio_openrouter_keys SET model='custom/model' WHERE workspace_id=$1", [event.workspace_id]);
  await db.query("UPDATE studio_tasks SET status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes' WHERE id=$1", [event.task_id]);
  await db.query("INSERT INTO studio_pipeline_drafts(task_id,project_id,workspace_id,state) VALUES ($1,$2,$3,'{\"stage\":2}')", [event.task_id,event.project_id,event.workspace_id]);
  const tables=['studio_keys','studio_openrouter_keys','studio_groq_keys','studio_tasks','studio_pipeline_drafts','studio_task_events','studio_projects','studio_agent_notes'];
  const saved = new Map();
  for (const table of tables) saved.set(table,(await db.query(`SELECT * FROM ${table}`)).rows);
  const definitions = async () => {
   const queries = [
    "SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
    "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
    "SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname",
    "SELECT c.relname,c.relrowsecurity,ARRAY(SELECT acl::text FROM unnest(c.relacl) acl ORDER BY acl::text) AS privileges FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname",
    "SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relnamespace='public'::regnamespace ORDER BY c.relname,k.conname",
    "SELECT p.proname,pg_get_functiondef(p.oid) AS definition,ARRAY(SELECT acl::text FROM unnest(p.proacl) acl ORDER BY acl::text) AS privileges FROM pg_proc p WHERE p.pronamespace='public'::regnamespace ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)",
    "SELECT t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY t.tgname",
   ];
   return Promise.all(queries.map(async query=>(await db.query(query)).rows));
  };
  const before = await definitions();
  // Each file has its own transaction, just like the CLI. Replay the entire
  // pending suffix, including routines/triggers replaced by later migrations.
  for (const file of files.filter(file => file >= target)) {
   try { await db.exec('BEGIN;'+await readFile(new URL(file,directory),'utf8')+'COMMIT;'); }
   catch(error) { throw new Error(`Replay of ${file} failed`, {cause:error}); }
  }
  assert.deepEqual(await definitions(),before,'final schema and permissions must remain equivalent');
  for (const table of tables) assert.deepEqual((await db.query(`SELECT * FROM ${table}`)).rows,saved.get(table),`${table} rows must survive replay`);
  assert.deepEqual((await db.query('SELECT * FROM studio_task_events')).rows, [event]);
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='studio_task_events'::regclass")).rows[0].relrowsecurity, true);
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT * FROM studio_task_events')).rows.length, 0, 'other tenants cannot read existing events');
  await db.exec('RESET ROLE');
  await assert.rejects(db.query("INSERT INTO studio_task_events(task_id,project_id,workspace_id,kind,body) VALUES ($1,$2,gen_random_uuid(),'status','Wrong tenant')", [event.task_id,event.project_id]), /foreign key/);
 } finally { await db.close(); }
});

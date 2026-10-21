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

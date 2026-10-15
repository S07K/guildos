import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { runGuild } from '../src/lib/studio/guild.ts';
import { ProviderCapacityError, withProviderFallback } from '../src/lib/studio/provider-fallback.ts';

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

test('guild runs distinct specialist stages, passes prior review into design, and totals usage', async () => {
 const calls = [];
 const request = async (_, options) => {
  const payload = JSON.parse(options.body);
  calls.push(payload);
  const input = JSON.parse(payload.input);
  if (payload.instructions.includes('UI Designer in')) {
   assert.equal(input.reviews.length, 3);
   assert.equal(input.discussion[0].body, 'Make the CTA clearer.');
  }
  const value = payload.text.format.schema.properties.brand ? design : { anchor: 'hero', body: `Review from ${payload.instructions.slice(0, 28)}`, mentioned_role: 'ui_designer' };
  return Response.json({ status: 'completed', model: 'gpt-4.1-mini', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 10, output_tokens: 5 } });
 };
 const result = await runGuild({ key: 'test', brief: 'Make a thoughtful workspace landing page.', discussion: [{ author_role: 'human', mentioned_role: 'copywriter', anchor: 'hero', body: 'Make the CTA clearer.' }] }, request);
 assert.equal(calls.length, 5);
 assert.equal(result.notes.length, 5);
 assert.deepEqual(result.notes.map(note => note.author_role), ['creative_director', 'ux_architect', 'copywriter', 'ui_designer', 'qa_critic']);
 assert.equal(result.input_tokens, 50);
 assert.equal(result.output_tokens, 25);
 assert.deepEqual(result.document, design);
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

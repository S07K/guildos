import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { planScreen } from '../src/lib/studio/agents/section-agents.ts';
import { runNextTask } from '../src/lib/studio/agents/worker.ts';
import { encodeNewScreenDevice, encodeReferences, parseNewScreenDevice, parseReferences, stripScreenScope } from '../src/lib/studio/html-screen.ts';
import { sealKey } from '../src/lib/studio/vault.mjs';
import { adapter, studioDatabase } from './fixtures/studio-db.mjs';

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
const IMAGE = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`;
const plan = { summary: 'A checkout.', screen_name: 'Checkout', background: '#ffffff', device: 'mobile', colors: [{ name: 'primary', hex: '#1f3d36' }], font_sans: 'Inter', sections: [{ id: 'summary', kind: 'content', intent: 'Order summary.' }, { id: 'pay', kind: 'content', intent: 'Payment.' }] };
const completed = body => Response.json({ status: 'completed', model: 'test-model', usage: { input_tokens: 10, output_tokens: 20 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(body) }] }] });

test('reference and device markers round-trip and are hidden from display', () => {
 const ids = [randomUUID(), randomUUID()];
 const text = `Checkout\n${encodeNewScreenDevice('desktop')}${encodeReferences(ids)}`;
 assert.equal(parseNewScreenDevice(text), 'desktop');
 assert.deepEqual(parseReferences(text), ids);
 assert.equal(stripScreenScope(text).trim(), 'Checkout');
 assert.equal(encodeReferences([]), '');
 assert.deepEqual(parseReferences('no markers'), []);
});

test('reference images go to the planner with the text, as Responses image inputs', async t => {
 const bodies = [];
 t.mock.method(globalThis, 'fetch', async (url, options) => { bodies.push(JSON.parse(options.body)); return completed(plan); });
 const result = await planScreen({ key: 'k', model: 'gpt-test', provider: 'openai' }, { brief: 'A shop.', instruction: 'A checkout', previous: null, device: 'desktop', references: [IMAGE], notes: [] });
 assert.equal(result.imagesIgnored, false);
 const content = bodies[0].input[0].content;
 assert.equal(content[0].type, 'input_text');
 assert.deepEqual(content[1], { type: 'input_image', image_url: IMAGE, detail: 'auto' });
 assert.match(bodies[0].instructions, /REFERENCE IMAGES/);
 assert.match(bodies[0].instructions, /desktop screen \(1440px wide\)/);
});

test('a model that cannot read images designs from the text alone, and says so', async t => {
 const bodies = [];
 t.mock.method(globalThis, 'fetch', async (url, options) => {
  bodies.push(JSON.parse(options.body));
  return bodies.length === 1 ? Response.json({ error: { message: 'This model does not support image input.', code: 'invalid_request_error' } }, { status: 400 }) : completed(plan);
 });
 const result = await planScreen({ key: 'k', model: 'openai/gpt-oss-120b', provider: 'groq' }, { brief: 'A shop.', instruction: 'A checkout', previous: null, references: [IMAGE], notes: [] });
 assert.equal(result.imagesIgnored, true);
 assert.equal(bodies.length, 2);
 assert.equal(typeof bodies[1].input, 'string', 'the retry carries no images');
 assert.equal(result.screen.name, 'Checkout');
});

test('the worker designs a new screen for the chosen device from the attached references', async t => {
 const db = await studioDatabase(); const alice = randomUUID(); const secret = 'c'.repeat(64);
 const priorSecret = process.env.STUDIO_VAULT_KEY; process.env.STUDIO_VAULT_KEY = secret;
 t.after(async () => { if (priorSecret === undefined) delete process.env.STUDIO_VAULT_KEY; else process.env.STUDIO_VAULT_KEY = priorSecret; await db.close(); });
 await db.query('insert into auth.users values($1)', [alice]);
 const workspace = (await db.query('insert into studio_workspaces(owner_id) values($1) returning id', [alice])).rows[0].id;
 const project = (await db.query("insert into studio_projects(workspace_id,name,brief,cta_url) values($1,'Shop','A mobile app for a small clothing shop selling linen and wool basics','https://example.com') returning id", [workspace])).rows[0].id;
 await db.query('insert into studio_keys(workspace_id,ciphertext,suffix) values($1,$2,$3)', [workspace, sealKey('test-only', workspace, secret), 'only']);
 await db.exec('SET ROLE service_role');
 const reference = randomUUID(), foreign = randomUUID(), downloads = [];
 const client = { ...adapter(db), storage: { from: bucket => ({ download: async path => { downloads.push(`${bucket}/${path}`); return path.endsWith(reference) ? { data: new Blob([PNG], { type: 'image/png' }) } : { data: null, error: new Error('Not found') }; } }) } };
 const calls = [];
 t.mock.method(globalThis, 'fetch', async (url, options) => {
  const body = JSON.parse(options.body);
  const images = Array.isArray(body.input) ? body.input[0].content.filter(part => part.type === 'input_image').length : 0;
  calls.push({ name: body.text.format.name, images });
  if (body.text.format.name === 'screen_plan') return completed(plan);
  const input = JSON.parse(Array.isArray(body.input) ? body.input[0].content[0].text : body.input);
  return completed({ summary: 'Done.', html: `<div class="px-5">${input.this_section.id}</div>` });
 });
 const rpc = async (name, args) => { const result = await client.rpc(name, args); if (result.error) throw result.error; return result.data; };
 await rpc('enqueue_studio_task', { p_project: project, p_actor: alice, p_request: randomUUID(), p_text: `A checkout\n${encodeNewScreenDevice('desktop')}${encodeReferences([reference, foreign])}`, p_role: 'ui_designer', p_version: null });
 for (let step = 0; step < 3; step++) await runNextTask(client);
 assert.deepEqual(downloads, [`studio-assets/${workspace}/${project}/${reference}`, `studio-assets/${workspace}/${project}/${foreign}`], 'references are read only from this project\'s storage');
 assert.deepEqual(calls.find(call => call.name === 'screen_plan'), { name: 'screen_plan', images: 1 }, 'the readable reference reaches the planner');
 const screen = (await db.query('select name,device from studio_screens where project_id=$1', [project])).rows[0];
 assert.deepEqual(screen, { name: 'Checkout', device: 'desktop' }, 'the planner\'s mobile guess is overridden by the chosen device');
});

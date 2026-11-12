import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blankCanvas } from '../src/lib/studio/canvas.ts';
import { IMAGE_PLACEHOLDER } from '../src/lib/studio/html-screen.ts';
import { applyPlan, completeSection, deviceVersionState, failSection, initialSectionState, nextBatch, scopedSectionState, settle, usesSectionPipeline } from '../src/lib/studio/agents/section-pipeline.ts';
import { buildSection, screenFromPlan } from '../src/lib/studio/agents/section-agents.ts';
import { generateScreenImages } from '../src/lib/studio/agents/screen-images.ts';
import { encodeDeviceVersion, encodeScreenScope, encodeScreenTarget, parseScreenScope, stripScreenScope, validateHtmlScreen } from '../src/lib/studio/html-screen.ts';
import { runNextTask } from '../src/lib/studio/agents/worker.ts';
import { sealKey } from '../src/lib/studio/vault.mjs';
import { adapter, studioDatabase } from './fixtures/studio-db.mjs';

const plan = {
 summary: 'Warm, editorial shop home.', screen_name: 'Shop home', background: '#FBFAF7',
 colors: [{ name: 'primary', hex: '#1f3d36' }, { name: 'Brand Gold', hex: '#d9a441' }, { name: 'ink', hex: 'not-a-colour' }],
 font_sans: 'Inter', font_display: 'Fraunces; x',
 sections: [
  { id: 'Header', kind: 'app-header', intent: 'Greeting and bag button.' },
  { id: 'header', kind: 'hero', intent: 'Autumn edit hero.' },
  { id: 'chips', kind: 'mystery', intent: 'Category chips.' },
  { id: 'empty', kind: 'content', intent: '   ' },
 ],
};
const responses = body => ({ status: 'completed', model: 'test-model', usage: { input_tokens: 10, output_tokens: 20 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(body) }] }] });

test('plans are normalised into a valid screen of planned sections', () => {
 const { screen, summary } = screenFromPlan(plan);
 assert.equal(summary, 'Warm, editorial shop home.');
 assert.deepEqual(screen.sections.map(section => [section.id, section.kind, section.status]), [['header', 'app-header', 'planned'], ['header-2', 'hero', 'planned'], ['chips', 'custom', 'planned']]);
 assert.equal(screen.background, '#fbfaf7');
 assert.equal(screen.tokens.colors.primary, '#1f3d36');
 assert.equal(screen.tokens.colors['brand-gold'], '#d9a441');
 assert.equal(screen.tokens.colors.ink, '#111827', 'invalid required tokens fall back to a safe default');
 assert.equal(screen.tokens.fontDisplay, undefined);
 assert.throws(() => screenFromPlan({ ...plan, sections: [] }), /no usable sections/);
});

test('plans carry art direction, cleaned style recipes and image slots tied to real sections', () => {
 const { screen } = screenFromPlan({
  ...plan, art_direction: 'Warm oatmeal studio backdrop, soft window light.',
  style_recipes: { eyebrow: 'text-xs uppercase tracking-[0.3em] text-muted', display: 'font-display text-4xl" onclick="x', card: '' },
  images: [
   { id: 'Hero Shot', section_id: 'header-2', prompt: 'Woman in a linen coat', alt: 'Linen coat', aspect: 'portrait' },
   { id: 'hero-shot', section_id: 'header-2', prompt: 'Second hero', alt: '', aspect: 'wide' },
   { id: 'ghost', section_id: 'missing', prompt: 'Nowhere', alt: '', aspect: 'square' },
   { id: 'blank', section_id: 'chips', prompt: '  ', alt: '', aspect: 'square' },
  ],
 });
 assert.equal(screen.art.direction, 'Warm oatmeal studio backdrop, soft window light.');
 assert.equal(screen.art.recipes.eyebrow, 'text-xs uppercase tracking-[0.3em] text-muted');
 assert.equal(screen.art.recipes.display, 'font-display', 'a token carrying markup is dropped from recipes');
 assert.match(screen.art.recipes.card, /rounded-2xl/, 'missing recipes fall back to defaults');
 assert.deepEqual(screen.art.images.map(image => [image.id, image.section, image.aspect, image.source]), [['hero-shot', 'header-2', 'portrait', 'pending'], ['hero-shot-2', 'header-2', 'portrait', 'pending']]);
 assert.deepEqual(validateHtmlScreen(screen), []);
 assert.match(validateHtmlScreen({ ...screen, art: { ...screen.art, images: [{ ...screen.art.images[0], url: 'https://evil.example/a.png' }] } }).join(), /unsupported URL/);
});

test('screen photos are generated with the shared art direction and fall back without failing the screen', async () => {
 const { screen } = screenFromPlan({ ...plan, art_direction: 'Oatmeal backdrop.', images: [{ id: 'coat', section_id: 'header-2', prompt: 'Linen coat', alt: 'Coat', aspect: 'portrait' }, { id: 'scarf', section_id: 'header-2', prompt: 'Wool scarf', alt: 'Scarf', aspect: 'square' }] });
 const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64');
 const prompts = [];
 const request = async (url, options) => {
  const body = JSON.parse(options.body); prompts.push(body);
  assert.equal(url, 'https://api.openai.com/v1/images/generations');
  if (body.prompt.startsWith('Wool scarf')) return new Response('{}', { status: 500 });
  return Response.json({ data: [{ b64_json: png }], usage: { input_tokens: 30, output_tokens: 400 } });
 };
 const stored = [];
 const result = await generateScreenImages(screen.art, { connection: { provider: 'openai', key: 'test-only', model: 'gpt-image-2' }, request, store: async bytes => { stored.push(bytes.length); return '/api/studio/assets/img-1?projectId=p'; } });
 assert.match(prompts[0].prompt, /^Linen coat\. Art direction: Oatmeal backdrop\. Photographic, no text/);
 assert.equal(prompts[0].size, '1024x1536');
 assert.deepEqual(result.art.images.map(image => [image.id, image.source, image.url]), [['coat', 'generated', '/api/studio/assets/img-1?projectId=p'], ['scarf', 'placeholder', IMAGE_PLACEHOLDER]]);
 assert.deepEqual(stored, [9]);
 assert.deepEqual(result.usage, [{ model: 'openai/gpt-image-2', input_tokens: 30, output_tokens: 400 }]);
 const routed = await generateScreenImages(screen.art, { connection: { provider: 'openrouter', key: 'k', model: 'img' }, store: async () => '/api/studio/assets/img-2?projectId=p',
  request: async () => Response.json({ choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${png}` } }] } }], usage: { prompt_tokens: 5, completion_tokens: 6 } }) });
 assert.ok(routed.art.images.every(image => image.source === 'generated'));
 const offline = await generateScreenImages(screen.art, { connection: null, store: async () => { throw new Error('unused'); } });
 assert.ok(offline.art.images.every(image => image.url === IMAGE_PLACEHOLDER));
});

test('sections build in batches, retry once, and a screen settles with partial failures', () => {
 const { screen } = screenFromPlan({ ...plan, sections: ['a', 'b', 'c', 'd'].map(id => ({ id, kind: 'content', intent: `Section ${id}.` })) });
 let state = applyPlan(initialSectionState(null, null), screen);
 assert.throws(() => applyPlan(state, screen), /already planned/);
 assert.deepEqual(nextBatch(state).map(section => section.id), ['a', 'b', 'c']);
 state = completeSection(state, 'a', '<p>A</p>');
 state = failSection(state, 'b', 'timeout');
 assert.equal(state.document.sections[1].status, 'planned', 'first failure is retried');
 state = failSection(state, 'b', 'timeout again');
 assert.equal(state.document.sections[1].status, 'failed');
 assert.equal(settle(state).phase, 'build', 'c and d remain');
 state = completeSection(completeSection(state, 'c', '<p>C</p>'), 'd', '<p>D</p>');
 assert.equal(settle(state).phase, 'done');
 const allFailed = ['a', 'b', 'c', 'd'].reduce((current, id) => failSection(failSection(current, id, 'x'), id, 'x'), applyPlan(initialSectionState(null, null), screen));
 assert.throws(() => settle(allFailed), /No section/);
});

test('new projects, blank canvases and HTML screens use the section pipeline; node canvases with work do not', () => {
 assert.equal(usesSectionPipeline(null, null), true);
 assert.equal(usesSectionPipeline(blankCanvas(), null), true);
 assert.equal(usesSectionPipeline(screenFromPlan(plan).screen, null), true);
 assert.equal(usesSectionPipeline({ ...blankCanvas(), nodes: [{ id: 'x' }] }, null), false);
 assert.equal(usesSectionPipeline({ ...blankCanvas(), nodes: [{ id: 'x' }] }, initialSectionState(null, null)), true, 'a draft keeps its pipeline');
 assert.equal(usesSectionPipeline(null, { stage: 0 }), false);
});

test('a section that needed sanitising is repaired once, and unresolved photos get the placeholder', async () => {
 const planned = screenFromPlan(plan).screen;
 const screen = { ...planned, art: { ...planned.art, images: [{ id: 'look', section: 'header', prompt: 'Look', alt: 'Look', aspect: 'portrait', url: '/api/studio/assets/look?projectId=p', source: 'generated' }] } };
 const bodies = [];
 const request = async (url, options) => {
  const body = JSON.parse(options.body); bodies.push(body);
  assert.equal(body.text.format.name, 'screen_section');
  assert.equal(body.store, false);
  const html = bodies.length === 1
   ? '<header style="color:red" class="px-5"><img src="image:linen jacket" alt="Jacket"><script>x()</script></header>'
   : '<header class="px-5"><img src="image:linen jacket" alt="Jacket"><img src="asset:look" alt="Look"><img src="asset:unknown" alt=""><h1 class="font-display text-ink">Threadline</h1></header>';
  return Response.json(responses({ summary: 'Header with greeting.', html }));
 };
 const built = await buildSection({ key: 'test-only', model: 'gpt-test', provider: 'openai', request }, { brief: 'Clothing shop', instruction: 'Design the home screen', screen, sectionId: 'header' });
 assert.equal(bodies.length, 2);
 assert.match(bodies[1].instructions, /corrected automatically: Removed unsupported tags: script/);
 const sent = JSON.parse(bodies[0].input);
 assert.equal(sent.this_section.id, 'header');
 assert.deepEqual(sent.images, [{ id: 'look', alt: 'Look', aspect: 'portrait' }], 'only this section\'s planned photos are offered');
 assert.equal(sent.style_recipes.primary_button, screen.art.recipes.primary_button);
 assert.equal(built.html, `<header class="px-5"><img src="${IMAGE_PLACEHOLDER}" alt="Jacket"><img src="/api/studio/assets/look?projectId=p" alt="Look"><img src="${IMAGE_PLACEHOLDER}" alt=""><h1 class="font-display text-ink">Threadline</h1></header>`);
 assert.deepEqual([built.input_tokens, built.output_tokens, built.summary], [20, 40, 'Header with greeting.']);
 await assert.rejects(buildSection({ key: 'k', model: 'm', provider: 'groq', request: async () => Response.json(responses({ summary: 'x', html: '' })) }, { brief: 'b', instruction: 'i', screen, sectionId: 'header' }), /unusable/);
});

test('the worker plans, builds sections across leases, records each checkpoint and publishes one html-screen version', async t => {
 const db = await studioDatabase(); const alice = randomUUID(); const secret = 'd'.repeat(64);
 const priorSecret = process.env.STUDIO_VAULT_KEY; process.env.STUDIO_VAULT_KEY = secret;
 t.after(async () => { if (priorSecret === undefined) delete process.env.STUDIO_VAULT_KEY; else process.env.STUDIO_VAULT_KEY = priorSecret; await db.close(); });
 await db.query('insert into auth.users values($1)', [alice]);
 const workspace = (await db.query('insert into studio_workspaces(owner_id) values($1) returning id', [alice])).rows[0].id;
 const project = (await db.query("insert into studio_projects(workspace_id,name,brief,cta_url) values($1,'Shop','A mobile app for a small clothing shop selling linen and wool basics','https://example.com') returning id", [workspace])).rows[0].id;
 await db.query('insert into studio_keys(workspace_id,ciphertext,suffix) values($1,$2,$3)', [workspace, sealKey('test-only', workspace, secret), 'only']);
 await db.exec('SET ROLE service_role'); const client = adapter(db);
 const rpc = async (name, args) => { const result = await client.rpc(name, args); if (result.error) throw result.error; return result.data; };
 const { task } = await rpc('enqueue_studio_task', { p_project: project, p_actor: alice, p_request: randomUUID(), p_text: '@Mira design the shop home', p_role: 'ui_designer', p_version: null });
 const calls = [];
 t.mock.method(globalThis, 'fetch', async (url, options) => {
  const body = JSON.parse(options.body); const name = body.text?.format?.name; if (name) calls.push(name);
  if (String(url).endsWith('/images/generations')) { calls.push('image'); return new Response('{}', { status: 503 }); }
  if (name === 'screen_plan') return Response.json(responses({ ...plan, sections: ['top', 'hero', 'list', 'broken'].map(id => ({ id, kind: 'content', intent: `The ${id} section.` })), art_direction: 'Oatmeal backdrop.', images: [{ id: 'hero-photo', section_id: 'hero', prompt: 'Linen coat', alt: 'Coat', aspect: 'portrait' }] }));
  const id = JSON.parse(body.input).this_section.id;
  return Response.json(responses({ summary: `Built ${id}.`, html: id === 'broken' ? '' : `<div class="px-5 text-ink">${id}</div>` }));
 });
 const draft = async () => (await db.query('select state from studio_pipeline_drafts where task_id=$1', [task.id])).rows[0]?.state;
 const status = async () => (await db.query('select status from studio_tasks where id=$1', [task.id])).rows[0].status;

 await runNextTask(client);
 assert.equal((await draft()).phase, 'build');
 assert.equal(await status(), 'queued', 'planning hands the task back to the queue');
 assert.deepEqual(calls, ['screen_plan', 'image'], 'the workspace OpenAI key also generates the planned photo');
 assert.equal((await draft()).document.art.images[0].source, 'placeholder', 'a failed photo never blocks the screen');

 await runNextTask(client);
 let state = await draft();
 assert.deepEqual(state.document.sections.map(section => section.status), ['ready', 'ready', 'ready', 'planned']);
 assert.equal(await status(), 'queued');

 // A forged transition and a stale lease are both refused by the database.
 const token = randomUUID(); assert.equal((await rpc('claim_studio_task', { p_token: token })).id, task.id);
 await assert.rejects(rpc('checkpoint_studio_sections', { p_task: task.id, p_token: token, p_previous: state, p_next: { ...state, phase: 'plan' }, p_speaker: 'ui_designer', p_summary: 'x', p_model: 'test', p_input: 0, p_output: 0, p_release: false }), /Invalid section checkpoint/);
 assert.equal((await rpc('checkpoint_studio_sections', { p_task: task.id, p_token: randomUUID(), p_previous: state, p_next: state, p_speaker: 'ui_designer', p_summary: 'x', p_model: 'test', p_input: 0, p_output: 0, p_release: false })).status, 'stale');
 await assert.rejects(rpc('finish_studio_task', { p_task: task.id, p_token: token, p_result: { mode: 'edit', summary: 'early', document: state.document, commands: [], expectedVersionId: null, model: 'test', input_tokens: 0, output_tokens: 0 } }), /QA-approved/);
 await rpc('defer_studio_task', { p_task: task.id, p_token: token, p_reason: 'Test release', p_budget: true });
 await db.query('update studio_tasks set available_at=now() where id=$1', [task.id]);

 // "broken" fails twice (two leases), then the screen publishes with it marked failed.
 await runNextTask(client);
 assert.equal((await draft()).document.sections[3].status, 'planned');
 await runNextTask(client);
 assert.equal(await status(), 'review');
 // An unscoped request adds a new screen to the board, with its first version.
 const screens = (await db.query('select id,name,device,x,head_version_id from studio_screens where project_id=$1', [project])).rows;
 assert.equal(screens.length, 1);
 assert.deepEqual([screens[0].name, screens[0].device, screens[0].x], ['Shop home', 'mobile', 0]);
 assert.equal((await db.query('select count(*)::int n from studio_versions where project_id=$1', [project])).rows[0].n, 0, 'screens never write project versions');
 const versions = (await db.query('select document from studio_screen_versions where screen_id=$1', [screens[0].id])).rows;
 assert.equal(versions.length, 1);
 assert.equal((await db.query('select result_screen_version_id from studio_tasks where id=$1', [task.id])).rows[0].result_screen_version_id, screens[0].head_version_id);
 assert.deepEqual(versions[0].document.sections.map(section => section.status), ['ready', 'ready', 'ready', 'failed']);
 assert.equal(versions[0].document.sections[0].html, '<div class="px-5 text-ink">top</div>');
 const usage = (await db.query('select input_tokens,output_tokens from studio_tasks where id=$1', [task.id])).rows[0];
 assert.deepEqual([usage.input_tokens, usage.output_tokens], [80, 160], 'all 8 model calls are accounted, including the failed section attempts');
 const speakers = (await db.query("select agent_role,count(*)::int n from studio_agent_messages where project_id=$1 and author_kind='agent' group by agent_role order by agent_role", [project])).rows;
 assert.deepEqual(speakers.map(row => row.agent_role), ['creative_director', 'ui_designer']);
});

const readyScreen = () => {
 const { screen } = screenFromPlan({ ...plan, sections: ['top', 'hero', 'list'].map(id => ({ id, kind: 'content', intent: `The ${id} section.` })) });
 return { ...screen, sections: screen.sections.map(section => ({ ...section, status: 'ready', html: `<div class="px-5">${section.id}</div>` })) };
};

test('scope markers round-trip and reject anything that is not a section id and element path', () => {
 const marker = encodeScreenScope({ mode: 'section', sectionId: 'hero', path: 'div:nth-child(1) > a:nth-child(2)' });
 assert.deepEqual(parseScreenScope(`Make the button rust\n${marker}`), { mode: 'section', sectionId: 'hero', path: 'div:nth-child(1) > a:nth-child(2)' });
 assert.equal(stripScreenScope(`Make the button rust\n${marker}`), 'Make the button rust');
 assert.deepEqual(parseScreenScope(encodeScreenScope({ mode: 'add', sectionId: 'list' })), { mode: 'add', sectionId: 'list' });
 assert.deepEqual(parseScreenScope('\u2063guildos-scope:section:hero:' + encodeURIComponent('div"onload=x') + '\u2063'), { mode: 'section', sectionId: 'hero' }, 'an unsafe path is dropped');
 assert.equal(parseScreenScope('No marker here'), null);
});

test('a scoped edit starts in the build phase with only the target section pending', () => {
 const screen = readyScreen();
 const edit = scopedSectionState('s1', 'v1', screen, { mode: 'section', sectionId: 'hero', path: 'div:nth-child(1)' }, 'Darker hero');
 assert.equal(edit.phase, 'build');
 assert.deepEqual(edit.document.sections.map(section => section.status), ['ready', 'planned', 'ready']);
 assert.deepEqual(edit.edit, { mode: 'section', sectionId: 'hero', path: 'div:nth-child(1)', previousHtml: '<div class="px-5">hero</div>' });
 assert.deepEqual(nextBatch(edit).map(section => section.id), ['hero']);
 const add = scopedSectionState('s1', 'v1', screen, { mode: 'add', sectionId: 'hero' }, 'A testimonials strip');
 assert.deepEqual(add.document.sections.map(section => [section.id, section.status]), [['top', 'ready'], ['hero', 'ready'], ['new-section', 'planned'], ['list', 'ready']]);
 assert.equal(add.document.sections[2].intent, 'A testimonials strip');
 assert.throws(() => scopedSectionState('s1', 'v1', screen, { mode: 'section', sectionId: 'gone' }, 'x'), /no longer on this screen/);
});

test('Section Edit and Add Section rebuild only their section and publish a new version', async t => {
 const db = await studioDatabase(); const alice = randomUUID(); const secret = 'e'.repeat(64);
 const priorSecret = process.env.STUDIO_VAULT_KEY; process.env.STUDIO_VAULT_KEY = secret;
 t.after(async () => { if (priorSecret === undefined) delete process.env.STUDIO_VAULT_KEY; else process.env.STUDIO_VAULT_KEY = priorSecret; await db.close(); });
 await db.query('insert into auth.users values($1)', [alice]);
 const workspace = (await db.query('insert into studio_workspaces(owner_id) values($1) returning id', [alice])).rows[0].id;
 const project = (await db.query("insert into studio_projects(workspace_id,name,brief,cta_url) values($1,'Shop','A mobile app for a small clothing shop selling linen and wool basics','https://example.com') returning id", [workspace])).rows[0].id;
 await db.query('insert into studio_keys(workspace_id,ciphertext,suffix) values($1,$2,$3)', [workspace, sealKey('test-only', workspace, secret), 'only']);
 await db.exec('SET ROLE service_role'); const client = adapter(db);
 const rpc = async (name, args) => { const result = await client.rpc(name, args); if (result.error) throw result.error; return result.data; };
 const seeded = await rpc('commit_studio_screen', { p_project: project, p_workspace: workspace, p_actor: alice, p_request_id: randomUUID(), p_screen: null, p_expected: null, p_document: readyScreen(), p_feedback: 'Generated', p_model: 'test', p_input: 0, p_output: 0, p_x: null, p_y: null });
 const screenId = seeded.screen.id, base = seeded.version.id;
 const seen = [];
 t.mock.method(globalThis, 'fetch', async (url, options) => {
  const body = JSON.parse(options.body); const input = JSON.parse(body.input);
  seen.push({ name: body.text.format.name, id: input.this_section?.id, current: input.current_html, focus: input.focus_path, revise: body.instructions.includes('REVISION') });
  return Response.json(responses({ summary: 'Done.', html: `<div class="px-5 bg-primary">${input.this_section.id} v2</div>` }));
 });
 const latest = async () => (await db.query('select v.id,v.document from studio_screens s join studio_screen_versions v on v.id=s.head_version_id where s.id=$1', [screenId])).rows[0];
 const onScreen = text => `${text}\n${encodeScreenTarget(screenId)}`;

 const edit = await rpc('enqueue_studio_task', { p_project: project, p_actor: alice, p_request: randomUUID(), p_text: `${onScreen('Make the hero darker')}${encodeScreenScope({ mode: 'section', sectionId: 'hero', path: 'div:nth-child(1)' })}`, p_role: 'ui_designer', p_version: null });
 await runNextTask(client);
 assert.deepEqual(seen, [{ name: 'screen_section', id: 'hero', current: '<div class="px-5">hero</div>', focus: 'div:nth-child(1)', revise: true }], 'no plan call; only the hero is rebuilt, from its current markup');
 assert.equal((await db.query('select status,summary from studio_tasks where id=$1', [edit.task.id])).rows[0].summary, 'Updated the hero section of Shop home.');
 const afterEdit = await latest();
 assert.notEqual(afterEdit.id, base);
 assert.deepEqual(afterEdit.document.sections.map(section => section.html), ['<div class="px-5">top</div>', '<div class="px-5 bg-primary">hero v2</div>', '<div class="px-5">list</div>']);

 seen.length = 0;
 await rpc('enqueue_studio_task', { p_project: project, p_actor: alice, p_request: randomUUID(), p_text: `${onScreen('A testimonials strip')}${encodeScreenScope({ mode: 'add', sectionId: 'hero' })}`, p_role: 'ui_designer', p_version: null });
 await runNextTask(client);
 assert.deepEqual(seen.map(call => [call.id, call.revise]), [['new-section', false]]);
 assert.deepEqual((await latest()).document.sections.map(section => section.id), ['top', 'hero', 'new-section', 'list']);
 assert.equal((await db.query('select count(*)::int n from studio_screen_versions where screen_id=$1', [screenId])).rows[0].n, 3, 'each edit is a new version of the same screen');

 // Generate › Desktop version: a new screen beside the source, rebuilt from each section's mobile markup.
 seen.length = 0;
 await rpc('enqueue_studio_task', { p_project: project, p_actor: alice, p_request: randomUUID(), p_text: `Desktop version\n${encodeScreenTarget(screenId)}${encodeDeviceVersion('desktop')}`, p_role: 'ui_designer', p_version: null });
 await runNextTask(client); await runNextTask(client);
 assert.equal(seen.length, 4, 'one adapt call per finished section, no plan call');
 assert.ok(seen.every(call => call.name === 'screen_section' && !call.revise));
 const board = (await db.query('select name,device,x,y from studio_screens where project_id=$1 order by x', [project])).rows;
 assert.deepEqual(board.map(screen => [screen.name, screen.device, screen.x]), [['Shop home', 'mobile', 0], ['Shop home · Desktop', 'desktop', 535]]);
});

test('device versions keep content, art and photos and refuse the same device', () => {
 const screen = { ...readyScreen(), art: { direction: 'Oatmeal.', recipes: {}, images: [{ id: 'coat', section: 'hero', prompt: 'Coat', alt: 'Coat', aspect: 'portrait', url: '/api/studio/assets/a?projectId=p', source: 'generated' }] } };
 const state = deviceVersionState({ id: 's1', x: 100, y: 40, document: screen }, 'desktop');
 assert.deepEqual([state.screenId, state.baseVersionId, state.position, state.document.device, state.document.name], [null, null, { x: 635, y: 40 }, 'desktop', 'Shop home · Desktop']);
 assert.deepEqual(state.document.sections.map(section => section.status), ['planned', 'planned', 'planned']);
 assert.equal(state.edit.sources.hero, '<div class="px-5">hero</div>');
 assert.equal(state.document.art.images[0].url, '/api/studio/assets/a?projectId=p', 'photos are reused, not regenerated');
 assert.throws(() => deviceVersionState({ id: 's1', x: 0, y: 0, document: screen }, 'mobile'), /already a mobile screen/);
});

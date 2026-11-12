import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cleanHtmlScreen, cleanInlineStyle, composeHtmlScreen, parseSectionHtml, sanitizeSectionHtml, screenClassCandidates, validateHtmlScreen } from '../src/lib/studio/html-screen.ts';
import { compileScreenCss } from '../src/lib/studio/html-screen-css.ts';

const KINDS = ['app-header', 'hero', 'category-chips', 'product-list', 'product-grid', 'feature-row', 'cta-banner', 'bottom-nav'];
const fixture = kind => readFile(new URL(`./fixtures/html-sections/${kind}.html`, import.meta.url), 'utf8');
const tokens = { colors: { primary: '#1f3d36', accent: '#d9a441', ink: '#1b1f24', muted: '#6b7280', surface: '#f3f1ec', line: '#e5e2da' }, fontSans: 'Inter', fontDisplay: 'Fraunces' };
const shopScreen = async () => ({
 kind: 'html-screen', name: 'Shop', device: 'mobile', background: '#fbfaf7', tokens,
 sections: await Promise.all(KINDS.map(async kind => ({ id: kind, kind, html: await fixture(kind), status: 'ready' }))),
});

test('the eight common sections pass sanitising unchanged in meaning, and compose to a stable document', async t => {
 const doc = await shopScreen();
 assert.deepEqual(validateHtmlScreen(doc), []);
 for (const section of doc.sections) {
  const { html, issues } = parseSectionHtml(section.html);
  assert.deepEqual(issues, [], `${section.kind} should need no repairs`);
  t.assert.snapshot(html, { serializers: [value => value] });
 }
 t.assert.snapshot(composeHtmlScreen(doc, '/* compiled tailwind */'), { serializers: [value => value] });
});

test('compiled CSS covers the utilities and tokens the screen uses, and nothing it does not', async () => {
 const doc = await shopScreen();
 const css = await compileScreenCss(doc);
 for (const selector of ['.bg-primary', '.text-ink', '.border-line', '.font-display', '.grid-cols-2', '.aspect-\\[3\\/4\\]', '.bg-accent\\/15', '.text-\\[11px\\]', '.size-20'])
  assert.ok(css.includes(selector), `missing ${selector}`);
 assert.match(css, /--color-primary:\s*#1f3d36/);
 assert.match(css, /--font-display:\s*"Fraunces"/);
 assert.ok(!css.includes('.bg-red-500'), 'unused utilities must not be emitted');
 assert.ok(screenClassCandidates(doc).includes('md:grid-cols-4'));
});

test('a compiled screen depends only on its own classes', async () => {
 const doc = await shopScreen();
 const other = { ...doc, sections: [{ id: 'x', kind: 'custom', status: 'ready', html: '<p class="text-fuchsia-700 rotate-45">other tenant</p>' }] };
 await compileScreenCss(other);
 const css = await compileScreenCss(doc);
 assert.ok(!css.includes('text-fuchsia-700') && !css.includes('.rotate-45'));
 assert.equal(css, await compileScreenCss(doc));
});

test('the sanitiser keeps only allowlisted markup, attributes and URLs', () => {
 const { html, removedTags, removedAttributes } = sanitizeSectionHtml(`
  <div class="p-4" onclick="steal()" style="background:url(https://x)" data-x="1">
   <script>alert(1)</script><style>body{}</style><iframe src="https://evil"></iframe>
   <a href="jav&#x61;script:alert(1)">bad</a><a href=" javascript:alert(1)">bad</a><a href="https://ok.example/path">ok</a>
   <img src="https://evil.example/a.png"><img src="https://images.unsplash.com/photo-1?w=10" alt="ok">
   <form action="/steal"><input type="hidden" name="t" value="x"><input type="email" placeholder="Email"></form>
   <svg viewBox="0 0 24 24" onload="x()"><path d="M0 0h24"/><foreignObject><div>x</div></foreignObject></svg>
   <p title="a&quot; onmouseover=&quot;x">1 < 2 &amp; 3</p>
   <!-- comment --><unknown-tag>kept text</unknown-tag>
  </div>`);
 assert.doesNotMatch(html, /script|onclick|onload|style=|data-x|iframe|javascript|evil|<form|hidden|foreignobject/i);
 assert.match(html, /<a>bad<\/a><a>bad<\/a><a href="https:\/\/ok.example\/path">ok<\/a>/);
 assert.match(html, /<img alt=""><img src="https:\/\/images.unsplash.com\/photo-1\?w=10" alt="ok">/);
 assert.match(html, /<input type="email" placeholder="Email">/);
 assert.match(html, /<svg viewBox="0 0 24 24"><path d="M0 0h24"\/><\/svg>/);
 assert.match(html, /<p title="a&quot; onmouseover=&quot;x">1 &lt; 2 &amp; 3<\/p>/);
 assert.match(html, /kept text/);
 assert.deepEqual(removedTags, ['foreignobject', 'form', 'iframe', 'script', 'style', 'unknown-tag']);
 assert.deepEqual(removedAttributes, ['data-x', 'href(value)', 'name', 'on*', 'src(value)', 'style', 'type(value)']);
});

test('sanitising closes unbalanced markup and ignores stray closing tags', () => {
 assert.equal(sanitizeSectionHtml('<div><p>open</span><b>bold</div></p>').html, '<div><p>open<b>bold</b></p></div>');
 assert.equal(sanitizeSectionHtml('<button>Go').html, '<button type="button">Go</button>');
});

test('model output is unwrapped from fences and whole documents, with retry-ready issues', () => {
 const fenced = parseSectionHtml('```html\n<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><section class="p-4"><h2>Hi</h2></section></body></html>\n```');
 assert.equal(fenced.html, '<section class="p-4"><h2>Hi</h2></section>');
 assert.deepEqual(fenced.issues, []);
 const repaired = parseSectionHtml('<div style="color:red"><script>x</script>Hi</div>');
 assert.equal(repaired.html, '<div>Hi</div>');
 assert.equal(repaired.issues.length, 2);
 assert.deepEqual(parseSectionHtml('```html\n```').issues, ['The section is empty. Return one HTML fragment for this section.']);
});

test('validation rejects malformed screens and composition isolates failed and pending sections', async () => {
 const doc = await shopScreen();
 assert.deepEqual(validateHtmlScreen({ ...doc, device: 'watch', background: 'red', tokens: { colors: { Primary: '#zzz' }, fontSans: 'Inter"; x' }, sections: [{ id: 'a', kind: 'hero', html: '', status: 'ready' }, { id: 'a', kind: 'nope', html: 'x', status: 'done' }] }), [
  'Unknown device "watch".', 'Background must be a hex colour.', 'Colour token "Primary" must be lowercase kebab-case.', 'Colour token "Primary" must be a hex colour.',
  'fontSans must be a plain font family name.', 'Section "a" is ready but empty.', 'Duplicate section id "a".', 'Section "a" has unknown kind "nope".', 'Section "a" has an invalid status.',
 ]);
 const composed = composeHtmlScreen({ ...doc, sections: [
  { id: 'hero', kind: 'hero', status: 'planned', html: '' },
  { id: 'list', kind: 'product-list', status: 'failed', html: '', error: 'Model timed out <again>' },
  { id: 'nav', kind: 'bottom-nav', status: 'ready', html: '<nav class="p-2" onclick="x()">Nav</nav>' },
 ] }, '');
 assert.match(composed, /data-section-id="hero"[^>]*data-section-status="planned" aria-busy="true"><div class="guildos-skeleton">/);
 assert.match(composed, /Model timed out &lt;again&gt;/);
 assert.match(composed, /<nav class="p-2">Nav<\/nav>/);
 assert.match(composed, /script-src 'none'/);
});

test('manual edits keep only safe inline styles; generated sections keep none', async () => {
 assert.equal(cleanInlineStyle('color: #112233; font-size:18px; background-image:url(x); background: red; width: expression(alert(1)); position: fixed; padding: 4px 8px; box-shadow: 0 6px 16px rgba(0,0,0,.12)'),
  'color: #112233; font-size: 18px; padding: 4px 8px; box-shadow: 0 6px 16px rgba(0,0,0,.12)');
 assert.equal(cleanInlineStyle('color: red /* x */; font-family: "Inter", system-ui; margin: @import'), 'font-family: "Inter", system-ui');
 const html = '<p style="color: red; background-image: url(https://x)" onclick="x()">Hi</p>';
 assert.equal(sanitizeSectionHtml(html).html, '<p>Hi</p>');
 assert.equal(sanitizeSectionHtml(html, { allowStyle: true }).html, '<p style="color: red">Hi</p>');
 assert.equal(parseSectionHtml(html).html, '<p>Hi</p>', 'model output never carries inline styles');
 const doc = await shopScreen();
 const saved = cleanHtmlScreen({ ...doc, sections: [{ ...doc.sections[0], html: '<h1 style="font-size: 34px" contenteditable="true">Threadline</h1><script>x()</script>' }, ...doc.sections.slice(1)] });
 assert.equal(saved.sections[0].html, '<h1 style="font-size: 34px">Threadline</h1>');
 assert.throws(() => cleanHtmlScreen({ ...doc, device: 'watch' }), /Unknown device/);
});

test('exports contain only finished sections, never skeletons or generation errors', async () => {
 const doc = await shopScreen();
 const html = composeHtmlScreen({ ...doc, sections: [{ ...doc.sections[0] }, { id: 'pending', kind: 'hero', status: 'planned', html: '' }, { id: 'broken', kind: 'cta-banner', status: 'failed', html: '', error: 'Timed out' }] }, '', { exportOnly: true });
 assert.match(html, /data-section-id="app-header"/);
 assert.doesNotMatch(html, /pending|broken|guildos-skeleton"|Timed out/);
});

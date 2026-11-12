import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const fixture = (kind: string) => readFile(join(process.cwd(), 'tests/fixtures/html-sections', `${kind}.html`), 'utf8');
// A valid 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFgAI/ScL/nQAAAABJRU5ErkJggg==', 'base64');

async function newProject(page: Page, name: string) {
 await page.setViewportSize({ width: 1440, height: 900 });
 await page.goto('/signin');
 await page.getByLabel('Email address').fill('studio-test@example.com');
 await page.getByRole('button', { name: 'Send sign-in code' }).click();
 await page.getByLabel('Email code').fill('123456');
 await page.getByRole('button', { name: 'Enter your studio' }).click();
 await page.getByRole('link', { name: 'New project', exact: true }).click();
 await page.getByLabel('Project name').fill(name);
 await page.getByLabel('Your creative brief').fill('A mobile app for a small clothing shop selling linen and wool basics.');
 await page.getByRole('button', { name: 'Create project', exact: true }).click();
 await expect(page).toHaveURL(/\/studio\/projects\/[0-9a-f-]{36}$/);
 return new URL(page.url()).pathname.split('/').at(-1)!;
}

test('a new project is an empty board: New screen takes a device, a prompt and reference images', async ({ page }) => {
 await newProject(page, 'Board start');
 const empty = page.getByRole('region', { name: 'Empty board' });
 await expect(empty.getByText('Design your first screen')).toBeVisible();
 await expect(page.getByRole('toolbar', { name: 'Board tools' })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Rectangle tool' })).toHaveCount(0, { timeout: 1 });

 // S opens the composer; Escape closes it.
 await page.keyboard.press('s');
 const composer = page.getByRole('dialog', { name: 'New screen' });
 await expect(composer.getByRole('textbox', { name: 'Describe the screen' })).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(composer).toHaveCount(0);

 await empty.getByRole('button', { name: /New screen/ }).click();
 await composer.getByRole('button', { name: /Desktop/ }).click();
 await expect(composer.getByRole('button', { name: /Desktop/ })).toHaveAttribute('aria-pressed', 'true');
 const generate = composer.getByRole('button', { name: /Generate/ });
 await expect(generate).toBeDisabled();
 await composer.getByRole('textbox', { name: 'Describe the screen' }).fill('A checkout with saved cards and an order summary.');
 await composer.getByLabel('Reference image files').setInputFiles({ name: 'mood.png', mimeType: 'image/png', buffer: PNG });
 const thumbnails = composer.getByRole('list', { name: 'Reference images' }).getByRole('listitem');
 await expect(thumbnails).toHaveCount(1);
 await expect(thumbnails.first()).toHaveAttribute('aria-label', 'Reference 1');
 await expect(generate).toBeEnabled();

 const sent = page.waitForRequest(request => request.url().endsWith('/api/studio/notes') && request.method() === 'POST');
 await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
 const payload = JSON.parse((await sent).postData()!);
 expect(payload).toMatchObject({ device: 'desktop', text: 'A checkout with saved cards and an order summary.', references: [expect.stringMatching(/^[0-9a-f-]{36}$/)] });
 expect(payload.screenId).toBeUndefined();
 await expect(composer).toHaveCount(0);
 // The message shows its reference image in the conversation.
 await expect(page.getByRole('list', { name: 'Attached references' }).getByRole('listitem')).toHaveCount(1);
});

test('notes, zoom, fit and tools on the board', async ({ page, request }) => {
 const projectId = await newProject(page, 'Board tools');
 const sections = await Promise.all(['app-header', 'hero'].map(async kind => ({ id: kind, kind, intent: kind, status: 'ready', html: await fixture(kind) })));
 const tokens = { colors: { primary: '#1f3d36', accent: '#d9a441', ink: '#1b1f24', muted: '#6b7280', surface: '#f3f1ec', line: '#e5e2da' }, fontSans: 'Inter' };
 await request.post('http://127.0.0.1:3199/testing/screen', { data: { project_id: projectId, document: { kind: 'html-screen', name: 'Shop home', device: 'mobile', background: '#fbfaf7', tokens, sections } } });
 await request.post('http://127.0.0.1:3199/testing/screen', { data: { project_id: projectId, document: { kind: 'html-screen', name: 'Catalogue', device: 'mobile', background: '#fbfaf7', tokens, sections }, x: 535 } });
 await page.reload();
 const level = page.getByRole('button', { name: 'Zoom level' });
 await expect(page.locator('iframe[title="Catalogue"]')).toBeInViewport();
 await expect(page.locator('iframe[title="Shop home"]')).toBeInViewport();

 // Zoom buttons step around the centre; the menu offers 100% and fit.
 const zoomText = async () => Number((await level.textContent())!.replace('%', ''));
 const fitted = await zoomText();
 await page.getByRole('button', { name: 'Zoom in' }).click();
 await expect.poll(zoomText).toBeGreaterThan(fitted);
 await level.click();
 await page.getByRole('menuitem', { name: /Zoom to 100%/ }).click();
 await expect(level).toHaveText('100%');
 await page.keyboard.press('Shift+Digit1');
 await expect.poll(zoomText).toBe(fitted);

 // H / V switch tools.
 await page.keyboard.press('h');
 await expect(page.getByRole('button', { name: 'Hand' })).toHaveAttribute('aria-pressed', 'true');
 await page.keyboard.press('v');
 await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');

 // N adds a note that takes typing at once and saves on blur.
 const created = page.waitForResponse(response => response.url().endsWith('/api/studio/board-notes') && response.request().method() === 'POST');
 await page.keyboard.press('n');
 await page.keyboard.type('Check the hero copy before Friday');
 await created;
 const saved = page.waitForRequest(request => request.url().endsWith('/api/studio/board-notes') && request.method() === 'PATCH' && JSON.parse(request.postData()!).body === 'Check the hero copy before Friday');
 await page.getByRole('textbox', { name: 'Note text' }).blur();
 await saved;
 const note = page.getByRole('group', { name: /^Note: Check the hero copy/ });
 await expect(note).toBeVisible();
 await page.reload();
 await expect(note).toBeVisible();

 // Selected, a note offers colours and delete.
 await note.click();
 const recoloured = page.waitForRequest(request => request.method() === 'PATCH' && request.url().endsWith('/api/studio/board-notes') && JSON.parse(request.postData()!).color === 'blue');
 await page.getByRole('toolbar', { name: 'Note options' }).getByRole('button', { name: 'blue note' }).click();
 await recoloured;
 const removed = page.waitForRequest(request => request.method() === 'PATCH' && request.url().endsWith('/api/studio/board-notes') && JSON.parse(request.postData()!).remove === true);
 await page.keyboard.press('Delete');
 await removed;
 await expect(note).toHaveCount(0);

 // The chat composer attaches reference images too.
 await page.getByRole('button', { name: 'Project conversation' }).click();
 await page.getByLabel('Reference image files').setInputFiles({ name: 'ref.png', mimeType: 'image/png', buffer: PNG });
 await expect(page.getByRole('list', { name: 'Reference images' }).getByRole('listitem')).toHaveAttribute('aria-label', 'Reference 1');
 const message = page.waitForRequest(request => request.url().endsWith('/api/studio/notes') && request.method() === 'POST');
 await page.getByPlaceholder(/Ask for changes/).fill('Make it feel like this reference');
 await page.getByRole('button', { name: 'Send message' }).click();
 expect(JSON.parse((await message).postData()!).references).toHaveLength(1);
 await expect(page.getByRole('list', { name: 'Reference images' })).toHaveCount(0);
});

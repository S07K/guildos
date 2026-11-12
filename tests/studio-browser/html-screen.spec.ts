import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const fixture = (kind: string) => readFile(join(process.cwd(), 'tests/fixtures/html-sections', `${kind}.html`), 'utf8');

test('a section draft renders live: the agent cursor works over pending sections and follows each one as it draws in', async ({ page, request }) => {
 await page.setViewportSize({ width: 1440, height: 1000 });
 await page.route('https://images.unsplash.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e8d5bc"/></svg>' }));
 await page.goto('/signin');
 await page.getByLabel('Email address').fill('studio-test@example.com');
 await page.getByRole('button', { name: 'Send sign-in code' }).click();
 await page.getByLabel('Email code').fill('123456');
 await page.getByRole('button', { name: 'Enter your studio' }).click();
 await page.getByRole('link', { name: 'New project', exact: true }).click();
 await page.getByLabel('Project name').fill('Threadline live');
 await page.getByLabel('Your creative brief').fill('A mobile app for a small clothing shop selling linen and wool basics.');
 await page.getByRole('button', { name: 'Create project', exact: true }).click();
 await expect(page).toHaveURL(/\/studio\/projects\/[0-9a-f-]{36}$/);
 const projectId = new URL(page.url()).pathname.split('/').at(-1)!;

 const kinds = ['app-header', 'hero', 'category-chips', 'product-list'];
 const html = Object.fromEntries(await Promise.all(kinds.map(async kind => [kind, await fixture(kind)])));
 const screen = (ready: string[]) => ({
  kind: 'html-screen', name: 'Threadline home', device: 'mobile', background: '#fbfaf7',
  tokens: { colors: { primary: '#1f3d36', accent: '#d9a441', ink: '#1b1f24', muted: '#6b7280', surface: '#f3f1ec', line: '#e5e2da' }, fontSans: 'Inter' },
  sections: kinds.map(kind => ({ id: kind, kind, intent: `The ${kind}.`, status: ready.includes(kind) ? 'ready' : 'planned', html: ready.includes(kind) ? html[kind] : '' })),
 });
 const taskId = randomUUID();
 const live = (ready: string[], status = 'running', instruction?: string) => request.post('http://127.0.0.1:3199/testing/live', { data: { project_id: projectId, task_id: taskId, status, instruction, state: { kind: 'sections', phase: 'build', screenId: null, baseVersionId: null, attempts: {}, document: screen(ready) } } });

 await live(['app-header']);
 const frame = page.frameLocator('iframe[title="Threadline home"]');
 await expect(frame.getByRole('heading', { name: 'Threadline' })).toBeVisible();
 await expect(page.getByRole('status').filter({ hasText: 'Sections 1/4' })).toBeVisible();
 const cursor = page.locator('[data-agent-cursor="ui_designer"]');
 await expect(cursor).toContainText(/Building (hero|category-chips|product-list)/);
 // Compiled Tailwind, not a CDN: the token utility resolves inside the sandboxed frame.
 await expect(frame.locator('h1.font-display')).toHaveCSS('color', 'rgb(27, 31, 36)');
 await expect(frame.locator('script')).toHaveCount(0);
 const iframe = page.locator('iframe[title="Threadline home"]');
 await expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin');

 // The next poll patches the open document instead of reloading it, and the new section draws in.
 await frame.locator('body').evaluate(body => body.setAttribute('data-test-session', 'same-document'));
 await live(['app-header', 'hero']);
 await expect(frame.locator('[data-section-id="hero"][data-guildos-drawing]')).toBeVisible();
 await expect(cursor).toContainText('Drawing hero');
 await expect(frame.locator('body')).toHaveAttribute('data-test-session', 'same-document');
 await expect(frame.getByRole('heading', { name: 'Layers made for slow mornings' })).toBeVisible();
 await expect(cursor).toContainText(/Building (category-chips|product-list)/, { timeout: 5000 });

 // When the task is finished there is no live draft and the cursor leaves.
 // The worker publishes the finished screen onto the board when the task completes; the board picks it up.
 const published = await (await request.post('http://127.0.0.1:3199/testing/screen', { data: { project_id: projectId, document: screen(['app-header', 'hero']) } })).json();
 // The stored request carries invisible routing markers; the review card must never show them.
 await live(['app-header', 'hero'], 'review', `Tighten the hero spacing\n\u2063guildos-screen:${published.id}\u2063\u2063guildos-scope:section:hero:div%3Anth-child(1)\u2063`);
 await expect(cursor).toHaveCount(0);
 await expect(frame.getByRole('heading', { name: 'Layers made for slow mornings' })).toBeVisible({ timeout: 10000 });

 // Wheel and pinch over the screen zoom the canvas, never the page.
 const box = (await iframe.boundingBox())!;
 const scale = async () => (await iframe.boundingBox())!.width;
 const before = box.width;
 await page.mouse.move(box.x + box.width / 2, box.y + 60);
 await page.mouse.wheel(0, -240);
 await expect.poll(scale).toBeGreaterThan(before);
 expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
 // Trackpad pinch (ctrl + wheel) zooms the board, and is cancelled everywhere else so the page never zooms.
 const zoomed = await scale();
 await page.keyboard.down('Control');
 await page.mouse.move(box.x + box.width / 2, box.y + 80);
 await page.mouse.wheel(0, -200);
 await page.keyboard.up('Control');
 await expect.poll(scale).toBeGreaterThan(zoomed);
 const pinchElsewhere = () => page.evaluate(() => [document.querySelector('header'), document.querySelector('.layers-panel, nav[aria-label="Editor navigation"]')].map(target => { const event = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }); target?.dispatchEvent(event); return event.defaultPrevented; }));
 const settled = await scale();
 expect(await pinchElsewhere()).toEqual([true, true]);
 expect(await scale()).toBe(settled);

 // Clicking a generated link selects it instead of navigating the frame to the app.
 const link = frame.getByRole('link', { name: 'Shop the edit' });
 const linkBox = (await link.boundingBox())!;
 await page.mouse.click(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2);
 await expect(page.locator('[data-screen-selection]')).toBeVisible();
 await expect(frame.getByRole('heading', { name: 'Layers made for slow mornings' })).toBeVisible();
 await expect(page.getByLabel('Selected element properties')).toContainText('in section hero');
 await expect(page.getByLabel('Selected element properties')).toContainText('Shop the edit');

 // The composer shows the selection as a scope toggle and a context chip with a live thumbnail; hovering shows a larger preview.
 await page.getByRole('button', { name: 'Project conversation' }).click();
 const scope = page.getByRole('group', { name: 'Edit scope' });
 await expect(scope.getByRole('button', { name: 'Section edit' })).toHaveAttribute('aria-pressed', 'true');
 await expect(page.getByText(/Changes only hero/)).toBeVisible();
 await scope.getByRole('button', { name: 'Add section' }).click();
 await expect(page.getByText('Adds a new section after hero.')).toBeVisible();
 await scope.getByRole('button', { name: 'Section edit' }).click();
 const chip = page.getByTestId('selection-context');
 await expect(chip).toContainText('hero');
 await expect(chip.locator('iframe[title="Selection thumbnail"]')).toHaveCount(1);
 await chip.hover();
 const card = page.getByRole('tooltip', { name: 'Selection preview' });
 await expect(card).toBeVisible();
 await expect(card.frameLocator('iframe[title="Selection preview"]').getByText('Shop the edit')).toBeVisible();

 // The review card shows the request without its routing markers.
 const review = page.getByRole('region', { name: 'Changes ready for approval' });
 await expect(review).toContainText('Tighten the hero spacing');
 await expect(review).not.toContainText('guildos-');

 // Sending turns the selection into a scoped request, then clears the selection.
 const sent = page.waitForRequest(request => request.url().endsWith('/api/studio/notes') && request.method() === 'POST');
 await page.getByPlaceholder(/Ask for changes/).fill('Make this button rust');
 await page.getByRole('button', { name: 'Send message' }).click();
 const payload = JSON.parse((await sent).postData()!);
 expect(payload.screenScope).toEqual({ mode: 'section', sectionId: 'hero', path: expect.stringMatching(/nth-child/) });
 expect(payload.screenId).toBe(published.id);
 // The selection is shown in the sent message as a reference.
 expect(payload.displayMessage).toBe('#hero Make this button rust');
 expect(payload.text).toMatch(/^#hero Make this button rust/);
 await expect(page.getByText('#hero', { exact: true }).first()).toBeVisible();
 await expect(chip).toHaveCount(0);
 await expect(page.locator('[data-screen-selection]')).toHaveCount(0);

 // Request changes goes back to the reviewed screen and section, with no selection needed.
 await review.getByRole('button', { name: 'Request changes' }).click();
 const revision = page.waitForRequest(request => request.url().endsWith('/api/studio/notes') && request.method() === 'POST');
 await page.getByPlaceholder(/Ask for changes/).fill('A little more space');
 await page.getByRole('button', { name: 'Send message' }).click();
 const revised = JSON.parse((await revision).postData()!);
 expect(revised).toMatchObject({ screenId: published.id, screenScope: { mode: 'section', sectionId: 'hero' } });
 expect(revised.text).toContain('Revise the completed work for: Tighten the hero spacing');
 expect(revised.text).not.toContain('guildos-');
});

test('manual edit opens a full-screen editor: layers, style panel, inline text, blocks, undo and save', async ({ page, request }) => {
 await page.setViewportSize({ width: 1440, height: 1000 });
 await page.route('https://images.unsplash.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e8d5bc"/></svg>' }));
 await page.goto('/signin');
 await page.getByLabel('Email address').fill('studio-test@example.com');
 await page.getByRole('button', { name: 'Send sign-in code' }).click();
 await page.getByLabel('Email code').fill('123456');
 await page.getByRole('button', { name: 'Enter your studio' }).click();
 await page.getByRole('link', { name: 'New project', exact: true }).click();
 await page.getByLabel('Project name').fill('Threadline manual');
 await page.getByLabel('Your creative brief').fill('A mobile app for a small clothing shop selling linen and wool basics.');
 await page.getByRole('button', { name: 'Create project', exact: true }).click();
 await expect(page).toHaveURL(/\/studio\/projects\/[0-9a-f-]{36}$/);
 const projectId = new URL(page.url()).pathname.split('/').at(-1)!;
 const kinds = ['app-header', 'hero', 'category-chips'];
 const sections = await Promise.all(kinds.map(async kind => ({ id: kind, kind, intent: `The ${kind}.`, status: 'ready', html: await fixture(kind) })));
 const screen = { kind: 'html-screen', name: 'Threadline home', device: 'mobile', background: '#fbfaf7', tokens: { colors: { primary: '#1f3d36', accent: '#d9a441', ink: '#1b1f24', muted: '#6b7280', surface: '#f3f1ec', line: '#e5e2da' }, fontSans: 'Inter' }, sections };
 await request.post('http://127.0.0.1:3199/testing/screen', { data: { project_id: projectId, document: screen } });
 await request.post('http://127.0.0.1:3199/testing/screen', { data: { project_id: projectId, document: { ...screen, name: 'Threadline cart' }, x: 535 } });
 await page.reload();
 await expect(page.frameLocator('iframe[title="Threadline home"]').getByRole('heading', { name: 'Threadline' })).toBeVisible();

 // The floating toolbar appears only while the screen is selected: click it to select, click empty canvas or press Escape to deselect.
 const toolbar = page.getByRole('toolbar', { name: 'Threadline home toolbar' });
 await expect(toolbar).toHaveCount(0);
 // The screen moves when side panels open, so it is measured before every click.
 const clickScreen = async () => { await page.locator('iframe[title="Threadline home"]').scrollIntoViewIfNeeded(); const frameBox = (await page.locator('iframe[title="Threadline home"]').boundingBox())!; await page.mouse.click(frameBox.x + frameBox.width / 2, frameBox.y + 60); };
 await clickScreen();
 await expect(toolbar).toBeVisible();
 const canvasBox = (await page.locator('.canvas-scroll').boundingBox())!;
 await page.mouse.click(canvasBox.x + 30, canvasBox.y + canvasBox.height / 2);
 await expect(toolbar).toHaveCount(0);
 await expect(page.locator('[data-screen-selection]')).toHaveCount(0);
 await clickScreen();
 await expect(toolbar).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(toolbar).toHaveCount(0);
 // The board holds every screen; dragging a title moves that screen and saves its position.
 await expect(page.locator('iframe[title="Threadline cart"]')).toBeVisible();
 const title = page.getByRole('button', { name: 'Threadline cart: drag to move' });
 await title.scrollIntoViewIfNeeded();
 const titleBox = (await title.boundingBox())!;
 const moved = page.waitForRequest(request => request.url().endsWith('/api/studio/screens') && request.method() === 'PATCH');
 await page.mouse.move(titleBox.x + 10, titleBox.y + 5);
 await page.mouse.down();
 await page.mouse.move(titleBox.x + 70, titleBox.y + 45, { steps: 5 });
 await page.mouse.up();
 const position = JSON.parse((await moved).postData()!);
 expect(position.x).toBeGreaterThan(535);
 expect(position.y).toBeGreaterThan(0);
 await expect(page.getByRole('toolbar', { name: 'Threadline cart toolbar' })).toHaveCount(0);

 await clickScreen();
 await expect(toolbar).toBeVisible();
 // Generate › Desktop version asks the agents for the same screen at another width.
 await toolbar.getByRole('button', { name: 'Generate' }).hover();
 const generateMenu = page.getByRole('menu', { name: 'Generate' });
 await expect(generateMenu.getByRole('menuitem')).toHaveText([/Variations/, /Desktop version/, /Tablet version/]);
 const deviceRequest = page.waitForRequest(request => request.url().endsWith('/api/studio/notes') && request.method() === 'POST');
 await generateMenu.getByRole('menuitem', { name: /Desktop version/ }).click();
 const device = JSON.parse((await deviceRequest).postData()!);
 expect(device).toMatchObject({ deviceVersion: 'desktop', screenId: expect.stringMatching(/^[0-9a-f-]{36}$/), displayMessage: '#Threadline-home Create a desktop version.' });

 // Generate › Variations (⌥O) queues two alternative looks of the same screen.
 const variationRequests: Record<string, unknown>[] = [];
 page.on('request', request => { if (request.url().endsWith('/api/studio/notes') && request.method() === 'POST' && JSON.parse(request.postData()!).variation) variationRequests.push(JSON.parse(request.postData()!)); });
 await expect(toolbar).toBeVisible();
 await page.keyboard.press('Alt+KeyO');
 await expect.poll(() => variationRequests.length).toBe(2);
 expect(variationRequests.map(request => [request.variation, request.screenId])).toEqual([[1, device.screenId], [2, device.screenId]]);

 // More › Duplicate copies the current design to a new screen and selects it.
 await toolbar.getByRole('button', { name: 'More' }).hover();
 await page.getByRole('menu', { name: 'More' }).getByRole('menuitem', { name: /Duplicate/ }).click();
 await expect(page.locator('iframe[title="Threadline home copy"]')).toBeVisible();
 await expect(page.getByRole('toolbar', { name: 'Threadline home copy toolbar' })).toBeVisible();

 // Double-clicking a title renames the screen.
 const copyTitle = page.getByRole('button', { name: 'Threadline home copy: drag to move' });
 await copyTitle.scrollIntoViewIfNeeded();
 const renamed = page.waitForRequest(request => request.url().endsWith('/api/studio/screens') && request.method() === 'PATCH');
 await copyTitle.dblclick();
 const nameInput = page.getByRole('textbox', { name: 'Screen name' });
 await nameInput.fill('Threadline sale');
 await nameInput.press('Enter');
 expect(JSON.parse((await renamed).postData()!)).toMatchObject({ name: 'Threadline sale' });
 await expect(page.getByRole('button', { name: 'Threadline sale: drag to move' })).toBeVisible();
 await page.keyboard.press('Escape');
 await clickScreen();
 await toolbar.getByRole('button', { name: 'Edit' }).hover();
 const editMenu = page.getByRole('menu', { name: 'Edit' });
 await expect(editMenu.getByRole('menuitem')).toHaveText([/Global Edit/, /Section Edit/, /Manual Edit/, /Add New Section/]);
 // With an element selected, Section Edit opens the chat in Section edit mode.
 await editMenu.getByRole('menuitem', { name: /Section Edit/ }).click();
 await expect(page.getByRole('group', { name: 'Edit scope' }).getByRole('button', { name: 'Section edit' })).toHaveAttribute('aria-pressed', 'true');
 await expect(page.getByPlaceholder(/Ask for changes/)).toBeFocused();

 // Code shows the standalone export; Preview renders it at a chosen device width.
 await toolbar.getByRole('button', { name: 'Code' }).click();
 const code = page.getByRole('dialog', { name: 'Code' });
 await expect(code).toContainText('threadline-home.html');
 await expect(code).toContainText('<!DOCTYPE html>');
 await expect(code).toContainText('Layers made for slow mornings');
 await code.getByRole('button', { name: 'Close code' }).click();
 await toolbar.getByRole('button', { name: 'Preview' }).click();
 const preview = page.getByRole('dialog', { name: 'Preview' });
 await expect(preview.frameLocator('iframe[title="Threadline home preview"]').getByRole('heading', { name: 'Threadline' })).toBeVisible();
 await preview.getByRole('button', { name: 'Tablet' }).click();
 await expect(preview.locator('iframe[title="Threadline home preview"]')).toHaveCSS('width', '768px');
 await preview.getByRole('button', { name: 'Close preview' }).click();

 // ⌥M opens Manual Edit, like the menu item, while the screen is selected.
 await expect(toolbar).toBeVisible();
 await page.keyboard.press('Alt+KeyM');
 const editor = page.getByRole('dialog', { name: 'Manual edit' });
 const frame = page.frameLocator('iframe[title="Threadline home (editing)"]');
 await expect(frame.getByRole('heading', { name: 'Threadline' })).toBeVisible();
 await expect(editor.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();
 const tree = editor.getByRole('tree');
 await expect(tree.getByRole('treeitem', { name: 'app-header' })).toBeVisible();
 await expect(tree.getByRole('treeitem', { name: 'hero' })).toBeVisible();

 // Pinch zooms the editor's screen (also from inside the frame), never the page.
 const zoomSelect = editor.getByRole('combobox', { name: 'Zoom' });
 const zoomBefore = await zoomSelect.textContent();
 const stageBox = (await editor.locator('[data-editor-surface]').boundingBox())!;
 await page.keyboard.down('Control');
 await page.mouse.move(stageBox.x + 40, stageBox.y + 40);
 await page.mouse.wheel(0, -300);
 await page.keyboard.up('Control');
 await expect(zoomSelect).not.toHaveText(zoomBefore!);
 expect(await frame.locator('body').evaluate(body => { const event = new WheelEvent('wheel', { deltaY: -50, ctrlKey: true, bubbles: true, cancelable: true }); body.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
 await zoomSelect.click();
 await page.getByRole('option', { name: /^Fit/ }).click();

 // Select the brand heading from the layer tree, then style it from the panel.
 await tree.getByRole('treeitem', { name: 'Threadline', exact: true }).click();
 const panel = editor.getByLabel('Selected element properties');
 await expect(panel).toContainText('Heading');
 await panel.getByRole('spinbutton', { name: 'Size' }).fill('34');
 await panel.getByRole('spinbutton', { name: 'Size' }).blur();
 await expect(frame.getByRole('heading', { name: 'Threadline' })).toHaveCSS('font-size', '34px');

 // Inline text edit, then undo and redo.
 const surface = editor.locator('[data-screen-layer]');
 const heading = frame.getByRole('heading', { name: 'Threadline' });
 const box = (await heading.boundingBox())!;
 await page.mouse.dblclick(box.x + 10, box.y + box.height / 2);
 await expect(heading).toHaveAttribute('contenteditable', 'true');
 await page.keyboard.type('Threadline Studio');
 await page.keyboard.press('Escape');
 await expect(frame.getByRole('heading', { name: 'Threadline Studio' })).toBeVisible();
 await editor.getByRole('button', { name: 'Undo' }).click();
 await expect(frame.getByRole('heading', { name: 'Threadline', exact: true })).toBeVisible();
 await editor.getByRole('button', { name: 'Redo' }).click();
 await expect(frame.getByRole('heading', { name: 'Threadline Studio' })).toBeVisible();

 // Blocks insert after the selection; the element toolbar moves it.
 await editor.getByRole('tab', { name: 'Blocks' }).click();
 await editor.getByRole('button', { name: 'Paragraph' }).click();
 await expect(frame.getByText('Write something useful here.')).toBeVisible();
 await editor.getByRole('button', { name: 'Move up' }).click();
 await expect(surface).toBeVisible();

 // Saving commits a sanitised version of this screen; the board shows it after closing.
 const saved = page.waitForResponse(response => response.url().endsWith('/api/studio/screens') && response.request().method() === 'POST');
 await editor.getByRole('button', { name: 'Save Changes' }).click();
 const body = await (await saved).json();
 const header = body.version.document.sections.find((section: { id: string }) => section.id === 'app-header').html;
 expect(header).toContain('Threadline Studio');
 expect(header).toContain('font-size: 34px');
 expect(header).toContain('Write something useful here.');
 expect(header).not.toContain('contenteditable');
 await expect(editor.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
 // Unsaved edits are confirmed before leaving through the logo.
 await tree.getByRole('treeitem', { name: 'Threadline Studio', exact: true }).click();
 await editor.getByRole('button', { name: 'Duplicate' }).click();
 await editor.getByRole('link', { name: 'Back to dashboard' }).click();
 await expect(page.getByRole('dialog', { name: 'Discard unsaved edits?' })).toBeVisible();
 await page.getByRole('button', { name: 'Keep editing' }).click();
 await editor.getByRole('button', { name: 'Undo' }).click();
 await editor.getByRole('button', { name: 'Close' }).click();
 await expect(editor).toHaveCount(0);
 await expect(page.frameLocator('iframe[title="Threadline home"]').getByRole('heading', { name: 'Threadline Studio' })).toBeVisible();
});

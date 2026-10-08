import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

test('desktop signup and duplicate submission complete against the real database', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const email = `browser-${randomUUID()}@example.com`;
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByRole('status')).toContainText('You’re on the list.');
  }
  const db = new DatabaseSync(process.env.GUILDOS_E2E_DB_PATH!);
  try { expect(db.prepare('SELECT count(*) AS total FROM waitlist WHERE email = ?').get(email)?.total).toBe(1); }
  finally { db.close(); }
  expect(errors).toEqual([]);
});

test('mobile layout fits and form errors allow retry', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route('**/api/waitlist', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Please try again shortly.' }) }));
  await page.getByRole('textbox', { name: 'Email address' }).fill('retry@example.com');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('form', { name: 'Join the GuildOS waitlist' }).getByRole('alert')).toContainText('Please try again shortly.');
  await expect(page.getByRole('button', { name: 'Join the waitlist' })).toBeEnabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.unroute('**/api/waitlist');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('status')).toContainText('You’re on the list.');
});

test('unused image optimization endpoint is disabled', async ({ request }) => {
  const response = await request.get('/_next/image?url=%2Ficon.svg&w=640&q=75');
  expect(response.status()).toBe(404);
});

test('reduced motion leaves the creative artwork static', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.sketch-stroke')).toHaveCSS('stroke-dashoffset', '0px');
  await expect(page.locator('.petal-orbit')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.hero-landscape')).toHaveCSS('transform', 'none');
  await expect(page.locator('#hero-title')).toHaveCSS('opacity', '1');
});

test('scroll motion reveals content once and responds to reduced-motion changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const background = page.locator('.hero-landscape');
  await expect(background).not.toHaveCSS('transform', 'none');
  const initialTransform = await background.evaluate(element => getComputedStyle(element).transform);
  await page.evaluate(() => window.scrollTo({ top: 250, behavior: 'instant' }));
  await expect.poll(() => background.evaluate(element => getComputedStyle(element).transform)).not.toBe(initialTransform);
  await expect(background).toHaveCSS('opacity', '0.6');
  const coast = page.locator('.coast-figure');
  await coast.scrollIntoViewIfNeeded();
  await expect(coast).toHaveCSS('opacity', '1');
  await expect(coast).toHaveCSS('transform', 'none');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await coast.scrollIntoViewIfNeeded();
  await expect(coast).toHaveCSS('opacity', '1');
  await expect(coast).toHaveCSS('transform', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(background).toHaveCSS('transform', 'none');
  await page.locator('.closing-copy').scrollIntoViewIfNeeded();
  await expect(page.locator('.closing-copy')).toHaveCSS('opacity', '1');
  await expect(page.locator('.closing-landscape')).toHaveCSS('transform', 'none');
});


test('sixth API attempt is rate limited and the UI displays a retry message', async ({ page, request }) => {
  const ip = '203.0.113.99';
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await request.post('/api/waitlist', {
      headers: { 'x-vercel-forwarded-for': ip }, data: { email: `limited-${randomUUID()}@example.com` },
    });
    expect(response.status()).toBe(200);
  }
  const blocked = await request.post('/api/waitlist', {
    headers: { 'x-vercel-forwarded-for': ip }, data: { email: 'blocked@example.com' },
  });
  expect(blocked.status()).toBe(429);
  expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0);
  await page.setExtraHTTPHeaders({ 'x-vercel-forwarded-for': ip });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email address' }).fill('blocked@example.com');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('form', { name: 'Join the GuildOS waitlist' }).getByRole('alert')).toContainText('Too many attempts');
  await expect(page.getByRole('status')).toHaveCount(0);
});

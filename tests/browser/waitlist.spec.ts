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
  await expect(page.locator('.loop-sculpture')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.creative-loop')).toBeVisible();
  await expect(page.locator('.sketch-stroke')).toHaveCSS('stroke-dashoffset', '0px');
  await expect(page.locator('.petal-orbit')).toHaveCSS('animation-name', 'none');
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

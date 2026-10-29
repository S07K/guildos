import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

test('Google PKCE callback establishes a bounded session and tampering fails closed',async({page,context})=>{
 await page.route('http://127.0.0.1:3199/auth/v1/authorize?**',async route=>{
  const url=new URL(route.request().url());
  expect(url.searchParams.get('provider')).toBe('google');
  expect(url.searchParams.get('code_challenge')).toBeTruthy();
  expect(url.searchParams.get('code_challenge_method')).toBe('s256');
  expect(url.searchParams.get('access_type')).toBe('offline');
  expect(url.searchParams.get('prompt')).toBe('select_account');
  const callback=new URL(url.searchParams.get('redirect_to')!);callback.searchParams.set('code','fixture-oauth-code');
  await route.fulfill({status:302,headers:{location:callback.href}});
 });
 await page.goto('/signin?next=/studio/projects');
 await page.getByRole('button',{name:'Continue with Google'}).click();
 await expect(page).toHaveURL(/\/studio\/projects$/);
 const original=await context.cookies();
 const marker=original.find(cookie=>cookie.name==='guildos_session_issued_at')!;
 expect(marker).toBeTruthy();expect(marker.httpOnly).toBe(true);expect(marker.secure).toBe(true);expect(marker.sameSite).toBe('Lax');
 expect((await page.request.get('/api/studio/icons')).status()).toBe(200);
 await context.addCookies([{...marker,value:marker.value+'tampered'}]);
 expect((await page.request.get('/api/studio/icons')).status()).toBe(401);
 // Retain valid auth tokens but supply a correctly signed expired app deadline.
 await context.addCookies(original);
 const payload=JSON.parse(Buffer.from(marker.value.split('.')[0],'base64url').toString());payload.issuedAt-=86400;
 const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const signature=createHmac('sha256','a'.repeat(64)).update(`guildos-session-v1:${encoded}`).digest('base64url');
 await context.addCookies([{...marker,value:`${encoded}.${signature}`}]);
 expect((await page.request.get('/api/studio/icons')).status()).toBe(401);
 await page.goto('/studio');await expect(page).toHaveURL(/\/signin/);
});

test('OAuth errors and unsafe return URLs stay on the sign-in page',async({page})=>{
 await page.goto('/auth/callback?error=access_denied&next=https://evil.example');
 await expect(page).toHaveURL(/\/signin\?error=oauth&next=%2Fstudio$/);
 await expect(page.getByRole('alert').filter({hasText:'Google sign-in'})).toBeVisible();
});


test('root OAuth codes are redirected to the PKCE callback with all query parameters',async({page})=>{
 await page.goto('/?code=fixture-oauth-code&next=%2Fstudio%2Fprojects&state=preserved');
 await expect(page).toHaveURL(/\/signin\?error=oauth&next=%2Fstudio%2Fprojects$/);
 await page.goto('/?code=fixture-oauth-code');
 await expect(page).toHaveURL(/\/signin\?error=oauth&next=%2Fstudio$/);
});

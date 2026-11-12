import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests/studio-browser', workers: 1, fullyParallel: false,
 outputDir: './test-results/studio',
 use: { ignoreHTTPSErrors: true, baseURL: 'https://127.0.0.1:3105', trace: 'retain-on-failure', launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {} },
 webServer: [
  { command: 'node tests/fixtures/studio-server.mjs', url: 'http://127.0.0.1:3199/health', reuseExistingServer: false },
  { command: 'node tests/fixtures/studio-https.mjs', ignoreHTTPSErrors: true, url: 'https://127.0.0.1:3105/signin', reuseExistingServer: false, env: {
   SUPABASE_URL: 'http://127.0.0.1:3199', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-studio-only', SUPABASE_SECRET_KEY: 'sb_secret_test-studio-only', STUDIO_VAULT_KEY: 'a'.repeat(64), STUDIO_APP_URL: 'https://127.0.0.1:3105',
  } },
 ],
});

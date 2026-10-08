import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const databasePath = process.env.GUILDOS_E2E_DB_PATH || join(tmpdir(), `guildos-e2e-${process.pid}.sqlite`);
process.env.GUILDOS_E2E_DB_PATH = databasePath;
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  use: { extraHTTPHeaders: { 'x-vercel-forwarded-for': '203.0.113.10' }, baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure', launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {} },
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: { VERCEL: '1', WAITLIST_RATE_LIMIT_SECRET: 'browser-test-only-secret', WAITLIST_STORAGE: 'sqlite', WAITLIST_DB_PATH: databasePath, NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100' },
  },
});

import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT || 4175);
process.env.CONCIERGE_TEST_URL = `http://127.0.0.1:${port}/concierge`;

export default defineConfig({
  testDir: '.',
  workers: 1,
  use: { headless: true },
  webServer: {
    command: 'node scripts/static-test-server.mjs',
    cwd: process.cwd(),
    url: process.env.CONCIERGE_TEST_URL,
    reuseExistingServer: false,
  },
});

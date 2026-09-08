import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  workers: 1,
  use: { headless: true },
  webServer: {
    command: 'node scripts/static-test-server.mjs',
    cwd: '..',
    url: 'http://127.0.0.1:4175/concierge',
    reuseExistingServer: true,
  },
});

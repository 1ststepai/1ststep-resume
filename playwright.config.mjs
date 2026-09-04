import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scripts',
  webServer: {
    command: 'node scripts/static-test-server.mjs',
    url: 'http://127.0.0.1:4175/concierge',
    reuseExistingServer: true,
    timeout: 15_000,
  },
});

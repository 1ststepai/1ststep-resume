import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT || 4175);
const origin = `http://127.0.0.1:${port}`;
process.env.CONCIERGE_TEST_URL = `${origin}/concierge`;

export default defineConfig({
  testDir: './scripts',
  webServer: {
    command: 'node scripts/static-test-server.mjs',
    url: `${origin}/concierge`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});

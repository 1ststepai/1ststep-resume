import { defineConfig } from '@playwright/test';

function browserTestPort() {
  if (!process.env.BROWSER_TEST_PORT) return 4175;
  const port = Number(process.env.BROWSER_TEST_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('BROWSER_TEST_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

const port = browserTestPort();
const origin = `http://127.0.0.1:${port}`;
process.env.BROWSER_TEST_ORIGIN = origin;
process.env.CONCIERGE_TEST_URL = `${origin}/concierge`;

export default defineConfig({
  testDir: './scripts',
  use: {
    baseURL: origin,
  },
  webServer: {
    command: 'node scripts/static-test-server.mjs',
    env: {
      ...process.env,
      PORT: String(port),
    },
    url: `${origin}/concierge`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});

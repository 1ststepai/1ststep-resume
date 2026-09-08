import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

let server;
const origin = 'http://127.0.0.1:4186';
test.beforeAll(async () => {
  server = spawn(process.execPath, ['scripts/static-test-server.mjs'], { env: { ...process.env, PORT: '4186' }, stdio: 'ignore' });
  await expect.poll(async () => fetch(`${origin}/pricing.html`).then(r => r.status).catch(() => 0)).toBe(200);
});
test.afterAll(() => server?.kill());

for (const width of [390, 1440]) {
  test(`Agent pricing preserves beta and legacy boundaries at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.route('https://**/*', route => route.abort());
    await page.goto(`${origin}/pricing.html`);
    const card = page.locator('#job-agent-pricing');
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await expect(card).toContainText('$39/month when paid access opens.');
    await expect(card).toContainText('first 10 approved early-access users');
    await expect(card).toContainText('no automatic switch to a paid plan');
    await expect(card).toContainText('remain in control of employer-facing actions');
    await expect(card).toContainText('Paid checkout is not available yet');
    await expect(card.locator('a[href^="mailto:"]')).toHaveAttribute('href', 'mailto:sales@1ststep.ai?subject=1stStep%20Complete%20early%20access');
    await expect(card.locator('a[href*="stripe.com"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: join(tmpdir(), `app-agent-pricing-${width}.png`) });
    await card.getByRole('link', { name: 'Already invited? Open Job Agent' }).click();
    await expect(page).toHaveURL(`${origin}/concierge`);
    await expect(page.locator('body')).toContainText('Job Agent');
  });
}

test('pricing presentation has no billing scripts or checkout mutations', () => {
  const html = readFileSync('pricing.html', 'utf8');
  const card = html.match(/<section class="cta-banner" id="job-agent-pricing"[\s\S]*?<\/section>/)?.[0];
  expect(card).toBeTruthy();
  expect(card).not.toMatch(/<script|checkout-session|buy\.stripe\.com/);
});

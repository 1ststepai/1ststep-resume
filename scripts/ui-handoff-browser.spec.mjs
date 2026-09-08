import { test, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = 'http://127.0.0.1:4175';

test('subscriber workspace uses light surfaces and opens Needs You', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/concierge?uiFixture=subscriber`);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
  await expect(page.locator('.daily-dashboard')).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), '1ststep-ui-handoff-desktop.png') });
  await page.locator('#openNeedsYou').click();
  await expect(page.locator('.needs-sheet')).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), '1ststep-ui-handoff-needs-you.png') });
});

test('resume route uses the mobile Job Agent editor instead of the legacy chooser', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/app-config', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authentication: { clerk: { enabled: false }, restoreAccessAvailable: false } }) }));
  await page.route('**/api/session-capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session' }) }));
  await page.route('**/api/applicant-vault', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 0, vault: null }) }));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}/app/resume`);
  await expect(page.locator('#resumeOverlay')).toHaveClass(/open/);
  await expect(page.locator('#resumeEditor')).toBeVisible();
  await expect(page.locator('#welcomeOverlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

for (const width of [375, 390, 720]) {
  test(`mobile navigation has readable labels and usable targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/concierge`);
    for (const button of await page.locator('.agent-header nav button:visible').all()) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(10.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('reduced motion keeps workspace progress visible without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/app/resume`);
  const result = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'agent-working-track';
    document.body.append(el);
    const value = getComputedStyle(el).animationName;
    el.remove();
    return value;
  });
  expect(result).toBe('none');
});

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

test('resume chooser hides unavailable capability, stacks on mobile, and opens builder', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}/app/resume`);
  await expect(page.locator('#welcomeResumeProductBtn')).toBeVisible();
  await expect(page.locator('#welcomeExtensionProductBtn')).toBeHidden();
  const columns = await page.locator('#productChoiceGrid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  await page.locator('#welcomeResumeProductBtn').click();
  await page.locator('#welcomeBuildBtn').click();
  await expect(page.locator('#resumeBuilderModal')).toBeVisible();
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
    el.className = 'skeleton';
    document.body.append(el);
    const value = getComputedStyle(el).animationName;
    el.remove();
    return value;
  });
  expect(result).toBe('none');
});

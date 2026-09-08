import { test, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('slow discovery preserves progress, allows retry, and labels partial results', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => {
    sessionStorage.setItem('1ststep_resume', JSON.stringify({ text: 'Synthetic procurement manager resume. '.repeat(20) }));
    const original = window.setTimeout;
    window.setTimeout = (callback, ms, ...args) => original(callback, ms === 40000 ? 100 : ms, ...args);
  });
  let attempts = 0;
  await page.route('**/api/concierge-discovery', async route => {
    attempts += 1;
    if (attempts === 1) { await new Promise(resolve => setTimeout(resolve, 500)); return route.abort().catch(() => {}); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jobs: [], partial: true, status: 'partial', sourceSummary: [] }) });
  });
  await page.goto('http://127.0.0.1:4175/concierge');
  await expect(page).toHaveTitle(/Job Agent/);
  await page.locator('#openGuidedLaunch').click();
  await page.locator('[data-guided-goal="best-fit"]').click();
  await page.locator('#guidedLaunchNext').click();
  await page.locator('#scanOpportunityPaths').click();
  await expect(page.locator('#pathEvidence')).toContainText('try again when ready. Starter');
  await expect(page.locator('#scanOpportunityPaths')).toBeEnabled();
  await page.locator('#scanOpportunityPaths').click();
  await expect(page.locator('#pathEvidence')).toContainText('these results are partial');
  await page.screenshot({ path: join(tmpdir(), '1ststep-discovery-retry-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#scanOpportunityPaths')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), '1ststep-discovery-retry-mobile.png') });
  expect(attempts).toBe(2);
  expect(errors).toEqual([]);
});

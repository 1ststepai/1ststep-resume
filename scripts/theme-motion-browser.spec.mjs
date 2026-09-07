const testOrigin = new URL(process.env.CONCIERGE_TEST_URL || 'http://127.0.0.1:4175/concierge').origin;
import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`landing motion and theme work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(testOrigin + '/', { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/1stStep\.ai/);
    await expect(page.locator('.hero h1')).toBeVisible();
    await expect(page.locator('.demo-stage')).toHaveClass(/motion-running/);
    await expect.poll(() => page.locator('.floating-note').first().evaluate(node => getComputedStyle(node).animationPlayState)).toBe('running');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: `${process.env.TEMP || '/tmp'}/1ststep-home-${width}-light.png`, fullPage: false });
    await page.locator('[data-theme-toggle]').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('[data-theme-toggle]').first()).toHaveAttribute('aria-label', 'Switch to light theme');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.demo-stage')).toHaveClass(/motion-running/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${process.env.TEMP || '/tmp'}/1ststep-home-${width}-dark.png`, fullPage: false });
  });
}

test('Job Agent shares the theme and keeps Admin costs owner-only', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('1ststep_theme', 'dark'));
  await page.route('**/api/session-capabilities*', route => route.fulfill({ json: {
    adminConsole: true, jobAgentAccess: true, tier: 'owner', authentication: 'opaque-session', sessionAuthentication: 'opaque-session',
  } }));
  await page.route('**/api/job-agent-operations*', route => route.fulfill({ json: {
    contentFree: true, unavailable: false, ledgerDate: '2026-09-07', costControl: { configured: true, currency: 'USD', categories: [] },
  } }));
  await page.goto(testOrigin + '/concierge', { waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#openDesk')).toBeVisible();
  await page.locator('#openDesk').click();
  await expect(page.locator('#deskTitle')).toHaveText('Admin control center');
  await page.locator('[data-desk-tab="costs"]').click();
  await expect(page.locator('#costDashboardTitle')).toHaveText('Live costs');
  await expect(page.locator('#costEvidenceNote')).not.toContainText(/employer|resume|candidate/i);
  await page.locator('#closeDesk').click();
  await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

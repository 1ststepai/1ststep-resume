import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`beta request has the approved email and no billing implication at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${Number(process.env.PORT || 4175)}/`);
    const link = page.locator('[data-beta-request]');
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '#waitlist');
    const card = link.locator('xpath=ancestor::article');
    await expect(card.locator('[data-funnel-cta="primary"]')).toHaveText('Start Job Agent');
    await expect(card.locator('a[href="#lead"]')).toBeVisible();
    await expect(card).toContainText('does not grant beta access');
    await expect(card).toContainText('No card required');
    await expect(page.locator('#waitlistForm')).toBeVisible();
    await expect(page.locator('#waitlistTitle')).toHaveText('Join Early Access');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

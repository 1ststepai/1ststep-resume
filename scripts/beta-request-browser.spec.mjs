import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`beta request has the approved email and no billing implication at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4175/');
    const link = page.locator('[data-beta-request]');
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'mailto:evan@1ststep.ai?subject=Job%20Agent%20beta%20request');
    const card = link.locator('xpath=ancestor::article');
    await expect(card).toContainText('first 10 approved beta testers');
    await expect(card).toContainText('no automatic billing');
    await expect(card).toContainText('Sending a request does not reserve a spot');
    await expect(card.locator('a[href="/concierge"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

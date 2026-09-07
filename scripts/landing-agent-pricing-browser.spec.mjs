const testOrigin = new URL(process.env.CONCIERGE_TEST_URL || testOrigin + '/concierge').origin;
import { test, expect } from '@playwright/test';
import { JOB_AGENT_PRICE } from '../lib/job-agent-pricing.js';

for (const width of [390, 1440]) {
  test(`GHL proposal separates beta access from existing checkout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('https://**/*', route => route.abort());
    await page.goto(testOrigin + '/resume-tailor-landing/ghl-cro-custom-code.html');
    const card = page.locator('#stp-job-agent-plan');
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await expect(card).toContainText(`$${JOB_AGENT_PRICE.monthlyCents / 100}`);
    await expect(card).toContainText('/month when paid access opens');
    await expect(card).toContainText('first 10 approved beta testers');
    await expect(card).toContainText('no automatic billing');
    await expect(card).toContainText('submit applications yourself');
    await expect(card.locator('a[href^="mailto:"]')).toHaveAttribute('href', 'mailto:evan@1ststep.ai?subject=Job%20Agent%20beta%20request');
    await expect(card.locator('a[href*="stripe.com"]')).toHaveCount(0);
    await expect(page.locator('a[href="https://buy.stripe.com/5kQ4gA7OFgH14u89fhfIs00"]')).toHaveCount(0);
    await expect(page.locator('text=$24.99')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

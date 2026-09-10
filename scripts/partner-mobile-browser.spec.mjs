import { expect, test } from '@playwright/test';

const origin = new URL(process.env.CONCIERGE_TEST_URL || 'http://127.0.0.1:4175/concierge').origin;
const viewports = [
  ['iPhone-width', { width: 390, height: 844 }],
  ['Android-width', { width: 412, height: 915 }],
];

for (const [name, viewport] of viewports) {
  test(`${name} partner onboarding is touch-safe and has no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/partner', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ partner: null }),
    }));
    await page.goto(`${origin}/partner?path=affiliate-only`);
    await expect(page.getByRole('heading', { name: 'Apply to the partner beta' })).toBeVisible();
    await expect(page.getByText('Affiliate-only applicant — no Job Agent role or data')).toBeVisible();

    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll('button, input')].filter(node => node.offsetParent !== null).map(node => {
        const hitTarget = node.type === 'checkbox' ? node.closest('label') : node;
        return {
          id: node.id,
          width: hitTarget.getBoundingClientRect().width,
          height: hitTarget.getBoundingClientRect().height,
        };
      }),
    }));
    expect(layout.document).toBeLessThanOrEqual(layout.viewport);
    for (const control of layout.controls) {
      expect(control.width, `${control.id} width`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${control.id} height`).toBeGreaterThanOrEqual(44);
    }
  });
}

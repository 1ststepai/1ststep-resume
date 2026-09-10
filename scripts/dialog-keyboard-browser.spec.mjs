import { test, expect } from '@playwright/test';

const base = process.env.BROWSER_TEST_ORIGIN || 'http://127.0.0.1:4175';

// Escape-to-close and the Tab focus trap previously covered only 3 of the 14
// dialogs. From the other 11 a keyboard user could Tab out into the page hidden
// behind the overlay, and had no way to back out without hunting for Close.
const DIALOGS = [
  { trigger: '#openNeedsYou', overlay: '#needsYouOverlay' },
  { trigger: '#openJobs', overlay: '#jobsOverlay' },
  { trigger: '#openVault', overlay: '#vaultOverlay' },
  { trigger: '#openGuidedLaunch', overlay: '#guidedLaunchOverlay' }
];

async function clickTrigger(page, trigger) {
  if (trigger === '#openVault') await page.locator('#appMenu > summary').click();
  if (trigger === '#openGuidedLaunch') await page.locator(trigger).evaluate(node => node.click());
  else await page.locator(trigger).click();
}

for (const { trigger, overlay } of DIALOGS) {
  test(`${overlay} moves focus in and closes on Escape`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${base}/concierge?uiFixture=subscriber`, { waitUntil: 'networkidle' });

    await clickTrigger(page, trigger);
    await expect(page.locator(overlay)).toBeVisible();

    // Focus must land inside the dialog, not stay on the trigger behind it.
    expect(
      await page.evaluate(sel => document.querySelector(sel).contains(document.activeElement), overlay),
      'focus should move into ' + overlay
    ).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator(overlay)).toBeHidden();
  });

  test(`${overlay} keeps Tab inside the dialog`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${base}/concierge?uiFixture=subscriber`, { waitUntil: 'networkidle' });
    await clickTrigger(page, trigger);
    await expect(page.locator(overlay)).toBeVisible();

    // Tab well past the number of controls; focus must never leave the dialog.
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        sel => document.querySelector(sel).contains(document.activeElement),
        overlay
      );
      expect(inside, `Tab ${i + 1} escaped ${overlay}`).toBe(true);
    }
  });
}

test('a dialog with no close control is not dismissed by Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/concierge?uiFixture=subscriber`, { waitUntil: 'networkidle' });

  // questionOverlay must be answered - it intentionally has no Close button.
  await page.evaluate(() => document.getElementById('questionOverlay').classList.add('open'));
  await expect(page.locator('#questionOverlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#questionOverlay')).toBeVisible();
});

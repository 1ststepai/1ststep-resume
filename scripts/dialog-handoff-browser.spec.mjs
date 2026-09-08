import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4175/concierge?uiFixture=subscriber');
});

test('question dialog contains forward, reverse and stray keyboard focus without discarding draft', async ({ page }) => {
  await page.evaluate(() => document.getElementById('questionOverlay').classList.add('open'));
  await page.locator('#questionValue').fill('Synthetic draft answer');
  for (const key of ['Tab', 'Shift+Tab', 'Escape']) {
    await page.keyboard.press(key);
    await expect(page.locator('#questionOverlay')).toBeVisible();
    expect(await page.evaluate(() => document.getElementById('questionOverlay').contains(document.activeElement))).toBe(true);
  }
  await page.locator('#openJobs').evaluate(node => node.focus());
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.getElementById('questionOverlay').contains(document.activeElement))).toBe(true);
  await expect(page.locator('#questionValue')).toHaveValue('Synthetic draft answer');
});

for (const [trigger, dialog] of [['openJobs', 'jobsOverlay'], ['openVault', 'vaultOverlay']]) {
  test(`${dialog} returns focus to its trigger after Escape`, async ({ page }) => {
    await page.locator(`#${trigger}`).click();
    await expect(page.locator(`#${dialog}`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(`#${dialog}`)).toBeHidden();
    await expect(page.locator(`#${trigger}`)).toBeFocused();
  });
}

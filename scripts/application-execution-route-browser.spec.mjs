const testOrigin = new URL(process.env.CONCIERGE_TEST_URL || testOrigin + '/concierge').origin;
import { test, expect } from '@playwright/test';
test('local employer handoff is the default and unavailable cloud cannot start', async ({ page }) => {
  const cloudCreates = [];
  await page.route('**/api/**', route => {
    if (route.request().url().includes('employer-browser-session') && route.request().method() === 'POST') cloudCreates.push(route.request().url());
    return route.fulfill({status:503,json:{error:'Synthetic unconfigured provider'}});
  });
  await page.goto(testOrigin + '/concierge?uiFixture=durable-application');
  await page.locator('#resumeApplication').click();
  await expect(page.locator('#applicationExecutionRoute')).toBeVisible();
  await expect(page.getByRole('link',{name:'1. Open employer application',exact:true})).toHaveAttribute('href','https://careers.example.com/jobs/REQ-DEMO-204');
  await expect(page.getByRole('button',{name:'Use cloud browser instead',exact:true})).toHaveCount(0);
  await expect(page.locator('#applicationBrowserHandoff')).toBeHidden();
  expect(cloudCreates).toEqual([]);
});

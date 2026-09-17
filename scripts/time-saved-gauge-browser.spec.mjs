import { test, expect } from '@playwright/test';

const baseUrl = process.env.CONCIERGE_TEST_URL || 'http://127.0.0.1:4175/concierge';

test('evidence-backed time-saved gauge is visible, transparent, and responsive', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}?uiFixture=subscriber`, { waitUntil: 'networkidle' });

  await expect(page).toHaveTitle(/1stStep/i);
  await expect(page.locator('#timeSavedCard')).toBeVisible();
  await page.locator('.time-saved-details summary').click();
  await expect(page.locator('#timeSavedTotal')).toHaveText('47 min');
  await expect(page.locator('#timeSavedWeek')).toHaveText('47 min');
  await expect(page.locator('#timeSavedSession')).toHaveText('47 min');
  await expect(page.locator('#timeSavedNext')).toContainText('13 estimated min');
  await expect(page.locator('#timeSavedBreakdown')).toContainText('Application packages prepared');
  await expect(page.locator('#timeSavedBreakdown')).toContainText('Employer confirmations tracked');
  await expect(page.locator('.time-saved-details')).toContainText('Failed, duplicate, skipped, or merely attempted work is never counted');
  await page.locator('#timeSavedCard').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${process.env.TEMP || '/tmp'}/job-agent-time-saved-dashboard.png` });

  await page.locator('#openJobs').click();
  await expect(page.locator('#jobsOverlay')).toHaveClass(/open/);
  await expect(page.locator('#jobsTimeSavedTotal')).toHaveText('47 min');
  await page.screenshot({ path: `${process.env.TEMP || '/tmp'}/job-agent-time-saved-desktop.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#jobsTimeSavedTotal')).toBeVisible();
  await page.screenshot({ path: `${process.env.TEMP || '/tmp'}/job-agent-time-saved-mobile.png` });
  expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('job path choice stays concise and does not start discovery during setup', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => {
    sessionStorage.setItem('1ststep_resume', JSON.stringify({ text: 'Synthetic procurement manager resume. '.repeat(20) }));
  });
  let discoveryRequests = 0;
  await page.route('**/api/concierge-discovery', route => { discoveryRequests += 1; return route.fulfill({ contentType: 'application/json', body: '{}' }); });
  await page.goto('/concierge');
  await expect(page).toHaveTitle(/Job Agent/);
  await page.locator('#openGuidedLaunch').click();
  await page.locator('[data-guided-goal="best-fit"]').click();
  await page.locator('#guidedLaunchNext').click();
  await expect(page.locator('#pathStepTitle')).toHaveText('What kind of work do you want?');
  await expect(page.locator('#pathEvidence')).toHaveText('Choose one. You can change this later.');
  await expect(page.getByRole('button', { name: 'Compare live paths' })).toHaveCount(0);
  await expect(page.locator('[data-opportunity-path]').first().locator('small')).toHaveCount(0);
  await page.screenshot({ path: join(tmpdir(), '1ststep-discovery-retry-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), '1ststep-discovery-retry-mobile.png') });
  await page.locator('[data-opportunity-path]').first().click();
  await expect(page.locator('[data-guided-stage="work"]')).toHaveClass(/active/);
  expect(discoveryRequests).toBe(0);
  expect(errors).toEqual([]);
});

test('mobile resume upload advances without exposing the document editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.goto('/concierge');
  await page.locator('#openGuidedLaunch').click();
  await page.locator('[data-guided-goal="best-fit"]').click();
  await expect(page.locator('[data-guided-stage="resume"]')).toHaveClass(/active/);
  await page.screenshot({ path: join(tmpdir(), '1ststep-simple-resume-upload-mobile.png') });

  const chooser = page.waitForEvent('filechooser');
  await page.locator('#quickUploadResume').click();
  await (await chooser).setFiles({
    name: 'synthetic-resume.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(`Synthetic resume\n${'Verified sourcing experience.\n'.repeat(12)}`),
  });

  await expect(page.locator('#resumeOverlay')).not.toHaveClass(/open/);
  await expect(page.locator('#resumeEditor')).toBeHidden();
  await expect(page.locator('[data-guided-stage="path"]')).toHaveClass(/active/);
  await page.waitForTimeout(100);
  await expect(page.locator('.guided-launch-logo')).toBeVisible();
  await expect(page.locator('#guidedLaunchClose')).toBeVisible();
  expect(await page.locator('#guidedLaunchOverlay').evaluate(overlay => overlay.scrollTop)).toBe(0);
  await page.screenshot({ path: join(tmpdir(), '1ststep-simple-job-path-mobile.png') });
});

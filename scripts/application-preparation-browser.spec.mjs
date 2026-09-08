const testOrigin = new URL(process.env.CONCIERGE_TEST_URL || testOrigin + '/concierge').origin;
import { test, expect } from '@playwright/test';

test('a found match produces a reviewable private draft without eligibility or submission promotion', async ({ page }) => {
  const errors = [], posts = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => {
    sessionStorage.setItem('1ststep_resume', 'Synthetic candidate. Procurement manager with verified supplier negotiation experience. '.repeat(12));
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'Unconfigured synthetic service' } }));
  await page.route('**/api/session-capabilities*', route => route.fulfill({ json: { jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session' } }));
  await page.route('**/api/application-packages', async route => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ json: { run: { id: 'run-synthetic-package', status: 'Finished', mission: { roleId: 'fixture-found', employer: 'Northwind Logistics', title: 'Procurement Manager' }, result: { documentVersion: 'draft-v1', resumeText: 'Synthetic private tailored resume draft.', coverLetterText: 'Synthetic private cover letter.', qa: { issues: [] }, artifacts: [], qaStatus: 'text-verified-no-documents-produced' } } } });
  });
  await page.goto(testOrigin + '/concierge?uiFixture=subscriber');
  await page.getByRole('button', { name: 'My Jobs', exact: true }).click();
  const card = page.locator('.simple-job-card').filter({ hasText: 'Northwind Logistics' });
  await card.getByRole('button', { name: 'Prepare application', exact: true }).click();
  await expect(page.locator('#packageReviewOverlay')).toHaveClass(/open/);
  await expect(page.locator('#packageResumeText')).toHaveValue('Synthetic private tailored resume draft.');
  expect(posts).toHaveLength(1);
  expect(posts[0].package.discoveryRunId).toBe('run-fixture-discovery');
  await page.locator('#closePackageReview').click();
  await page.getByRole('button', { name: 'My Jobs', exact: true }).click();
  await expect(card.getByText('Found', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Review resume draft', exact: true }).click();
  expect(posts).toHaveLength(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'output/application-preparation-review-qa.png', fullPage: false });
});

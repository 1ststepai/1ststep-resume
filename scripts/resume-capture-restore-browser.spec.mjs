import { expect, test } from '@playwright/test';

const origin = 'http://127.0.0.1:4175';

test('Resume Builder restores an acknowledged account-backed capture without the extension copy', async ({ page }) => {
  const captureId = 'browser-restore-capture-1234';
  const job = {
    captureId,
    jobId: 'REQ-123',
    jobTitle: 'Customer Operations Lead',
    company: 'Example Co',
    jobDescription: 'Lead customer operations, improve service workflows, and coordinate cross-functional delivery. '.repeat(10),
    applyUrl: 'https://jobs.example.com/REQ-123',
    site: 'jobs.example.com',
    location: 'Remote',
    verification: 'unverified',
    applyPathActive: false,
  };
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/captured-jobs*', async route => route.fulfill({
    status: route.request().method() === 'GET' ? 200 : 201,
    contentType: 'application/json',
    body: JSON.stringify({ job }),
  }));
  await page.goto(`${origin}/app/resume?jobCaptureId=${captureId}&mode=tailor`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#jobText')).toHaveValue(/Lead customer operations/, { timeout: 8_000 });
  await expect(page.locator('#jobContextLabel')).toContainText('Customer Operations Lead');
  await expect(page.locator('#jobContextLabel')).toContainText('Example Co');
});

test('extension installation link shows one concise next action', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/app-config', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/session-capabilities*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobAgentAccess: false, tier: 'free' }) }));
  await page.goto(`${origin}/concierge?welcome=extension`, { waitUntil: 'networkidle' });
  await expect(page.locator('#messages')).toContainText('The browser helper is connected.');
  await expect(page.locator('#messages')).toContainText('Open a job posting, click the 1stStep icon');
});

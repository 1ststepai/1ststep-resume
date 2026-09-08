import { expect, test } from '@playwright/test';

const masterResume = 'Jordan Taylor\n\nOperations professional with verified experience coordinating vendors, contracts, and service delivery.\n\nExperience\nManaged documented supplier communications and maintained accurate project records.';
const origin = new URL(process.env.CONCIERGE_TEST_URL || 'http://127.0.0.1:4175/concierge').origin;

async function routeAccountApis(page, { signedIn }) {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/app-config') return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authentication: { clerk: { enabled: true }, restoreAccessAvailable: false } }),
    });
    if (url.pathname === '/api/session-capabilities') return route.fulfill({
      status: signedIn ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(signedIn ? {
        adminConsole: false,
        jobAgentAccess: true,
        tier: 'complete',
        sessionAuthentication: 'opaque-session',
        sessionExpiresAt: '2026-09-09T12:00:00.000Z',
        jobAgentConsent: null,
        jobAgentConsentPolicyConfigured: false,
      } : { error: 'Request not authorized.', code: 'AUTH_REQUIRED' }),
    });
    if (url.pathname === '/api/applicant-vault') return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 2,
        vault: {
          schemaVersion: 1,
          consent: { status: 'granted', scopes: ['confirmed-facts', 'documents'] },
          updatedAt: '2026-09-08T12:00:00.000Z',
          facts: [],
          documents: [{
            id: 'resume-1', type: 'master-resume', title: 'Master resume', status: 'active', currentVersion: 1,
            versions: [{ version: 1, text: masterResume, fileName: 'master-resume.docx', provenance: 'candidate-reviewed', createdAt: '2026-09-08T12:00:00.000Z' }],
          }],
          audit: [],
        },
      }),
    });
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable in browser fixture.' }) });
  });
}

test('signed account opens the canonical resume editor and hydrates its encrypted master resume', async ({ page }) => {
  await routeAccountApis(page, { signedIn: true });
  await page.goto(`${origin}/app/resume`);

  await expect(page.locator('#resumeOverlay')).toHaveClass(/open/);
  await expect(page.locator('#resumeSetupTitle')).toHaveText('Upload yours or build it here');
  await expect(page.locator('#resumeEditor')).toHaveValue(masterResume);
  await expect(page.locator('#resumeVaultStatus')).toContainText('Encrypted across your signed-in account');
  await expect(page.getByRole('link', { name: 'Back to Job Agent' })).toHaveAttribute('href', '/app');

  const persisted = await page.evaluate(() => ({
    resume: localStorage.getItem('1ststep_resume'),
    resumeText: localStorage.getItem('1ststep_resume_text'),
    profile: localStorage.getItem('1ststep_profile'),
    session: JSON.parse(localStorage.getItem('1ststep_sub_cache') || '{}'),
  }));
  expect(persisted.resume).toBeNull();
  expect(persisted.resumeText).toBeNull();
  expect(persisted.profile).toBeNull();
  expect(persisted.session).toEqual({ jobAgentSession: true });
});

test('signed-out resume route requires account access instead of opening the legacy workspace', async ({ page }) => {
  await routeAccountApis(page, { signedIn: false });
  await page.goto(`${origin}/app/resume`);

  await expect(page).toHaveURL(/\/login\.html\?returnTo=%2Fapp%2Fresume/);
  await expect(page.locator('#resumeOverlay')).toHaveCount(0);
});

test('approved extension capture continues through the supervised funnel', async ({ page }) => {
  await routeAccountApis(page, { signedIn: true });
  await page.goto(`${origin}/app/resume?jobCaptureId=12345678-1234-1234-1234-123456789abc&mode=coverLetter`);

  await expect(page).toHaveURL(/\/funnel\?jobCaptureId=12345678-1234-1234-1234-123456789abc&mode=coverLetter/);
  await expect(page.locator('#welcomeOverlay')).toHaveCount(0);
});

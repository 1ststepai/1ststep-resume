import { expect, test } from '@playwright/test';

const baseUrl = 'http://127.0.0.1:4175/concierge';

test('a generic extension capture is visibly added to Job Agent for supervised review', async ({ page }) => {
  const captureId = 'browser-capture-account-director';
  const acknowledgements = [];

  await page.addInitScript(() => {
    window.addEventListener('message', event => {
      if (event.source === window && event.data?.type === '1STSTEP_JOB_CAPTURE_ACK') {
        window.__captureAcknowledgements = [...(window.__captureAcknowledgements || []), event.data.captureId];
      }
    });
  });
  await page.route('**/api/**', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Synthetic unavailable service' }),
  }));
  await page.route('**/api/app-config', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/session-capabilities*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ jobAgentAccess: true, tier: 'owner', sessionAuthentication: 'opaque-session' }),
  }));

  await page.goto(`${baseUrl}?jobCaptureId=${captureId}&mode=jobAgent`, { waitUntil: 'networkidle' });
  await page.evaluate(({ captureId }) => window.postMessage({
    type: '1STSTEP_JOB_CAPTURE',
    version: '1',
    captureId,
    mode: 'jobAgent',
    jobData: {
      jobTitle: 'Account Director, Health Systems',
      company: 'Zocdoc',
      jobDescription: 'Lead trusted health-system partnerships and enterprise sales cycles. '.repeat(12),
      applyUrl: 'https://job-boards.greenhouse.io/zocdoc/jobs/8074626',
      site: 'greenhouse',
    },
  }, window.location.origin), { captureId });

  await expect(page.locator('#jobsOverlay')).toHaveClass(/open/);
  await expect(page.locator('#jobCards')).toContainText('Account Director, Health Systems');
  await expect(page.locator('#jobCards')).toContainText('Zocdoc');
  await expect(page.locator('#jobCards')).toContainText('Found');
  await expect(page.getByRole('button', { name: 'Use in Resume Builder' })).toBeVisible();
  await expect(page.locator('#jobCardsDescription')).toContainText('Captured jobs stay unverified');
  await expect(page.locator('#jobCards')).not.toContainText(/prepare application|submitted/i);

  const state = await page.evaluate(() => ({
    acknowledgements: window.__captureAcknowledgements || [],
    pending: JSON.parse(sessionStorage.getItem('1ststep_pending_capture') || 'null'),
  }));
  acknowledgements.push(...state.acknowledgements);
  expect(acknowledgements).toContain(captureId);
  expect(state.pending.jobData).toMatchObject({
    jobTitle: 'Account Director, Health Systems',
    company: 'Zocdoc',
    applyUrl: 'https://job-boards.greenhouse.io/zocdoc/jobs/8074626',
  });
});

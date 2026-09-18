import { expect, test } from '@playwright/test';

const baseUrl = process.env.CONCIERGE_TEST_URL || 'http://127.0.0.1:4175/concierge';

test('captured job is acknowledged only after it is saved in My Jobs', async ({ page }) => {
  let savedState = null;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/session-capabilities') {
      return route.fulfill({ json: { jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session' } });
    }
    if (url.pathname === '/api/concierge-state' && request.method() === 'GET') {
      return route.fulfill({ json: {
        version: 1,
        state: {
          version: 1, campaigns: [], activeCampaignId: '', runs: [], items: [], humanActions: [], evidence: [], transitions: [],
          workspace: { version: 1, mission: {}, dailyGoal: { target: 10, updatedAt: null } },
          subscriberView: { version: 1, runState: null, jobCards: [], needsYou: [] },
        },
      } });
    }
    if (url.pathname === '/api/concierge-state' && request.method() === 'PUT') {
      savedState = request.postDataJSON()?.state || null;
      return route.fulfill({ json: { version: 2 } });
    }
    return route.fulfill({ status: 503, json: { error: 'Synthetic service unavailable' } });
  });

  await page.goto(`${baseUrl}?jobCaptureId=capture-browser-1`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#campaignSyncStatus')).toContainText('Secure account state current');
  await page.evaluate(() => {
    window.__captureAcks = [];
    window.addEventListener('message', event => {
      if (event.data?.type === '1STSTEP_JOB_CAPTURE_ACK') window.__captureAcks.push(event.data.captureId);
    });
    window.postMessage({
      type: '1STSTEP_JOB_CAPTURE', version: '1', captureId: 'capture-browser-1',
      jobData: {
        jobTitle: 'Operations Lead', company: 'Example Industries', jobId: 'OPS-123',
        jobDescription: 'Lead operations, reporting, vendor coordination, and process improvement. '.repeat(8),
        applyUrl: 'https://careers.example.com/jobs/ops-123', sourceLabel: 'careers.example.com',
        location: 'Newark, NJ', salary: 'USD 100000-125000 YEAR', employmentType: 'Full-time', postedDate: '2026-09-08',
      },
    }, location.origin);
  });

  await expect.poll(() => savedState?.subscriberView?.jobCards?.length || 0).toBe(1);
  expect(savedState.subscriberView.jobCards[0]).toMatchObject({
    employer: 'Example Industries', title: 'Operations Lead', requisitionId: 'OPS-123',
    status: 'Found', sourceProvider: 'browser-capture', applyPathActive: false,
  });
  await expect.poll(() => page.evaluate(() => window.__captureAcks)).toEqual(['capture-browser-1']);
  await expect(page.locator('#jobsOverlay')).toHaveClass(/open/);
  await expect(page.locator('#jobCards')).toContainText('Example Industries');
});


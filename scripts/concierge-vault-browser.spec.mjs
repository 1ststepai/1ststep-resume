import { test, expect } from '@playwright/test';
import { jobAgentPolicyBundle } from '../lib/job-agent-policy-bundle.js';

const baseUrl = process.env.CONCIERGE_TEST_URL || 'http://127.0.0.1:4175/concierge';

async function routeEncryptedResumeVault(page, resumeText = `Candidate reviewed resume\n${'Verified procurement and vendor-management experience.\n'.repeat(8)}`) {
  await page.route('**/api/applicant-vault', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      version: 1,
      vault: {
        consent: { status: 'granted' }, facts: [],
        documents: [{
          id: 'master_resume_browser_fixture', title: 'Master resume', type: 'master-resume', status: 'active', currentVersion: 1,
          versions: [{ version: 1, text: resumeText, fileName: 'master-resume.txt', provenance: 'candidate-reviewed' }],
        }],
      },
    }),
  }));
}

async function routeAccountWorkspace(page, { mission, runState = 'Preparing', jobCards = [], needsYou = [] }) {
  await page.route('**/api/concierge-state', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      version: 1,
      state: {
        version: 1, campaigns: [], activeCampaignId: '', runs: [], items: [], humanActions: [], evidence: [], transitions: [],
        workspace: { version: 1, mission, dailyGoal: { target: mission.target || 10, updatedAt: '2026-08-30T10:00:00.000Z' } },
        subscriberView: { version: 1, runState, jobCards, needsYou },
      },
    }),
  }));
}

async function reachGuidedLaunchReview(page, { goal = 'best-fit', salary = '0' } = {}) {
  await page.locator('#openGuidedLaunch').click();
  await page.locator(`[data-guided-goal="${goal}"]`).click();
  await expect(page.locator('#quickResumeState')).toContainText('Resume ready');
  await page.locator('#guidedLaunchNext').click();
  await page.locator('[data-opportunity-path]').first().click();
  await page.locator('[data-launch-choice="workMode"][data-value="Remote"]').click();
  await page.locator('[data-launch-choice="employmentType"][data-value="Full-time"]').click();
  await page.locator(`[data-launch-choice="salary"][data-value="${salary}"]`).click();
  await expect(page.locator('#startJobSearch')).toBeVisible();
}

test('core onboarding stays short and refuses secret-shaped answers without advancing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('1ststep_applicant_vault_preference_v1', 'device-only'));
  await page.goto(baseUrl);
  await page.locator('#messageInput').fill('Start onboarding');
  await page.locator('#composer').evaluate(form => form.requestSubmit());
  await expect(page.locator('#questionOverlay')).toHaveClass(/open/);
  await expect(page.locator('#questionProgress')).toHaveText('Core setup 1 of 15 · 0% ready');
  await page.locator('#questionValue').fill('password is hunter2');
  await page.locator('#questionForm').evaluate(form => form.requestSubmit());
  await expect(page.locator('#questionVaultStatus')).toContainText('not saved');
  await expect(page.locator('#questionProgress')).toHaveText('Core setup 1 of 15 · 0% ready');
  await page.locator('#questionValue').fill('Jordan Example, jordan@example.test');
  await page.locator('#questionForm').evaluate(form => form.requestSubmit());
  await expect(page.locator('#questionProgress')).toContainText('Core setup 2 of 15');
  await expect(page.locator('#questionTitle')).toHaveText('Work authorization');
  await expect(page.locator('#questionHelp')).toContainText('never silently reused or inferred');
});

test('saved-info privacy controls render safely for a signed-out user', async ({ page }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle(/Job Agent/);
  await expect(page.locator('#openDesk')).toBeHidden();
  await page.locator('#openVault').click();
  await expect(page.locator('#vaultOverlay')).toHaveClass(/open/);
  await expect(page.locator('#vaultStatus')).toContainText(/Sign in with Job Agent access/);
  await expect(page.locator('#enableVault')).toBeDisabled();
  await page.locator('#closeVault').click();
  await expect(page.locator('#vaultOverlay')).not.toHaveClass(/open/);
  await page.locator('#openAgentAccess').click();
  await expect(page.locator('#downloadAccountData')).toBeHidden();
  await expect(page.locator('#deleteAccountData')).toBeHidden();
  expect(errors.filter(message => !/Failed to load resource/.test(message))).toEqual([]);
});

test('saved-info dialog remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#openVault').click();
  await expect(page.locator('#vaultTitle')).toBeVisible();
  const dimensions = await page.locator('.vault-shell').evaluate(element => ({ width: element.getBoundingClientRect().width, viewport: window.innerWidth }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});

test('a stale legacy bearer is never sent to the Job Agent and returns to opaque-session restore', async ({ page }) => {
  let authorizationHeader = null;
  await page.addInitScript(() => localStorage.setItem('1ststep_sub_cache', JSON.stringify({
    email: 'masked@example.test', tier: 'complete', tierToken: 'legacy-browser-token', jobAgentSession: true,
  })));
  await page.route('**/api/session-capabilities', route => {
    authorizationHeader = route.request().headers().authorization || null;
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'SESSION_UPGRADE_REQUIRED' }) });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  expect(authorizationHeader).toBeNull();
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('1ststep_sub_cache') || '{}'));
  expect(cache.jobAgentSession).toBeUndefined();
  await expect(page.locator('#verifyAgentAccess')).toHaveText('Email me a code');
});

test('a signed but non-invited pilot user keeps data controls without agent access', async ({ page }) => {
  await page.route('**/api/session-capabilities*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      adminConsole: false, jobAgentAccess: false, tier: 'complete', sessionAuthentication: 'opaque-session',
      pilotAccess: { enforced: true, allowed: false, code: 'JOB_AGENT_PILOT_INVITE_REQUIRED', maxUsers: 5, invitedTenantCount: 1 },
    }),
  }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page.locator('#openAgentAccess')).toHaveText('Pilot invite required');
  await expect(page.locator('#startJobSearch')).toHaveText('Check pilot access');
  await page.locator('#openAgentAccess').click();
  await expect(page.locator('#agentAccessMessage')).toContainText('limited to invited members');
  await expect(page.locator('#agentAccessMessage')).toContainText('saved-data controls remain available');
  await expect(page.locator('#downloadAccountData')).toBeVisible();
  await expect(page.locator('#signOutAgent')).toBeVisible();
  await expect(page.locator('#signOutAgentEverywhere')).toBeVisible();
  await expect(page.locator('#deleteAccountData')).toBeVisible();
  await expect(page.locator('#verifyAgentAccess')).toBeEnabled();
  await expect(page.locator('#openDesk')).toBeHidden();
});

test('one click queues, checks, and downloads a complete background account export', async ({ page }) => {
  let createRequests = 0;
  let statusRequests = 0;
  let downloadRequests = 0;
  await page.route('**/api/session-capabilities*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }),
  }));
  await page.route('**/api/account-data*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      createRequests += 1;
      return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ task: { id: 'account_export_browser_fixture', status: 'queued', ready: false }, replayed: false, partialExportReturned: false }) });
    }
    if (url.searchParams.get('download') === '1') {
      downloadRequests += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Content-Disposition': 'attachment; filename="1ststep-account-data-2026-08-30.json"' }, body: JSON.stringify({ schemaVersion: 1, scope: { operationalCollectionsComplete: true } }) });
    }
    statusRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task: { id: 'account_export_browser_fixture', status: 'ready', ready: true }, partialExportReturned: false }) });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#openAgentAccess').click();
  const download = page.waitForEvent('download');
  await page.locator('#downloadAccountData').click();
  const artifact = await download;
  expect(artifact.suggestedFilename()).toMatch(/^1ststep-account-data-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.locator('#agentAccessMessage')).toHaveText('Complete cloud-data export downloaded.');
  await expect(page.locator('#downloadAccountData')).toBeEnabled();
  await expect(page.locator('#downloadAccountData')).toHaveText('Download my cloud data');
  expect({ createRequests, statusRequests, downloadRequests }).toEqual({ createRequests: 1, statusRequests: 1, downloadRequests: 1 });
});

test('a failed background export returns to one-click retry without downloading a partial file', async ({ page }) => {
  let createRequests = 0;
  let downloadRequests = 0;
  await page.route('**/api/session-capabilities*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }),
  }));
  await page.route('**/api/account-data*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      createRequests += 1;
      return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ task: { id: `account_export_retry_${createRequests}`, status: 'queued', ready: false }, replayed: false, partialExportReturned: false }) });
    }
    if (url.searchParams.get('download') === '1') {
      downloadRequests += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Content-Disposition': 'attachment; filename="1ststep-account-data-2026-08-30.json"' }, body: JSON.stringify({ schemaVersion: 1, scope: { operationalCollectionsComplete: true } }) });
    }
    const firstAttempt = url.searchParams.get('taskId') === 'account_export_retry_1';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task: { id: url.searchParams.get('taskId'), status: firstAttempt ? 'failed' : 'ready', ready: !firstAttempt }, partialExportReturned: false }) });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#openAgentAccess').click();
  await page.locator('#downloadAccountData').click();
  await expect(page.locator('#agentAccessMessage')).toContainText('complete export could not be prepared');
  await expect(page.locator('#downloadAccountData')).toBeEnabled();
  expect(downloadRequests).toBe(0);
  const download = page.waitForEvent('download');
  await page.locator('#downloadAccountData').click();
  await download;
  await expect(page.locator('#agentAccessMessage')).toHaveText('Complete cloud-data export downloaded.');
  expect({ createRequests, downloadRequests }).toEqual({ createRequests: 2, downloadRequests: 1 });
});

test('account deletion reports partial browser cleanup truthfully and remains retryable', async ({ page }) => {
  await page.route('**/api/session-capabilities*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }),
  }));
  await page.route('**/api/account-data', route => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({
      code: 'BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED', deletionComplete: false,
      closedEmployerBrowserSessionsThisAttempt: 1, deletedEmployerBrowserSessionsThisAttempt: 1,
      employerBrowserSessionsRequiringRetry: 1,
    }),
  }));
  page.on('dialog', dialog => dialog.accept('DELETE MY JOB AGENT CLOUD DATA'));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#openAgentAccess').click();
  await expect(page.locator('#deleteAccountData')).toBeVisible();
  await page.locator('#deleteAccountData').click();
  await expect(page.locator('#agentAccessMessage')).toContainText('1 session closed safely');
  await expect(page.locator('#agentAccessMessage')).toContainText('1 still needs provider confirmation');
  await expect(page.locator('#agentAccessMessage')).toContainText('No other cloud data was deleted');
  await expect(page.locator('#deleteAccountData')).toBeVisible();
});

test('admin-only evidence shows content-free background worker health', async ({ page }) => {
  await page.route('**/api/session-capabilities*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ adminConsole: true, jobAgentAccess: true, tier: 'owner', authentication: 'opaque-session' }),
  }));
  await page.route('**/api/job-agent-operations*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      contentFree: true, containsCandidateValues: false,
      backgroundWorker: { status: 'healthy', lastSeenAt: '2026-08-30T04:00:00.000Z', outcome: 'succeeded', ageSeconds: 240 },
      totals: { background_worker_invocation: 2, schedule_enqueued: 1, schedule_failure: 0 },
      queueHealth: { contentFree: true, containsCandidateValues: false, containsAccountIdentifiers: false, submission: { status: 'attention-required', pending: 1, overdue: 1, reconciliationPending: 2, reconciliationDue: 1 }, receipt: { status: 'pending', pending: 2, overdue: 0 }, accountExport: { status: 'attention-required', pending: 3, overdue: 1, overdueAfterSeconds: 300, contentFree: true, containsAccountIdentifiers: false } },
      providerUsageEvidence: { requests: 3, inputTokens: 2400, outputTokens: 620, source: 'provider-reported-aggregate', monetaryCostStatus: 'unknown-until-provider-invoice-reconciled' },
      costControls: { unit: 'weighted-request-units-not-dollars', monetaryCostStatus: 'unknown-until-provider-invoice-reconciled', caps: { guidedAiGlobalDailyUnits: 20000, applicationPackageGlobalDailyUnits: 300, employerBrowserGlobalDailyUnits: 30 } },
      launchManifest: { currentMode: 'preview', capabilities: { signedBeta: { eligible: false, blockers: ['BACKUP_RESTORE_NOT_VERIFIED'] }, packageReady: { eligible: false }, assistedApplication: { eligible: false, blockers: ['EMPLOYER_BROWSER_REMOTE_STREAM_NOT_READY', 'EMPLOYER_BROWSER_SESSION_RECOVERY_NOT_VERIFIED'] }, finalSubmission: { eligible: false } }, externalApplicationExecution: false, submissionsEnabled: false },
      runtimeConfiguration: { schemaVersion: 1, report: 'job-agent-production-environment-shape', contentFree: true, containsSecretValues: false, authoritativeProductionRuntimeEvidence: true, controls: [], summary: { readyControls: 3, totalControls: 14, stages: { signedBeta: { eligible: false, blockerCount: 5 }, packageReady: { eligible: false, blockerCount: 6 }, assistedApplication: { eligible: false, blockerCount: 8 }, finalSubmission: { eligible: false, blockerCount: 11 } }, nextAction: { summary: 'Configure private scanned object storage and run the approved synthetic lifecycle drill.' } } },
    }),
  }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page.locator('#openDesk')).toBeVisible();
  await page.locator('#openDesk').click();
  await page.locator('[data-desk-tab="audit"]').click();
  await expect(page.locator('#deskTitle')).toHaveText('Admin evidence');
  await expect(page.locator('#auditList')).toContainText('Background worker · healthy');
  await expect(page.locator('#auditList')).toContainText('schedule enqueued: 1');
  await expect(page.locator('#auditList')).toContainText('Operational queues · aggregate only');
  await expect(page.locator('#auditList')).toContainText('Submission: attention-required · 1 pending · 1 overdue · 2 reconciliation pending · 1 reconciliation due');
  await expect(page.locator('#auditList')).toContainText('Receipt: pending · 2 pending · 0 overdue');
  await expect(page.locator('#auditList')).toContainText('Account export: attention-required · 3 pending · 1 overdue');
  await expect(page.locator('#auditList')).toContainText('No tenant, employer, application, or account identifiers are included');
  await expect(page.locator('#auditList')).toContainText('3 completed requests');
  await expect(page.locator('#auditList')).toContainText('dollar cost unknown until provider invoice reconciliation');
  await expect(page.locator('#auditList')).toContainText('weighted units, not dollars');
  await expect(page.locator('#auditList')).toContainText('Launch mode · preview');
  await expect(page.locator('#auditList')).toContainText('Runtime configuration · deployed production evidence');
  await expect(page.locator('#auditList')).toContainText('Signed beta: 5 blockers');
  await expect(page.locator('#auditList')).toContainText('Package Ready: 6 blockers');
  await expect(page.locator('#auditList')).toContainText('Assisted application: 8 blockers');
  await expect(page.locator('#auditList')).toContainText('Final submission: 11 blockers');
  await expect(page.locator('#auditList')).toContainText('3 of 14 control groups ready');
  await expect(page.locator('#auditList')).toContainText('Configure private scanned object storage');
  await expect(page.locator('#auditList')).toContainText('No environment names, values, secrets, tenant identifiers, or candidate data are shown');
  await expect(page.locator('#auditList')).toContainText('backup restore not verified');
  await expect(page.locator('#auditList')).toContainText('Assisted application: disabled');
  await expect(page.locator('#auditList')).toContainText('employer browser remote stream not ready');
  await expect(page.locator('#auditList')).toContainText('employer browser session recovery not verified');
  await expect(page.locator('#auditList')).toContainText('Final submission: disabled');
  await expect(page.locator('#auditList')).not.toContainText(/candidate@example|Procurement Manager/);
});

test('a durable private package is reviewable from a simple job card', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('1ststep_concierge_desk_v2', JSON.stringify({
      roles: [{
        id: 'role-browser-fixture', employer: 'Fixture Employer', title: 'Procurement Manager', requisitionId: 'REQ-1',
        directEmployerUrl: 'https://jobs.example.test/req/1', status: 'Verified - Package Preparation', fitScore: 88,
        packageRunId: 'run-browser-fixture', packageRunStatus: 'Finished',
        packageDraft: { historyId: 'run-browser-fixture', documentVersion: 'run-browser-fixture-v1', resumeText: 'Candidate Name\n\nPROFESSIONAL SUMMARY\n' + 'Verified procurement experience.\n'.repeat(20), coverLetterText: 'Dear Hiring Team,\n\nPrivate fixture cover letter.', atsIssues: [], qaStatus: 'ats-artifacts-verified-awaiting-isolated-render', source: 'durable-job-agent-package', artifacts: [
          { key: 'resume_docx', filename: 'fixture-resume.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: 1200, sha256: 'a'.repeat(64), pageCount: 1 },
          { key: 'resume_pdf', filename: 'fixture-resume.pdf', contentType: 'application/pdf', bytes: 900, sha256: 'b'.repeat(64), pageCount: 1 },
        ] },
      }], reusableFacts: [], standingPolicies: [], approvalBatches: [], actionQueue: [], applicationSessions: [], hiringEcosystem: [], acquisitionOutcomes: [], auditEvents: [],
    }));
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#openJobs').click();
  await page.locator('[data-job-tab="Preparing"]').click();
  await expect(page.locator('#jobCards')).toContainText('Fixture Employer');
  await page.locator('[data-job-package-review="role-browser-fixture"]').click();
  await expect(page.locator('#packageReviewOverlay')).toHaveClass(/open/);
  await expect(page.locator('#packageResumeText')).toHaveValue(/Verified procurement experience/);
  await expect(page.locator('#packageReviewStatus')).toContainText('DOCX/PDF');
  await expect(page.locator('#packageArtifactActions button')).toHaveCount(2);
});

test('the guided tap-through launch starts a truthful no-submit search in a few clicks', async ({ page }) => {
  let submittedMission = null;
  await routeEncryptedResumeVault(page);
  await page.route('**/api/session-capabilities', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }),
  }));
  await page.route('**/api/job-agent-runs', async route => {
    submittedMission = route.request().postDataJSON()?.mission;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run: {
          id: 'run-guided-launch-fixture', status: 'Finished', taskType: 'direct_employer_discovery',
          result: {
            jobs: [], errors: [], submissionsEnabled: false, costMode: 'no-paid-job-api', externalApplicationExecution: false,
            sourceSummary: [{ provider: 'greenhouse', employer: 'Synthetic Employer', status: 'ok', found: 0 }],
            filterSummary: { scanned: 12, duplicatesRemoved: 1, rejectedByMission: 11, matched: 0, returned: 0 },
          },
        },
      }),
    });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#openGuidedLaunch').click();
  await page.locator('[data-guided-goal="best-fit"]').click();
  await expect(page.locator('#quickResumeState')).toContainText('Resume ready');
  await page.locator('#guidedLaunchNext').click();
  const firstPath = page.locator('[data-opportunity-path]').first();
  await expect(firstPath).toBeVisible();
  await firstPath.click();
  await page.locator('[data-launch-choice="workMode"][data-value="Remote"]').click();
  await page.locator('[data-launch-choice="employmentType"][data-value="Full-time"]').click();
  await page.locator('[data-launch-choice="salary"][data-value="100000"]').click();
  await expect(page.locator('#startJobSearch')).toBeEnabled();
  await page.locator('#startJobSearch').click();
  await expect(page.locator('#runStateTrack [data-run-state="Preparing"]')).toHaveClass(/active/);
  await expect(page.locator('#messages')).toContainText('Found 0 credible mission matches');
  await expect(page.locator('#messages')).toContainText('Found—not Submitted');
  expect(submittedMission?.location).toBe('United States');
  expect(submittedMission?.searchGoal).toBe('best-fit');
  expect(submittedMission?.salaryMin).toBe(100000);
  expect(submittedMission?.employmentTypes).toEqual(['Full-time']);
});

test('a signed user restores the latest encrypted discovery run on a new device without a local run ID', async ({ page }) => {
  let latestRestoreRequests = 0;
  await page.route('**/api/session-capabilities', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session' }),
  }));
  await page.route('**/api/job-agent-runs?latest=discovery', route => {
    latestRestoreRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ run: {
        id: 'run_cross_device_restore_001', taskType: 'direct_employer_discovery', status: 'Paused',
        mission: { role: 'Strategic Sourcing Manager', roleFamily: 'procurement', roleFamilies: [], workModes: ['Remote'], employmentTypes: ['Full-time'], salaryMin: 115000, location: 'United States', exclusions: [], target: 10 },
        result: null, createdAt: '2026-08-30T12:00:00.000Z', updatedAt: '2026-08-30T12:05:00.000Z',
      } }),
    });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page.locator('#dailyGoalMessage')).toContainText('Strategic Sourcing Manager');
  await expect(page.locator('#runStateTrack [data-run-state="Paused"]')).toHaveClass(/active/);
  expect(await page.evaluate(() => localStorage.getItem('1ststep_job_agent_run_v1'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('1ststep_job_agent_run_v1'))).toBeNull();
  expect(latestRestoreRequests).toBe(1);
});

test('a stale device run cannot hide a newer tenant discovery run', async ({ page }) => {
  let exactRunRequests = 0;
  await page.route('**/api/session-capabilities', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session' }),
  }));
  await page.route('**/api/job-agent-runs?id=*', route => {
    exactRunRequests += 1;
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Run not found.' }) });
  });
  await page.route('**/api/job-agent-runs?latest=discovery', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ run: {
      id: 'run_newer_tenant_restore_002', taskType: 'direct_employer_discovery', status: 'Searching',
      mission: { role: 'Supplier Relationship Manager', roleFamily: 'procurement', roleFamilies: [], workModes: ['Remote'], employmentTypes: ['Full-time'], salaryMin: 120000, location: 'United States', exclusions: [], target: 10 },
      result: null, createdAt: '2026-08-30T13:00:00.000Z', updatedAt: '2026-08-30T13:05:00.000Z',
    } }),
  }));
  await page.addInitScript(() => {
    localStorage.setItem('1ststep_job_agent_run_v1', JSON.stringify({ id: 'run_expired_device_reference_001', status: 'Paused' }));
    localStorage.setItem('1ststep_concierge_mission_v1', JSON.stringify({ mission: {}, messages: [], durableRunId: 'run_expired_device_reference_001' }));
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page.locator('#dailyGoalMessage')).toContainText('Supplier Relationship Manager');
  await expect(page.locator('#runStateTrack [data-run-state="Searching"]')).toHaveClass(/active/);
  expect(await page.evaluate(() => localStorage.getItem('1ststep_job_agent_run_v1'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('1ststep_job_agent_run_v1'))).toBeNull();
  expect(exactRunRequests).toBe(0);
});

test('signed account state replaces stale browser workflow data and leaves no durable browser copy', async ({ page }) => {
  let savedAccountState = null;
  let packageRestoreRequests = 0;
  const browserKeys = [
    '1ststep_concierge_mission_v1', '1ststep_concierge_desk_v2', '1ststep_persistent_campaigns_v1',
    '1ststep_concierge_daily_goal_v1', '1ststep_job_agent_run_v1', '1ststep_resume', '1ststep_resume_text',
  ];
  await page.addInitScript(keys => {
    localStorage.setItem('1ststep_concierge_mission_v1', JSON.stringify({ mission: { role: 'Wrong Local Role', location: 'Wrong Local Place' }, messages: [] }));
    localStorage.setItem('1ststep_concierge_desk_v2', JSON.stringify({ roles: [{ id: 'wrong-local-job', employer: 'Wrong Local Employer', title: 'Wrong Local Role', status: 'Found' }] }));
    localStorage.setItem('1ststep_persistent_campaigns_v1', JSON.stringify({ version: 1, campaigns: [], activeCampaignId: '', runs: [], items: [], humanActions: [], evidence: [], transitions: [] }));
    localStorage.setItem('1ststep_concierge_daily_goal_v1', JSON.stringify({ target: 50 }));
    localStorage.setItem('1ststep_job_agent_run_v1', JSON.stringify({ id: 'wrong_local_run', status: 'Paused' }));
    localStorage.setItem('1ststep_resume', JSON.stringify({ text: 'Wrong local resume '.repeat(20) }));
    for (const key of keys) sessionStorage.setItem(key, localStorage.getItem(key) || JSON.stringify({ stale: true }));
  }, browserKeys);
  await page.route('**/api/session-capabilities', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session' }),
  }));
  await routeEncryptedResumeVault(page);
  await page.route('**/api/concierge-state', route => {
    if (route.request().method() === 'PUT') {
      savedAccountState = route.request().postDataJSON()?.state || null;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 8 }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      version: 7,
      state: {
        version: 1, campaigns: [], activeCampaignId: '', runs: [], items: [], humanActions: [], evidence: [], transitions: [],
        workspace: { version: 1, mission: { role: 'Account Sourcing Manager', roleFamily: 'procurement', workModes: ['Remote'], employmentTypes: ['Full-time'], location: 'United States', target: 10 }, dailyGoal: { target: 10, updatedAt: '2026-08-30T10:00:00.000Z' } },
        subscriberView: { version: 1, runState: 'Preparing', jobCards: [{
          id: 'account-job', employer: 'Account Employer', title: 'Account Sourcing Manager', requisitionId: 'REQ-ACCOUNT-1',
          status: 'Verified', fitScore: 90, directEmployerUrl: 'https://boards.greenhouse.io/example/jobs/1',
          sourceUrl: 'https://boards.greenhouse.io/example/jobs/1', sourceProvider: 'greenhouse', discoveryRunId: 'run_account_restore_001', applyPathActive: true,
          packageRunId: 'package_account_restore_001', packageRunStatus: 'Preparing', remoteEligibility: 'Remote listed by employer feed',
          geographyEligibility: 'Employer listing: United States', salaryDisclosure: 'Not disclosed in current employer requisition',
          employmentType: 'Full-time', postedDate: '2026-08-29', travel: 'Unknown', schedule: 'Unknown',
        }], needsYou: [] },
      },
    }) });
  });
  await page.route('**/api/job-agent-runs?latest=discovery', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ run: {
      id: 'run_account_restore_001', taskType: 'direct_employer_discovery', status: 'Finished',
      mission: { role: 'Account Sourcing Manager', roleFamily: 'procurement', workModes: ['Remote'], employmentTypes: ['Full-time'], location: 'United States', target: 10 },
      result: { authority: 'published-direct-employer-ats-feed', jobs: [{
        provider: 'greenhouse', employer: 'Account Employer', title: 'Account Sourcing Manager', requisitionId: 'REQ-ACCOUNT-1',
        jobUrl: 'https://boards.greenhouse.io/example/jobs/1', applyUrl: 'https://boards.greenhouse.io/example/jobs/1',
        location: 'United States', remote: true, workplaceType: 'Remote', employmentType: 'Full-time', postedDate: '2026-08-29',
        description: `Lead strategic sourcing and supplier management. ${'Verified employer responsibility. '.repeat(12)}`,
        applyPathVerified: true, applyPathVerification: 'current-greenhouse-requisition-fetch', applyPathVerifiedAt: '2026-08-30T09:00:00.000Z',
      }] },
    } }),
  }));
  await page.route('**/api/application-packages?id=package_account_restore_001', route => {
    packageRestoreRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ run: {
      id: 'package_account_restore_001', taskType: 'application_package', status: 'Preparing',
      mission: { roleId: 'account-job', employer: 'Account Employer', title: 'Account Sourcing Manager' }, result: null,
    } }) });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page.locator('#dailyGoalMessage')).toContainText('Account Sourcing Manager');
  await page.locator('#openJobs').click();
  await page.locator('[data-job-tab="Preparing"]').click();
  await expect(page.locator('#jobCards')).toContainText('Account Employer');
  await expect(page.locator('[data-job-package-generate="account-job"]')).toHaveText('Check package');
  expect(packageRestoreRequests).toBe(1);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('1ststep_resume') || 'null'))).toMatchObject({ source: 'secure-vault', fileName: 'master-resume.txt' });
  await page.evaluate(() => sessionStorage.removeItem('1ststep_resume'));
  await page.locator('[data-job-package-generate="account-job"]').click();
  await expect.poll(() => packageRestoreRequests).toBe(2);
  await expect(page.locator('body')).not.toContainText('Wrong Local Employer');
  await page.locator('#dailyGoalInput').fill('20');
  await page.locator('#dailyGoalForm').evaluate(form => form.requestSubmit());
  await expect.poll(() => savedAccountState?.workspace?.dailyGoal?.target).toBe(20);
  expect(savedAccountState.subscriberView.jobCards.map(job => job.employer)).toEqual(['Account Employer']);
  expect(savedAccountState.subscriberView.jobCards[0]).toMatchObject({
    requisitionId: 'REQ-ACCOUNT-1', discoveryRunId: 'run_account_restore_001', packageRunId: 'package_account_restore_001', sourceProvider: 'greenhouse',
  });
  const retained = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, { local: localStorage.getItem(key), session: sessionStorage.getItem(key) }])), browserKeys);
  expect(Object.values(retained).every(value => value.local === null)).toBe(true);
  for (const key of browserKeys) expect(retained[key].session).toBeNull();
});

test('a signed-in user gives one-time scoped authorization before any agent run starts', async ({ page }) => {
  let consentActive = false;
  let consentVersion = 0;
  let runStarts = 0;
  let savedAttestations = null;
  const policyBundle = jobAgentPolicyBundle({ termsVersion: 'terms-beta-1', privacyVersion: 'privacy-beta-1', authorizationVersion: 'job-agent-beta-1' });
  await routeEncryptedResumeVault(page);
  const publicConsent = () => ({
    status: consentActive ? 'active' : 'not-granted', active: consentActive,
    code: consentActive ? null : 'JOB_AGENT_CONSENT_REQUIRED', scopes: consentActive
      ? ['direct-employer-discovery', 'confirmed-profile-storage', 'ai-document-preparation', 'application-workspace'] : [],
    policy: consentActive ? policyBundle.binding : null,
    requiredPolicy: policyBundle.binding, policyBundle,
  });
  await page.route('**/api/session-capabilities', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session', jobAgentConsent: publicConsent(), jobAgentConsentVersion: consentVersion, jobAgentConsentPolicyConfigured: true }),
  }));
  await page.route('**/api/job-agent-consent', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ consent: publicConsent(), version: consentVersion, policyConfigured: true }) });
    const body = route.request().postDataJSON();
    savedAttestations = body.attestations;
    consentActive = true;
    consentVersion += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ consent: publicConsent(), version: consentVersion }) });
  });
  await page.route('**/api/job-agent-runs', async route => {
    runStarts += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ run: { id: 'run-consent-fixture', status: 'Finished', taskType: 'direct_employer_discovery', result: { jobs: [], errors: [], submissionsEnabled: false, externalApplicationExecution: false, sourceSummary: [], filterSummary: { scanned: 0, duplicatesRemoved: 0, rejectedByMission: 0, matched: 0, returned: 0 } } } }) });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#openGuidedLaunch').click();
  await page.locator('[data-guided-goal="best-fit"]').click();
  await page.locator('#guidedLaunchNext').click();
  await page.locator('[data-opportunity-path]').first().click();
  await page.locator('[data-launch-choice="workMode"][data-value="Remote"]').click();
  await page.locator('[data-launch-choice="employmentType"][data-value="Full-time"]').click();
  await page.locator('[data-launch-choice="salary"][data-value="0"]').click();
  await page.locator('#startJobSearch').click();
  await expect(page.locator('#jobAgentConsentOverlay')).toHaveClass(/open/);
  await expect(page.locator('#jobAgentConsentChecks input[type="checkbox"]')).toHaveCount(4);
  await expect(page.locator('#jobAgentConsentOverlay input[type="date"]')).toHaveCount(0);
  await expect(page.locator('#jobAgentConsentTitle')).toHaveText(policyBundle.disclosure.heading);
  await expect(page.locator('#jobAgentConsentChecks label').nth(3)).toHaveText(policyBundle.disclosure.attestations[3].statement);
  await expect(page.locator('#jobAgentConsentChecks a[href="/terms"]')).toHaveText('Terms');
  await expect(page.locator('#grantJobAgentConsent')).toBeEnabled();
  expect(runStarts).toBe(0);
  for (const checkbox of await page.locator('#jobAgentConsentChecks input[type="checkbox"]').all()) await checkbox.check();
  await page.locator('#grantJobAgentConsent').click();
  await expect(page.locator('#jobAgentConsentOverlay')).not.toHaveClass(/open/);
  await expect.poll(() => runStarts).toBe(1);
  expect(savedAttestations).toEqual({ age18OrOlder: true, termsAccepted: true, privacyAcknowledged: true, candidateAuthorizationAccepted: true });
  await expect(page.locator('#messages')).toContainText('Found 0 credible mission matches');
});

test('the same saved-info area can revoke authorization and pause the agent', async ({ page }) => {
  let revokeRequest = null;
  const activeConsent = { status: 'active', active: true, code: null, grantedAt: new Date().toISOString(), scopes: ['direct-employer-discovery', 'confirmed-profile-storage', 'ai-document-preparation', 'application-workspace'], policy: { termsVersion: 'terms-beta-1', privacyVersion: 'privacy-beta-1', authorizationVersion: 'job-agent-beta-1' } };
  await routeAccountWorkspace(page, { mission: { role: 'Procurement Manager', roleFamily: 'procurement', workModes: ['Remote'], employmentTypes: ['Full-time'], location: 'United States', target: 10 } });
  await page.route('**/api/session-capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session', jobAgentConsent: activeConsent, jobAgentConsentVersion: 4, jobAgentConsentPolicyConfigured: true }) }));
  await page.route('**/api/job-agent-consent', async route => {
    revokeRequest = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ consent: { ...activeConsent, status: 'revoked', active: false, code: 'JOB_AGENT_CONSENT_REQUIRED' }, version: 5, pausedRuns: 1, pausedApplications: 1, cancelledBrowserTasks: 1, executingBrowserTasks: 1, browserTaskReconciliationRequired: true, authorizationShutdownReconciliationRequired: true }) });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#openVault').click();
  await expect(page.locator('#jobAgentAuthorizationStatus')).toContainText('Active');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#revokeJobAgentConsent').click();
  await expect(page.locator('#jobAgentAuthorizationStatus')).toContainText('Not active');
  expect(revokeRequest).toEqual({ action: 'revoke', version: 4, reason: 'user-request' });
  await expect(page.locator('#runStateTrack [data-run-state="Paused"]')).toHaveClass(/active/);
  await expect(page.locator('#toastRegion')).toContainText('Authorization revoked. Secure cleanup is finishing; no new work can start.');
});

test('one checked choice creates a daily search and Saved Info can pause it', async ({ page }) => {
  let schedule = null;
  let scheduleVersion = 0;
  let scheduledMission = null;
  let deletes = 0;
  const activeConsent = { status: 'active', active: true, code: null, scopes: ['direct-employer-discovery', 'confirmed-profile-storage', 'ai-document-preparation', 'application-workspace'], policy: { termsVersion: 'terms-beta-1', privacyVersion: 'privacy-beta-1', authorizationVersion: 'job-agent-beta-1' } };
  await routeEncryptedResumeVault(page);
  await page.route('**/api/session-capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session', jobAgentConsent: activeConsent, jobAgentConsentVersion: 1, jobAgentConsentPolicyConfigured: true }) }));
  await page.route('**/api/job-agent-consent', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ consent: activeConsent, version: 1, policyConfigured: true }) }));
  await page.route('**/api/job-agent-schedule', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schedule, version: scheduleVersion, schedulingEnabled: true }) });
    if (route.request().method() === 'DELETE') { deletes += 1; schedule = null; scheduleVersion = 0; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true, schedule: null, version: 0 }) }); }
    const body = route.request().postDataJSON();
    scheduledMission = body.mission;
    scheduleVersion += 1;
    schedule = { version: scheduleVersion, status: 'active', cadence: 'daily', mission: body.mission, nextRunAt: new Date(Date.now() + 86_400_000).toISOString() };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schedule, version: scheduleVersion, schedulingEnabled: true }) });
  });
  await page.route('**/api/job-agent-runs', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ run: { id: 'run-daily-fixture', status: 'Finished', taskType: 'direct_employer_discovery', result: { jobs: [], errors: [], submissionsEnabled: false, externalApplicationExecution: false, sourceSummary: [], filterSummary: { scanned: 0, duplicatesRemoved: 0, rejectedByMission: 0, matched: 0, returned: 0 } } } }) }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await reachGuidedLaunchReview(page);
  await expect(page.locator('#dailyBackgroundSearch')).toBeChecked();
  await page.locator('#startJobSearch').click();
  await expect.poll(() => scheduledMission?.role).toBeTruthy();
  await page.locator('#openVault').click();
  await expect(page.locator('[data-schedule-action="pause"]')).toBeVisible();
  await page.locator('[data-schedule-action="pause"]').click();
  await expect.poll(() => deletes).toBe(1);
  await expect(page.locator('#dailyBackgroundSearch')).not.toBeChecked();
});

test('a signed user can opt into generic Needs You email alerts with one checkbox', async ({ page }) => {
  let preference = null;
  let version = 0;
  let putBody = null;
  let deletes = 0;
  await page.route('**/api/session-capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }) }));
  await page.route('**/api/job-agent-notifications', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preference, version, deliveryAvailable: true }) });
    if (route.request().method() === 'DELETE') { deletes += 1; preference = null; version = 0; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preference, version, deliveryAvailable: true }) }); }
    putBody = route.request().postDataJSON();
    version += 1; preference = { enabled: true, channel: 'email', consentVersion: 'needs-you-email-v1', consentedAt: new Date().toISOString() };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preference, version, deliveryAvailable: true }) });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#openVault').click();
  await expect(page.locator('#savedNeedsYouEmailAlerts')).toBeEnabled();
  await page.locator('#savedNeedsYouEmailAlerts').check();
  await expect(page.locator('#needsYouNotificationStatus')).toContainText('generic email only');
  expect(putBody).toEqual({ enabled: true, version: 0 });
  expect(JSON.stringify(putBody)).not.toContain('@');
  await page.locator('#savedNeedsYouEmailAlerts').uncheck();
  await expect.poll(() => deletes).toBe(1);
  await expect(page.locator('#needsYouNotificationStatus')).toContainText('Off');
});

test('a signed-out launch stops at the dedicated no-charge Job Agent access screen', async ({ page }) => {
  const startedSearches = [];
  page.on('request', request => {
    if (/\/api\/(?:concierge-discovery|job-agent-runs)$/.test(new URL(request.url()).pathname)) startedSearches.push(request.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem('1ststep_resume', `Candidate reviewed resume\n${'Verified operations and vendor-management experience.\n'.repeat(8)}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await reachGuidedLaunchReview(page);
  await expect(page.locator('#startJobSearch')).toBeEnabled();
  await expect(page.locator('#startJobSearch')).toContainText('Unlock my job agent');
  await page.locator('#startJobSearch').click();
  await expect(page.locator('#agentAccessOverlay')).toHaveClass(/open/);
  await expect(page.locator('#agentAccessOverlay')).toContainText('No new charge is created from this screen');
  await expect(page.locator('#agentAccessOverlay')).toContainText('Dedicated pricing is being measured');
  expect(startedSearches).toEqual([]);
});

test('the guided launch remains usable without horizontal scrolling on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#agentLaunch')).toBeVisible();
  await expect(page.locator('#openGuidedLaunch')).toBeVisible();
  await page.locator('#openGuidedLaunch').click();
  await expect(page.locator('[data-guided-goal="best-fit"]')).toBeVisible();
  await expect(page.locator('#guidedLaunchNext')).toBeVisible();
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
});

test('a slow-feed failure pauses safely and offers one-click retry without claiming submission', async ({ page }) => {
  await routeEncryptedResumeVault(page, `Candidate reviewed resume\n${'Verified procurement and sourcing experience.\n'.repeat(8)}`);
  await page.route('**/api/session-capabilities', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session' }),
  }));
  await page.route('**/api/job-agent-runs', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Employer feeds are temporarily slow.' }),
  }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await reachGuidedLaunchReview(page);
  await page.locator('#startJobSearch').click();
  await expect(page.locator('#runStateTrack [data-run-state="Paused"]')).toHaveClass(/active/);
  await expect(page.locator('#messages')).toContainText('live public-feed discovery did not run');
  await expect(page.locator('#messages')).toContainText('No applications were submitted');
  await expect(page.locator('#messages button[data-prompt="Retry job discovery"]')).toBeVisible();
});

test('subscriber work is reduced to simple job cards and one consolidated Needs You queue', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('1ststep_concierge_desk_v2', JSON.stringify({
      roles: [{
        id: 'role-needs-you-fixture', employer: 'Fixture Employer', title: 'Sourcing Manager', requisitionId: 'REQ-2',
        directEmployerUrl: 'https://jobs.example.test/req/2', status: 'Blocked', fitScore: 84,
        remoteEligibility: 'Remote listed by employer feed', salaryMin: 100000,
      }],
      actionQueue: [{
        id: 'action-needs-you-fixture', roleId: 'role-needs-you-fixture', type: 'CAPTCHA', status: 'open',
        summary: 'Complete the challenge directly on the employer page.',
      }],
      reusableFacts: [], standingPolicies: [], approvalBatches: [], applicationSessions: [], hiringEcosystem: [], acquisitionOutcomes: [], auditEvents: [],
    }));
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#headerNeedsYouCount')).toHaveText('1');
  await page.locator('#openNeedsYou').click();
  await expect(page.locator('#needsYouOverlay')).toHaveClass(/open/);
  await expect(page.locator('#needsYouList .needs-you-item')).toHaveCount(1);
  await expect(page.locator('#needsYouList')).toContainText('Complete the challenge directly on the employer page');
  await expect(page.locator('#needsYouList')).toContainText('Your saved application will resume after this step');
  await page.locator('#closeNeedsYou').click();
  await page.locator('#openJobs').click();
  await page.locator('[data-job-tab="Needs You"]').click();
  await expect(page.locator('#jobCards .simple-job-card')).toHaveCount(1);
  await expect(page.locator('#jobCards')).toContainText('Needs You');
  await expect(page.locator('#jobsOverlay')).not.toContainText('Application Records');
});

test('status tabs, mission stats, and receipt-only submission counting share one canonical view', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('1ststep_concierge_mission_v1', JSON.stringify({
      mission: { role: 'Procurement Manager', roleFamily: 'procurement', workModes: ['Remote'], employmentTypes: ['Full-time'], salaryMin: 100000, location: 'United States', target: 10 },
      messages: [], discovery: { status: 'complete', matches: 3 }, runState: 'Preparing',
    }));
    localStorage.setItem('1ststep_resume', `Candidate reviewed resume\n${'Verified sourcing experience.\n'.repeat(12)}`);
    localStorage.setItem('1ststep_concierge_desk_v2', JSON.stringify({
      roles: [
        { id: 'found', employer: 'Found Co', title: 'Buyer', status: 'Found', fitScore: 81 },
        { id: 'ready', employer: 'Ready Co', title: 'Sourcing Lead', status: 'Package Ready', fitScore: 88 },
        { id: 'unverified-submit', employer: 'No Receipt Co', title: 'Manager', status: 'Submitted', fitScore: 84 },
        { id: 'verified-submit', employer: 'Receipt Co', title: 'Director', status: 'Submitted', fitScore: 90, receipt: { confirmationId: 'EMP-OK-1', receivedAt: new Date().toISOString() } },
        { id: 'interview', employer: 'Interview Co', title: 'Lead', status: 'Interview', fitScore: 89 },
      ], reusableFacts: [], standingPolicies: [], approvalBatches: [], actionQueue: [], applicationSessions: [], hiringEcosystem: [], acquisitionOutcomes: [], auditEvents: [],
    }));
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#quickResumeState')).toHaveText('Resume ready');
  await expect(page.locator('#configCriteria')).toHaveText('Procurement Manager');
  await expect(page.locator('#progressApplied')).toHaveText('1');
  await expect(page.locator('#progressInterviews')).toHaveText('1');
  await page.locator('#openJobs').click();
  await expect(page.locator('[data-job-tab="Matches"] span')).toHaveText('1');
  await expect(page.locator('[data-job-tab="Preparing"] span')).toHaveText('2');
  await expect(page.locator('[data-job-tab="Submitted"] span')).toHaveText('1');
  await expect(page.locator('[data-job-tab="Interviews"] span')).toHaveText('1');
  await page.locator('[data-job-tab="Submitted"]').click();
  await expect(page.locator('#jobCards')).toContainText('Receipt Verified');
  await expect(page.locator('#jobCards')).not.toContainText('No Receipt Co');
});

test('consequential personal-data sharing opens an employer-specific confirmation dialog', async ({ page }) => {
  const session = {
    id: 'application-confirmation-fixture', version: 1, packageRunId: 'package-confirmation-fixture',
    role: { employer: 'Fixture Employer', title: 'Procurement Manager', requisitionId: 'REQ-CONFIRM-1', directEmployerUrl: 'https://careers.example.com/REQ-CONFIRM-1' },
    documentVersion: 'resume-confirm-v2', state: 'Waiting for You', stage: 'transmission_approval', externalApplicationExecution: false,
    proposedFields: [{ fieldKey: 'startDate', label: 'Start date', factId: 'fact-1', maskedPreview: 'Verified answer ••••', confidence: 1, provenance: 'candidate confirmation', ordinaryVerified: true }],
    approvals: { transmission: null, submission: null }, receipt: null,
    actions: [{ id: 'action-confirm-1', type: 'TRANSMISSION_APPROVAL', status: 'open', summary: 'Approve exact sharing.', metadata: {}, createdAt: new Date().toISOString() }], timeline: [],
  };
  await page.route('**/api/session-capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }) }));
  await page.route('**/api/application-sessions', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [session] }) }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#resumeApplication').click();
  await page.locator('#resolveApplication').click();
  await expect(page.locator('#confirmationOverlay')).toHaveClass(/open/);
  await expect(page.locator('#confirmationEmployer')).toHaveText('Fixture Employer');
  await expect(page.locator('#confirmationRole')).toHaveText('Procurement Manager');
  await expect(page.locator('#confirmationRequisition')).toHaveText('REQ-CONFIRM-1');
  await expect(page.locator('#confirmationInformation')).toContainText('Start date');
  await expect(page.locator('#confirmConsequence')).toHaveText('Authorize sharing');
  await expect(page.locator('#applicationOverlay')).toHaveAttribute('aria-hidden', 'true');
});

test('ambiguous employer question is completed on the verified employer page without sending the answer to 1stStep', async ({ page }) => {
  let session = {
    id: 'application-ambiguous-fixture', version: 3, packageRunId: 'package-ambiguous-fixture',
    role: { employer: 'Question Employer', title: 'Operations Manager', requisitionId: 'REQ-QUESTION-1', directEmployerUrl: 'https://careers.example.com/REQ-QUESTION-1' },
    documentVersion: 'resume-question-v1', state: 'Waiting for You', stage: 'employer_form', externalApplicationExecution: false,
    proposedFields: [], approvals: { transmission: null, submission: null }, receipt: null,
    actions: [{ id: 'action-ambiguous-1', type: 'AMBIGUOUS_FACT', status: 'open', summary: 'Answer this employer-specific question explicitly.', metadata: { fieldKey: 'employerQuestion' }, createdAt: new Date().toISOString() }], timeline: [],
  };
  let patchBody = null;
  await page.route('**/api/session-capabilities*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }) }));
  await page.route('**/api/application-sessions*', async route => {
    if (route.request().method() === 'PATCH') {
      patchBody = route.request().postDataJSON();
      session = { ...session, version: 4, state: 'Preparing', actions: session.actions.map(action => ({ ...action, status: 'resolved', resolvedAt: new Date().toISOString() })) };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session, externalApplicationExecution: false, submissionsEnabled: false }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [session] }) });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#resumeApplication').click();
  await expect(page.locator('#applicationActionTitle')).toHaveText('Answer this employer question');
  await expect(page.locator('#applicationActionSummary')).toContainText('will not infer, capture, or silently reuse this answer');
  await expect(page.locator('#openEmployerPage')).toBeVisible();
  await expect(page.locator('#openEmployerPage')).toHaveAttribute('href', 'https://careers.example.com/REQ-QUESTION-1');
  await expect(page.locator('#resolveApplication')).toHaveText('I answered this on the employer site');
  await page.locator('#resolveApplication').click();
  expect(patchBody).toEqual({ action: 'confirm-external-step', sessionId: 'application-ambiguous-fixture', actionId: 'action-ambiguous-1', confirmed: true, version: 3 });
  expect(JSON.stringify(patchBody)).not.toMatch(/answer|value|employerQuestion|candidate/i);
  await expect(page.locator('#applicationAgentStatus')).toContainText('Preparing');
});

test('unknown employer fill result requires preserved-form review before a fresh approval can be requested', async ({ page }) => {
  const failureAction = { id: 'action-failure-1', type: 'EMPLOYER_ATS_FAILURE', status: 'open', summary: 'The isolated employer step ended without a verified result.', metadata: { taskId: 'browser-task-failure-1', failureCode: 'SANDBOX_TIMEOUT' }, createdAt: new Date().toISOString() };
  let session = {
    id: 'application-failure-fixture', version: 7, packageRunId: 'package-failure-fixture',
    role: { employer: 'Recovery Employer', title: 'Vendor Manager', requisitionId: 'REQ-RECOVERY-1', directEmployerUrl: 'https://careers.example.com/REQ-RECOVERY-1' },
    documentVersion: 'resume-recovery-v1', state: 'Waiting for You', stage: 'employer_form', externalApplicationExecution: true,
    proposedFields: [{ fieldKey: 'email', label: 'Email', factId: 'fact-email', maskedPreview: 'e•••@example.com', confidence: 1, provenance: 'candidate confirmation', ordinaryVerified: true }],
    formCheckpoint: { status: 'preserved', pageUrl: 'https://careers.example.com/REQ-RECOVERY-1', stepKey: 'employer-form', fieldSchemaHash: 'a'.repeat(64), stagedFieldKeys: ['email'], attachedDocumentVersion: 'resume-recovery-v1', preservedAt: new Date().toISOString() },
    approvals: { transmission: { id: 'approval-used', confirmedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), consumedAt: new Date().toISOString(), scopeHash: 'b'.repeat(64), documentVersion: 'resume-recovery-v1', approvedFieldKeys: ['email'] }, submission: null },
    workerExecution: { id: 'browser-task-failure-1', status: 'outcome-unknown', fieldSchemaHash: 'a'.repeat(64), stagedFieldKeys: ['email'], startedAt: new Date().toISOString(), completedAt: null, failureCode: 'SANDBOX_TIMEOUT' },
    actions: [failureAction], timeline: [], receipt: null,
  };
  let patchBody = null;
  await page.route('**/api/session-capabilities*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }) }));
  await page.route('**/api/application-sessions*', async route => {
    if (route.request().method() === 'PATCH') {
      patchBody = route.request().postDataJSON();
      session = {
        ...session, version: 8, stage: 'transmission_approval', approvals: { ...session.approvals, transmission: null },
        workerExecution: { ...session.workerExecution, status: 'reconciled-not-filled', completedAt: new Date().toISOString(), failureCode: null },
        actions: [{ id: 'action-renewed-approval', type: 'TRANSMISSION_APPROVAL', status: 'open', summary: 'Review and approve fresh sharing.', metadata: {}, createdAt: new Date().toISOString() }, { ...failureAction, status: 'resolved' }],
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session, externalApplicationExecution: false, submissionsEnabled: false }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [session] }) });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#resumeApplication').click();
  await expect(page.locator('#applicationActionTitle')).toHaveText('Check the saved employer form');
  await expect(page.locator('#applicationActionSummary')).toContainText('never retry automatically');
  await expect(page.locator('#openEmployerPage')).toBeVisible();
  await expect(page.locator('#applicationRecoveryActions')).toBeVisible();
  await page.locator('#reconcileFieldsAbsent').click();
  expect(patchBody).toEqual({ action: 'reconcile-employer-failure', sessionId: 'application-failure-fixture', version: 7, confirmed: true, actionId: 'action-failure-1', outcome: 'FIELDS_NOT_FILLED' });
  expect(JSON.stringify(patchBody)).not.toMatch(/fieldValue|password|otp|captcha/i);
  await expect(page.locator('#applicationActionTitle')).toHaveText('Share these application details?');
  await expect(page.locator('#applicationRecoveryActions')).toBeHidden();
  await expect(page.locator('#resolveApplication')).toHaveText('Approve sharing');
});

test('reviewed filled form reaches a separate final approval without submitting', async ({ page }) => {
  let session = {
    id: 'application-final-review-fixture', version: 9, packageRunId: 'package-final-review-fixture',
    role: { employer: 'Review Employer', title: 'Sourcing Manager', requisitionId: 'REQ-REVIEW-1', directEmployerUrl: 'https://careers.example.com/REQ-REVIEW-1' },
    documentVersion: 'resume-review-v3', state: 'Preparing', stage: 'employer_form', externalApplicationExecution: true,
    proposedFields: [{ fieldKey: 'email', label: 'Email', factId: 'fact-email', maskedPreview: 'e•••@example.com', confidence: 1, provenance: 'candidate confirmation', ordinaryVerified: true }],
    formCheckpoint: { status: 'preserved', pageUrl: 'https://careers.example.com/REQ-REVIEW-1', stepKey: 'employer-form', fieldSchemaHash: 'a'.repeat(64), stagedFieldKeys: ['email'], attachedDocumentVersion: 'resume-review-v3', preservedAt: new Date().toISOString() },
    approvals: { transmission: { id: 'approval-used', confirmedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), consumedAt: new Date().toISOString(), scopeHash: 'b'.repeat(64), documentVersion: 'resume-review-v3', approvedFieldKeys: ['email'] }, submission: null },
    transmissionAttempt: { transmittedAt: new Date().toISOString(), scopeHash: 'b'.repeat(64), documentVersion: 'resume-review-v3', fieldSchemaHash: 'a'.repeat(64), transmittedFieldKeys: ['email'] },
    workerExecution: { id: 'browser-task-final-review', status: 'completed', fieldSchemaHash: 'a'.repeat(64), stagedFieldKeys: ['email'], completedAt: new Date().toISOString() },
    actions: [], timeline: [], receipt: null,
  };
  const patchBodies = [];
  await page.route('**/api/session-capabilities*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }) }));
  await page.route('**/api/application-sessions*', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      patchBodies.push(body);
      if (body.action === 'request-final-review') {
        session = {
          ...session, version: 10, state: 'Waiting for You', stage: 'submission_approval',
          actions: [{ id: 'action-submit-approval', type: 'SUBMISSION_APPROVAL', status: 'open', summary: 'Approve the exact final submission.', metadata: { scopeHash: 'c'.repeat(64), documentVersion: session.documentVersion, fieldSchemaHash: 'a'.repeat(64) }, createdAt: new Date().toISOString() }],
        };
      } else if (body.action === 'confirm-submission') {
        session = {
          ...session, version: 11, state: 'Preparing', stage: 'submission_execution',
          approvals: { ...session.approvals, submission: { id: 'approval-submit', confirmedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), consumedAt: null, scopeHash: 'c'.repeat(64), documentVersion: session.documentVersion } },
          actions: session.actions.map(action => ({ ...action, status: 'resolved', resolvedAt: new Date().toISOString() })),
        };
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session, externalApplicationExecution: false, submissionsEnabled: false }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [session], externalApplicationExecution: false }) });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#resumeApplication').click();
  await expect(page.locator('#applicationActionTitle')).toHaveText('Your completed form is ready to review');
  await expect(page.locator('#resolveApplication')).toHaveText('Review final application');
  await page.locator('#resolveApplication').click();
  expect(patchBodies[0]).toEqual({ action: 'request-final-review', sessionId: 'application-final-review-fixture', confirmed: true, version: 9 });
  expect(JSON.stringify(patchBodies[0])).not.toMatch(/fieldSchemaHash|reviewedFieldKeys|email|value|password|otp|captcha/i);
  await expect(page.locator('#resolveApplication')).toHaveText('Approve final submission');
  await page.locator('#resolveApplication').click();
  await expect(page.locator('#confirmationOverlay')).toHaveClass(/open/);
  await expect(page.locator('#confirmationRisk')).toContainText('submission execution is not launch-enabled');
  await expect(page.locator('#confirmationSubtitle')).toContainText('execution remains disabled');
  await page.locator('#confirmConsequence').click();
  expect(patchBodies[1]).toMatchObject({ action: 'confirm-submission', sessionId: 'application-final-review-fixture', confirmed: true, version: 10 });
  await expect(page.locator('#fixtureStep')).toContainText('Submission permission saved');
  await expect(page.locator('#applicationActionPill')).toHaveText('Preparing');
  await expect(page.locator('#applicationActionSummary')).toContainText('worker is not enabled yet');
  await expect(page.locator('#applicationReceipt')).toContainText('not counted as Submitted');
});

test('expired final approval returns to Needs You without submitting or trusting browser scope', async ({ page }) => {
  let session = {
    id: 'application-expired-approval-fixture', version: 12, packageRunId: 'package-expired-approval-fixture',
    role: { employer: 'Expiry Employer', title: 'Category Manager', requisitionId: 'REQ-EXPIRY-1', directEmployerUrl: 'https://careers.example.com/REQ-EXPIRY-1' },
    documentVersion: 'resume-expiry-v1', state: 'Preparing', stage: 'submission_execution', externalApplicationExecution: true,
    proposedFields: [{ fieldKey: 'email', label: 'Email', factId: 'fact-email', maskedPreview: 'e•••@example.com', confidence: 1, provenance: 'candidate confirmation', ordinaryVerified: true }],
    formCheckpoint: { status: 'preserved', pageUrl: 'https://careers.example.com/REQ-EXPIRY-1', stepKey: 'employer-form', fieldSchemaHash: 'a'.repeat(64), stagedFieldKeys: ['email'], attachedDocumentVersion: 'resume-expiry-v1', preservedAt: new Date().toISOString() },
    approvals: {
      transmission: { id: 'approval-transmission-used', confirmedAt: '2026-08-30T10:00:00.000Z', expiresAt: '2026-08-30T10:15:00.000Z', consumedAt: '2026-08-30T10:01:00.000Z', scopeHash: 'b'.repeat(64), documentVersion: 'resume-expiry-v1', approvedFieldKeys: ['email'] },
      submission: { id: 'approval-submission-expired', confirmedAt: '2026-08-30T10:02:00.000Z', expiresAt: '2026-08-30T10:17:00.000Z', consumedAt: null, scopeHash: 'c'.repeat(64), documentVersion: 'resume-expiry-v1' },
    },
    transmissionAttempt: { transmittedAt: '2026-08-30T10:01:00.000Z', scopeHash: 'b'.repeat(64), documentVersion: 'resume-expiry-v1', fieldSchemaHash: 'a'.repeat(64), transmittedFieldKeys: ['email'] },
    workerExecution: { id: 'browser-task-expiry', status: 'completed', fieldSchemaHash: 'a'.repeat(64), stagedFieldKeys: ['email'], completedAt: '2026-08-30T10:01:00.000Z' },
    actions: [], timeline: [], receipt: null, submissionAttempt: null,
  };
  let patchBody = null;
  await page.route('**/api/session-capabilities*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }) }));
  await page.route('**/api/application-sessions*', async route => {
    if (route.request().method() === 'PATCH') {
      patchBody = route.request().postDataJSON();
      session = {
        ...session, version: 13, state: 'Waiting for You', stage: 'submission_approval',
        approvals: { ...session.approvals, submission: { ...session.approvals.submission, supersededAt: new Date().toISOString() } },
        actions: [{ id: 'action-renewed-final-approval', type: 'SUBMISSION_APPROVAL', status: 'open', summary: 'Approve the renewed exact final submission.', metadata: { scopeHash: 'c'.repeat(64), documentVersion: session.documentVersion, fieldSchemaHash: 'a'.repeat(64) }, createdAt: new Date().toISOString() }],
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session, externalApplicationExecution: false, submissionsEnabled: false }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [session] }) });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#resumeApplication').click();
  await expect(page.locator('#applicationActionTitle')).toHaveText('Your final approval expired safely');
  await expect(page.locator('#applicationActionSummary')).toContainText('Nothing was submitted');
  await expect(page.locator('#resolveApplication')).toHaveText('Renew final approval');
  await page.locator('#resolveApplication').click();
  expect(patchBody).toEqual({ action: 'refresh-final-approval', sessionId: 'application-expired-approval-fixture', version: 12 });
  expect(JSON.stringify(patchBody)).not.toMatch(/scopeHash|fieldSchemaHash|email|value|password|otp|captcha/i);
  await expect(page.locator('#applicationActionTitle')).toHaveText('Submit this application?');
  await expect(page.locator('#resolveApplication')).toHaveText('Approve final submission');
  await expect(page.locator('#applicationReceipt')).toContainText('not counted as Submitted');
});

test('unknown final submission outcome blocks retry and keeps the application uncounted', async ({ page }) => {
  const session = {
    id: 'application-submission-unknown-fixture', version: 15, packageRunId: 'package-submission-unknown-fixture',
    role: { employer: 'Uncertain Employer', title: 'Category Manager', requisitionId: 'REQ-UNKNOWN-1', directEmployerUrl: 'https://careers.example.com/REQ-UNKNOWN-1' },
    documentVersion: 'resume-unknown-v1', state: 'Waiting for You', stage: 'receipt_verification', externalApplicationExecution: true,
    proposedFields: [], formCheckpoint: { status: 'preserved', pageUrl: 'https://careers.example.com/REQ-UNKNOWN-1', fieldSchemaHash: 'a'.repeat(64), attachedDocumentVersion: 'resume-unknown-v1', stagedFieldKeys: [] },
    approvals: { transmission: null, submission: { id: 'approval-used', consumedAt: new Date().toISOString(), scopeHash: 'b'.repeat(64), documentVersion: 'resume-unknown-v1' } },
    submissionExecution: { id: 'submission-task-unknown-1', status: 'outcome-unknown', scopeHash: 'b'.repeat(64), documentVersion: 'resume-unknown-v1', fieldSchemaHash: 'a'.repeat(64), startedAt: new Date().toISOString(), failureCode: 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN' },
    submissionAttempt: null, receipt: null, timeline: [],
    actions: [{ id: 'action-submission-unknown-1', type: 'SUBMISSION_OUTCOME_UNKNOWN', status: 'open', summary: 'The result could not be verified.', metadata: { taskId: 'submission-task-unknown-1', failureCode: 'SUBMISSION_PROVIDER_OUTCOME_UNKNOWN' }, createdAt: new Date().toISOString() }],
  };
  await page.route('**/api/session-capabilities*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }) }));
  await page.route('**/api/application-sessions*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [session] }) }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#resumeApplication').click();
  await expect(page.locator('#applicationActionTitle')).toHaveText('Check whether the employer received it');
  await expect(page.locator('#applicationActionSummary')).toContainText('Do not submit again');
  await expect(page.locator('#applicationPrivacy')).toContainText('Submission result is unknown');
  await expect(page.locator('#applicationReceipt')).toContainText('not counted as Submitted');
  await expect(page.locator('#openEmployerPage')).toBeVisible();
  await expect(page.locator('#resolveApplication')).toBeHidden();
  await expect(page.locator('#applicationRecoveryActions')).toBeHidden();
});

test('receipt-verified job can record a private interview outcome in one click', async ({ page }) => {
  let session = {
    id: 'application-outcome-fixture', version: 4, packageRunId: 'package-outcome-fixture',
    role: { employer: 'Outcome Employer', title: 'Procurement Lead', requisitionId: 'REQ-OUTCOME-1', directEmployerUrl: 'https://careers.example.com/REQ-OUTCOME-1' },
    documentVersion: 'resume-outcome-v2', state: 'Finished', stage: 'receipt_verification', externalApplicationExecution: true,
    proposedFields: [], approvals: { transmission: null, submission: null }, actions: [], timeline: [],
    receipt: { authority: 'employer-side', confirmationReference: '••••A123', receivedAt: '2026-08-29T13:00:00.000Z', verifiedAt: '2026-08-29T13:01:00.000Z' },
    postSubmission: { status: 'SUBMITTED', source: 'AUTHORITATIVE_EMPLOYER_RECEIPT', occurredAt: '2026-08-29T13:00:00.000Z', recordedAt: '2026-08-29T13:01:00.000Z', followUp: { status: 'NOT_SCHEDULED', dueAt: null, completedAt: null } },
  };
  let patchBody = null;
  await page.route('**/api/session-capabilities*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }) }));
  await page.route('**/api/application-sessions*', async route => {
    if (route.request().method() === 'PATCH') {
      patchBody = route.request().postDataJSON();
      session = { ...session, version: 5, postSubmission: { ...session.postSubmission, status: 'INTERVIEW', source: 'USER_CONFIRMED', recordedAt: new Date().toISOString() } };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session, externalApplicationExecution: false, submissionsEnabled: false }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [session] }) });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#resumeApplication').click();
  await expect(page.locator('#applicationTitle')).toHaveText('Application submitted');
  await expect(page.locator('#applicationPrivacy')).toContainText('update only your private tracker');
  await page.locator('[data-post-submission="INTERVIEW"]').click();
  await expect(page.locator('#applicationTitle')).toHaveText('Interview recorded');
  expect(patchBody).toMatchObject({ action: 'record-post-submission', outcome: 'INTERVIEW', confirmed: true, version: 4 });
  expect(JSON.stringify(patchBody)).not.toMatch(/password|otp|captcha/i);
  await page.locator('#closeApplication').click();
  await page.locator('#openJobs').click();
  await expect(page.locator('[data-job-tab="Interviews"] span')).toHaveText('1');
  await page.locator('[data-job-tab="Interviews"]').click();
  await expect(page.locator('#jobCards')).toContainText('Outcome Employer');
  await expect(page.locator('#jobCards')).toContainText('Interview');
});

test('resumable browser handoff shows only a safe read-only field-structure preview', async ({ page }) => {
  const applicationSessionId = 'application_local_fixture_001';
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const previewSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="680" height="320"><rect width="680" height="320" fill="#fff"/><text x="30" y="50">Synthetic local fixture - no employer contacted</text><text x="30" y="90">Start date - value not included</text></svg>';
  const previewImageDataUrl = `data:image/svg+xml;base64,${Buffer.from(previewSvg).toString('base64')}`;
  const session = {
    id: applicationSessionId, version: 1, packageRunId: 'run_local_fixture_package_001',
    role: { employer: 'Harbor Supply Co.', title: 'Strategic Sourcing Manager', requisitionId: 'REQ-DEMO-204', directEmployerUrl: 'https://careers.example.test/jobs/REQ-DEMO-204' },
    documentVersion: 'resume-demo-v3', state: 'Waiting for You', stage: 'transmission_approval', externalApplicationExecution: false,
    proposedFields: [{ fieldKey: 'startDate', label: 'Start date', factId: 'fact-local', maskedPreview: 'Verified answer ****', confidence: 1, provenance: 'candidate confirmation', ordinaryVerified: true }],
    approvals: { transmission: null, submission: null }, receipt: null,
    actions: [{ id: 'action-local', type: 'TRANSMISSION_APPROVAL', status: 'open', summary: 'Review exact sharing.', metadata: {}, createdAt: new Date().toISOString() }], timeline: [],
  };
  const browserSession = {
    id: 'browser_session_fixture_001', applicationSessionId, status: 'ready', employerHostname: 'careers.example.test',
    pageUrl: session.role.directEmployerUrl, viewMode: 'synthetic-static', interactive: false,
    fieldSchemaHash: 'a'.repeat(64), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt,
    containsCandidateFieldValues: false,
  };
  const view = {
    status: 'ready', viewMode: 'synthetic-static', interactive: false, pageUrl: session.role.directEmployerUrl,
    employerHostname: 'careers.example.test', fieldSchemaHash: 'a'.repeat(64), expiresAt, previewImageDataUrl,
    fields: [{ fieldRef: 'fixture_field_1', fieldKey: 'startDate', label: 'Start date', required: true }],
    containsCandidateFieldValues: false, submitted: false,
  };
  const provider = { available: true, viewMode: 'synthetic-static', interactive: false, costMode: 'no-provider-call', reason: null };
  let active = false;
  let postedBody = null;
  await page.route('**/api/session-capabilities*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }) }));
  await page.route('**/api/application-sessions*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [session] }) }));
  await page.route('**/api/employer-browser-session*', async route => {
    const method = route.request().method();
    if (method === 'POST') {
      postedBody = route.request().postDataJSON();
      active = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ session: browserSession, view, provider, replayed: false, externalApplicationExecution: false, submissionsEnabled: false }) });
    }
    if (method === 'DELETE') {
      active = false;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ closed: true, deleted: true, externalApplicationExecution: false, submissionsEnabled: false }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: active ? browserSession : null, view: active ? view : null, provider, externalApplicationExecution: false, submissionsEnabled: false }) });
  });
  await page.goto(`${baseUrl}?uiFixture=durable-application`, { waitUntil: 'networkidle' });
  await page.locator('#resumeApplication').click();
  await expect(page.locator('#applicationBrowserHandoff')).toBeVisible();
  await expect(page.locator('#browserHandoffMode')).toHaveText('Not started');
  await page.locator('#startBrowserHandoff').click();
  await expect(page.locator('#browserHandoffMode')).toHaveText('Read-only local fixture');
  await expect(page.locator('#browserPreviewImage')).toBeVisible();
  await expect(page.locator('#browserHandoffFields')).toContainText('Start date');
  await expect(page.locator('#browserHandoffFields')).toContainText('value not included');
  expect(postedBody).toEqual({ applicationSessionId });
  expect(JSON.stringify(postedBody)).not.toContain('Verified answer');
  expect(await page.locator('#applicationBrowserHandoff').innerText()).not.toContain('Verified answer ****');
  await page.locator('#closeBrowserHandoff').click();
  await expect(page.locator('#browserHandoffMode')).toHaveText('Not started');
  await expect(page.locator('#browserPreviewImage')).toBeHidden();
});

test('approved remote provider renders only its exact isolated stream origin in the application workspace', async ({ page }) => {
  const applicationSessionId = 'application_remote_stream_001';
  const expiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
  const session = {
    id: applicationSessionId, version: 1, packageRunId: 'run_remote_stream_package_001',
    role: { employer: 'Fixture Employer', title: 'Buyer', requisitionId: 'REQ-STREAM-1', directEmployerUrl: 'https://careers.company.invalid/apply/REQ-STREAM-1' },
    documentVersion: 'resume-stream-v1', state: 'Waiting for You', stage: 'employer_form', externalApplicationExecution: false,
    proposedFields: [{ fieldKey: 'firstName', label: 'First name', factId: 'fact-stream', maskedPreview: 'J••••', confidence: 1, provenance: 'candidate confirmation', ordinaryVerified: true }],
    approvals: { transmission: null, submission: null }, receipt: null, actions: [], timeline: [],
  };
  const browserSession = {
    id: 'browser_session_remote_001', applicationSessionId, status: 'ready', employerHostname: 'careers.company.invalid',
    pageUrl: session.role.directEmployerUrl, viewMode: 'interactive-stream', interactive: true, fieldSchemaHash: 'b'.repeat(64),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt, containsCandidateFieldValues: false,
  };
  const streamUrl = 'https://stream.browser.invalid/session/001?ticket=short-lived';
  const view = {
    status: 'ready', viewMode: 'interactive-stream', interactive: true, streamUrl, pageUrl: session.role.directEmployerUrl,
    employerHostname: 'careers.company.invalid', fieldSchemaHash: 'b'.repeat(64), expiresAt,
    fields: [{ fieldRef: 'field_first_name', fieldKey: 'firstName', label: 'First name', required: true }],
    containsCandidateFieldValues: false, submitted: false,
  };
  const provider = { available: true, viewMode: 'interactive-stream', interactive: true, costMode: 'metered-provider', streamOrigin: 'https://stream.browser.invalid', reason: null };
  let active = false;
  await page.route('https://stream.browser.invalid/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Isolated provider fixture</title><p>Employer stream fixture</p>' }));
  await page.route('**/api/session-capabilities*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ adminConsole: false, jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session' }) }));
  await page.route('**/api/application-sessions*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [session] }) }));
  await page.route('**/api/employer-browser-session*', route => {
    const method = route.request().method();
    if (method === 'POST') active = true;
    if (method === 'DELETE') active = false;
    if (method === 'DELETE') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ closed: true, deleted: true, externalApplicationExecution: false, submissionsEnabled: false }) });
    return route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify({ session: active ? browserSession : null, view: active ? view : null, provider, externalApplicationExecution: false, submissionsEnabled: false }) });
  });
  await page.goto(`${baseUrl}?uiFixture=durable-application`, { waitUntil: 'networkidle' });
  await page.locator('#resumeApplication').click();
  await page.locator('#startBrowserHandoff').click();
  await expect(page.locator('#browserHandoffMode')).toHaveText('Interactive secure stream');
  const frame = page.locator('#browserStreamFrame');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', streamUrl);
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  await expect(page.locator('#browserPreviewImage')).toBeHidden();
  await expect(page.locator('#browserHandoffFields')).toContainText('value not included');
  expect(await page.locator('#applicationBrowserHandoff').innerText()).not.toContain('J••••');
});

// Encrypted storage and the consent policy are independent gates. When encryption and
// durable storage are fully configured but the controlled-beta policy is not, the copy
// must name the policy — never tell the user that storage is unavailable or "not enabled",
// which misattributes a gate they cannot act on.
test('vault copy names the controlled-beta policy, not storage, when the policy is unconfigured', async ({ page }) => {
  await page.route('**/api/session-capabilities*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      adminConsole: false, jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session',
      jobAgentConsent: null, jobAgentConsentPolicyConfigured: false, jobAgentConsentVersion: 0,
    }),
  }));
  await page.route('**/api/applicant-vault*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ version: 0, vault: null }),
  }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  for (const id of ['#vaultStatus', '#resumeVaultStatus', '#questionVaultStatus']) {
    const target = page.locator(id);
    if (!(await target.count())) continue;
    await expect(target).toContainText('policy review is not complete');
    // The old copy blamed storage for this state.
    await expect(target).not.toContainText('until encrypted storage is enabled');
    await expect(target).not.toContainText('temporarily unavailable');
  }

  // The resume-scoped message must still carry the credential guarantee.
  if (await page.locator('#resumeVaultStatus').count()) {
    await expect(page.locator('#resumeVaultStatus')).toContainText('Passwords, OTPs, and CAPTCHA answers are never stored');
    await expect(page.locator('#resumeVaultStatus')).toContainText('remains only in this tab');
  }
});

test('vault copy asks an unauthenticated visitor to sign in rather than blaming storage', async ({ page }) => {
  await page.route('**/api/session-capabilities*', route => route.fulfill({
    status: 401, contentType: 'application/json',
    body: JSON.stringify({ error: 'Request not authorized.', code: 'AUTH_REQUIRED' }),
  }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const status = page.locator('#vaultStatus');
  if (await status.count()) {
    await expect(status).toContainText('Sign in with Job Agent access');
    await expect(status).not.toContainText('until encrypted storage is enabled');
  }
});

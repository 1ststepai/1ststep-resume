import { test, expect } from '@playwright/test';

const baseUrl = process.env.CONCIERGE_TEST_URL || 'http://127.0.0.1:4175/concierge';
const activeConsent = { status: 'active', active: true, code: null, scopes: ['direct-employer-discovery', 'confirmed-profile-storage', 'ai-document-preparation', 'application-workspace'] };

async function routeApprovedAccount(page, initialDraft = null, { withResume = true } = {}) {
  let version = 0;
  let state = {
    version: 1, campaigns: [], activeCampaignId: '', runs: [], items: [], humanActions: [], evidence: [], transitions: [],
    workspace: { version: 1, mission: {}, onboardingDraft: initialDraft, dailyGoal: { target: 10, updatedAt: null } },
    subscriberView: { version: 1, runState: null, jobCards: [], needsYou: [] },
  };
  await page.route('**/api/session-capabilities', route => route.fulfill({ json: { jobAgentAccess: true, tier: 'complete', sessionAuthentication: 'opaque-session', pilotAccess: { enforced: true, allowed: true }, jobAgentConsent: activeConsent, jobAgentConsentPolicyConfigured: true } }));
  await page.route('**/api/job-agent-consent', route => route.fulfill({ json: { consent: activeConsent, version: 1, policyConfigured: true } }));
  const documents = withResume ? [{ id: 'resume-trust-fixture', title: 'Master resume', type: 'master-resume', status: 'active', currentVersion: 1, versions: [{ version: 1, text: `Preview QA User\n${'Verified project coordination and data reporting experience.\n'.repeat(8)}`, fileName: 'resume.txt', provenance: 'candidate-reviewed' }] }] : [];
  await page.route('**/api/applicant-vault', route => route.fulfill({ json: { version: 1, vault: { consent: { status: 'granted' }, facts: [], documents } } }));
  await page.route('**/api/concierge-state', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      state = body.state;
      version += 1;
      return route.fulfill({ json: { version } });
    }
    return route.fulfill({ json: { version, state } });
  });
  return { snapshot: () => structuredClone(state) };
}

async function reopenAtSavedStep(page) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#openGuidedLaunch').click();
  await expect(page.locator('#guidedLaunchOverlay')).toHaveClass(/open/);
}

test('approved onboarding saves every answer, survives reloads, and exposes every hard exclusion', async ({ page }) => {
  const account = await routeApprovedAccount(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#openGuidedLaunch').click();

  await page.locator('[data-guided-goal="best-fit"]').click();
  await expect(page.locator('[data-guided-stage="goal"]')).toBeVisible();
  await expect.poll(() => account.snapshot().workspace.onboardingDraft?.goal).toBe('best-fit');
  await reopenAtSavedStep(page);
  await expect(page.locator('[data-guided-goal="best-fit"]')).toHaveAttribute('aria-checked', 'true');

  await page.locator('#guidedLaunchNext').click();
  await page.locator('#guidedLaunchNext').click();
  await page.locator('[data-opportunity-path]').filter({ hasText: 'Operations & Project Delivery' }).click();
  await expect.poll(() => account.snapshot().workspace.onboardingDraft?.pathId).toBe('operations');
  await reopenAtSavedStep(page);
  await expect(page.locator('[data-opportunity-path="operations"]')).toHaveAttribute('aria-checked', 'true');

  await page.locator('#guidedLaunchNext').click();
  await page.locator('[data-launch-choice="workMode"][data-value="Hybrid"]').click();
  await page.locator('#launchLocation').fill('Newark, NJ');
  await expect.poll(() => account.snapshot().workspace.onboardingDraft).toMatchObject({ workMode: 'Hybrid', location: 'Newark, NJ' });
  await reopenAtSavedStep(page);
  await expect(page.locator('#launchLocation')).toHaveValue('Newark, NJ');

  await page.locator('#guidedLaunchNext').click();
  await page.locator('[data-launch-choice="employmentType"][data-value="Contract"]').click();
  await expect.poll(() => account.snapshot().workspace.onboardingDraft?.employmentType).toBe('Contract');
  await reopenAtSavedStep(page);

  await page.locator('#guidedLaunchNext').click();
  await page.locator('[data-launch-choice="salary"][data-value="100000"]').click();
  await page.locator('[data-guided-stage="salary"] .fine-tune summary').click();
  await page.locator('#jobRequest').fill('Exclude defense contractors');
  await expect.poll(() => account.snapshot().workspace.onboardingDraft).toMatchObject({ salary: 100000, exclusions: ['defense contractors'] });
  await reopenAtSavedStep(page);
  await page.locator('[data-guided-stage="salary"] .fine-tune summary').click();
  await expect(page.locator('#jobRequest')).toHaveValue('defense contractors');
  await page.locator('#guidedLaunchNext').click();
  await expect(page.locator('#neverIncludeList')).toContainText('Exclude defense contractors');
  await expect(page.locator('#guidedLaunchSaveStatus')).toHaveAttribute('data-state', 'synced');
  await page.screenshot({ path: 'test-results/trust-remediation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#startJobSearch')).toBeInViewport();
  await page.screenshot({ path: 'test-results/trust-remediation-review-mobile.png' });
});

test('denied signed-in user sees a calm beta gate without a second login form', async ({ page }) => {
  await page.route('**/api/session-capabilities', route => route.fulfill({ json: { jobAgentAccess: false, tier: 'complete', sessionAuthentication: 'opaque-session', pilotAccess: { enforced: true, allowed: false, code: 'JOB_AGENT_PILOT_INVITE_REQUIRED' } } }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(page.locator('#agentAccessOverlay')).toHaveClass(/open/);
  await expect(page.locator('#agentAccessMessage')).toContainText('limited to invited members');
  await expect(page.locator('#agentAccessCredentialFields')).toBeHidden();
  await expect(page.locator('#guidedLaunchOverlay')).not.toHaveClass(/open/);
});

test('mobile keeps Continue reachable and advertises scrollable job statuses', async ({ page }) => {
  await routeApprovedAccount(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#openGuidedLaunch').click();
  await expect(page.locator('#guidedLaunchNext')).toBeInViewport();
  await page.locator('#guidedLaunchClose').click();
  await page.locator('#openJobs').click();
  await expect(page.locator('#jobTabsHint')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.mobile-nav-more')).toBeVisible();
  await page.screenshot({ path: 'test-results/trust-remediation-mobile.png', fullPage: true });
});

test('sector exploration is non-consequential and live comparison has progress, partial fallback, retry, and support ID', async ({ page }) => {
  await routeApprovedAccount(page);
  let correlationId = '';
  await page.route('**/api/concierge-discovery', async route => {
    correlationId = route.request().headers()['x-correlation-id'];
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.fulfill({ json: { status: 'partial', partial: true, correlationId, jobs: [], supplyByPath: {}, sourceSummary: [{ status: 'error' }], filterSummary: { scanned: 0 } } });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#openGuidedLaunch').click();
  await page.locator('[data-guided-goal="best-fit"]').click();
  await page.locator('#guidedLaunchNext').click();
  await page.locator('#guidedLaunchNext').click();
  await page.locator('[data-opportunity-path="operations"]').click();
  await page.locator('#jobSectorFilter').selectOption('technology-product');
  await expect(page.locator('#sectorRoleDecision')).toBeVisible();
  await expect(page.locator('#sectorRoleDecision')).toContainText('Keep Operations & Project Delivery');
  await expect(page.locator('[data-opportunity-path][aria-checked="true"]')).toHaveCount(0);
  await page.locator('#retainSectorRole').click();
  await page.locator('#scanOpportunityPaths').click();
  await expect(page.locator('#pathScanStatus')).toContainText('Usually 20–35 seconds');
  await expect(page.locator('#pathScanStatus')).toContainText('timeout at 40 seconds');
  await expect(page.locator('#pathScanPhase')).toHaveText('Partial results are ready');
  await expect(page.locator('#retryOpportunityPaths')).toBeVisible();
  await expect(page.locator('#pathScanSupport')).toContainText(correlationId);
  expect(correlationId).toMatch(/^[a-f0-9-]{20,64}$/i);
});

test('resume generation cannot silently drop confirmed education or skills', async ({ page }) => {
  await routeApprovedAccount(page, null, { withResume: false });
  await page.route('**/api/ai', route => route.fulfill({ json: { text: 'Preview QA User · qa@example.invalid\n\nEXPERIENCE\nQA Coordinator at Example Co, 2022-present' } }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#openGuidedLaunch').click();
  await page.locator('[data-guided-goal="best-fit"]').click();
  await page.locator('#guidedLaunchNext').click();
  await page.locator('#quickBuildResume').click();
  await page.locator('#questionValue').fill('Preview QA User, qa@example.invalid');
  await page.locator('#questionForm').evaluate(form => form.requestSubmit());
  await expect(page.locator('#questionTitle')).toHaveText('Employment history');
  await page.locator('#questionValue').fill('QA Coordinator at Example Co, 2022-present. Coordinated projects and prepared weekly data reports.');
  await page.locator('#questionForm').evaluate(form => form.requestSubmit());
  await expect(page.locator('#questionTitle')).toHaveText('Education history');
  await page.locator('#questionValue').fill("Bachelor's degree");
  await page.locator('#questionForm').evaluate(form => form.requestSubmit());
  await expect(page.locator('#questionTitle')).toHaveText('Verified skills');
  await page.locator('#questionValue').fill('Project coordination, Data & reporting');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#questionForm').evaluate(form => form.requestSubmit());
  await expect(page.locator('#resumeOverlay')).toHaveClass(/open/);
  await expect(page.locator('#resumeEditor')).toHaveValue(/Bachelor's degree/);
  await expect(page.locator('#resumeEditor')).toHaveValue(/Project coordination/);
  await expect(page.locator('#resumeEditor')).toHaveValue(/Data & reporting/);
  await expect(page.locator('#resumeFactReview')).toContainText('Restore required');
  await expect(page.locator('#resumeMeta')).toContainText('omitted confirmed facts');
});

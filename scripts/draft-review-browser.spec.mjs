const testOrigin = new URL(process.env.CONCIERGE_TEST_URL || testOrigin + '/concierge').origin;
import { test, expect } from '@playwright/test';

const resume = 'Synthetic candidate\n\nProcurement manager\n' + 'Managed supplier relationships and negotiated purchasing terms.\n'.repeat(12);
const cover = 'Dear Hiring Team,\n\nSynthetic cover letter for review.';

async function setup(page, { second = false, withCover = true, needsYou = false } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'Synthetic service unavailable' } }));
  await page.route('**/api/session-capabilities*', route => route.fulfill({ json: { jobAgentAccess: true, tier: 'complete', authentication: 'opaque-session', sessionAuthentication: 'opaque-session' } }));
  await page.addInitScript(({ resume, cover, second, withCover, needsYou }) => {
    const roles = [1, ...(second ? [2] : [])].map(number => ({
      id: `review-role-${number}`, employer: `Example Employer ${number}`, title: 'Procurement Manager', requisitionId: `TEST-${number}`,
      directEmployerUrl: `https://careers.example.com/jobs/TEST-${number}`, status: 'Found', fitScore: 90,
      packageRunId: `review-run-${number}`, packageRunStatus: 'Waiting for You',
      packageDraft: { historyId: `review-run-${number}`, documentVersion: `version-${number}`, resumeText: resume,
        coverLetterText: withCover ? cover : '', atsIssues: ['UNMAPPED_OUTPUT_CLAIM'], artifacts: [], source: 'durable-job-agent-package' },
    }));
    const actionQueue = needsYou ? [{ id: 'review-action', roleId: 'review-role-1', type: 'NEW_QUESTION', status: 'open', summary: 'Review the generated package: UNMAPPED_OUTPUT_CLAIM. No document was transmitted.' }] : [];
    sessionStorage.setItem('1ststep_concierge_desk_v2', JSON.stringify({ roles, reusableFacts: [], standingPolicies: [], approvalBatches: [], actionQueue, applicationSessions: [], hiringEcosystem: [], acquisitionOutcomes: [], auditEvents: [] }));
  }, { resume, cover, second, withCover, needsYou });
  await page.goto(testOrigin + '/concierge?uiFixture=durable-application');
  if (needsYou) return errors;
  await page.locator('#openJobs').click();
  await page.locator('[data-job-package-review="review-role-1"]').click();
  await expect(page.locator('#packageReviewOverlay')).toBeVisible();
  return errors;
}

test('Needs You translates legacy codes and opens the matching saved draft from both queues', async ({ page }) => {
  const errors = await setup(page, { needsYou: true });
  await expect(page.locator('#attentionNow')).toBeVisible();
  await expect(page.locator('#attentionNowTitle')).toContainText(/application.*need/i);
  await expect(page.locator('#attentionNow')).not.toContainText('UNMAPPED_OUTPUT_CLAIM');
  await expect(page.locator('#agentConversation')).toBeHidden();
  await expect(page.locator('#reviewAttentionNow')).toContainText(/review|resume/i);
  await page.locator('#reviewAttentionNow').click();
  await expect(page.locator('#packageReviewOverlay')).toBeVisible();
  await page.locator('#closePackageReview').click();
  await page.locator('#openNeedsYou').click();
  await expect(page.locator('#needsYouList')).toContainText('Compare the draft with your original resume');
  await expect(page.locator('#needsYouList')).not.toContainText('UNMAPPED_OUTPUT_CLAIM');
  const reviewDraft = page.locator('#needsYouList').getByRole('button', { name: 'Review resume draft' });
  if (!(await reviewDraft.isVisible())) await page.locator('#needsYouList details > summary').click();
  await reviewDraft.click();
  await expect(page.locator('#packageReviewOverlay')).toBeVisible();
  await expect(page.locator('#packageResumeText')).toHaveValue(resume);
  await expect(page.locator('#needsYouOverlay')).toBeHidden();
  await page.locator('#closePackageReview').click();
  await page.locator('#openJobs').click();
  await page.locator('[data-job-tab="Needs You"]').click();
  await expect(page.locator('#jobCards')).not.toContainText('UNMAPPED_OUTPUT_CLAIM');
  await page.locator('#jobCards').getByRole('button', { name: 'Review resume draft' }).click();
  await expect(page.locator('#packageReviewOverlay')).toBeVisible();
  await expect(page.locator('#jobsOverlay')).toBeHidden();
  expect(errors).toEqual([]);
});

function revisedRun(body, index) {
  return { id: `saved-review-${index}`, status: 'Waiting for You', mission: { roleId: 'review-role-1', employer: 'Example Employer 1', title: 'Procurement Manager' },
    result: { documentVersion: `saved-version-${index}`, resumeText: body.resumeText, coverLetterText: body.coverLetterText, qa: { issues: ['UNMAPPED_OUTPUT_CLAIM'] }, artifacts: [], qaStatus: 'human-review-required' } };
}

test('guided document tabs and next draft reuse saved work without generation or submission', async ({ page }) => {
  const writes = [];
  page.on('request', request => { if (request.method() === 'POST') writes.push(request.url()); });
  const errors = await setup(page, { second: true });
  await expect(page.locator('#packageReviewGuidance')).toContainText('original resume');
  await expect(page.locator('#packageReviewOverlay')).not.toContainText('UNMAPPED_OUTPUT_CLAIM');
  await expect(page.locator('#packageCoverWrap')).toBeHidden();
  await expect(page.locator('#packageReviewPosition')).toHaveText('Job 1 of 2');
  await page.locator('#packageResumeTab').press('ArrowRight');
  await expect(page.locator('#packageCoverTab')).toBeFocused();
  await expect(page.locator('#packageResumeWrap')).toBeHidden();
  await page.locator('#nextPackageReview').click();
  await expect(page.locator('#packageReviewJob')).toContainText('Example Employer 2');
  await expect(page.locator('#packageReviewPosition')).toHaveText('Job 2 of 2');
  await page.locator('#nextPackageReview').click();
  await page.locator('#nextPackageReview').click();
  await expect(page.locator('#packageReviewOverlay')).toBeHidden();
  await expect(page.locator('#jobsOverlay')).toBeVisible();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('edits autosave serially without overwriting typing and reopen from saved state', async ({ page }) => {
  const writes = [];
  let release;
  const errors = await setup(page);
  await page.route('**/api/application-packages', async route => {
    const body = route.request().postDataJSON(); writes.push(body);
    if (writes.length === 1) await new Promise(resolve => { release = resolve; });
    await route.fulfill({ status: 202, json: { run: revisedRun(body, writes.length) } });
  });
  await page.locator('#packageResumeText').fill(resume + '\nFirst edit.');
  await expect.poll(() => writes.length).toBe(1);
  await expect(page.locator('#packageSaveStatus')).toHaveText('Saving…');
  const latest = resume + '\nNewer edit made while saving.';
  await page.locator('#packageResumeText').fill(latest);
  release();
  await expect(page.locator('#packageSaveStatus')).toHaveText('Saved');
  expect(writes).toHaveLength(2);
  expect(writes.every(body => body.action === 'revise')).toBe(true);
  expect(writes[1].baseRunId).toBe('saved-review-1');
  await expect(page.locator('#packageResumeText')).toHaveValue(latest);
  await page.locator('#closePackageReview').click();
  await page.locator('#openJobs').click();
  await page.locator('[data-job-package-review="review-role-1"]').click();
  await expect(page.locator('#packageResumeText')).toHaveValue(latest);
  expect(writes).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('failed saves preserve edits and block dismissal until a successful explicit retry', async ({ page }) => {
  const errors = await setup(page);
  let offline = true;
  const writes = [];
  await page.route('**/api/application-packages', async route => {
    const body = route.request().postDataJSON(); writes.push(body);
    await route.fulfill(offline ? { status: 503, json: { error: 'Offline' } } : { json: { run: revisedRun(body, 1) } });
  });
  const edited = resume + '\nKeep this change.';
  await page.locator('#packageResumeText').fill(edited);
  await expect(page.locator('#savePackageReview')).toBeVisible();
  await expect(page.locator('#packageSaveStatus')).toContainText('Couldn’t save');
  await page.locator('#closePackageReview').click();
  await expect(page.locator('#packageReviewOverlay')).toBeVisible();
  await expect(page.locator('#packageResumeText')).toHaveValue(edited);
  offline = false;
  await page.locator('#savePackageReview').click();
  await expect(page.locator('#packageSaveStatus')).toHaveText('Saved');
  expect(writes.every(body => body.baseRunId === 'review-run-1')).toBe(true);
  await page.locator('#closePackageReview').click();
  await expect(page.locator('#packageReviewOverlay')).toBeHidden();
  expect(errors).toEqual([]);
});

test('mobile review has one document, visible next action and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await setup(page, { withCover: false });
  await expect(page.locator('#packageCoverTab')).toBeHidden();
  await expect(page.locator('#nextPackageReview')).toHaveText('Save and return to jobs');
  await expect(page.locator('#packageMoreOptions')).not.toHaveAttribute('open');
  await expect(page.locator('#copyPackageText')).toBeHidden();
  const next = await page.locator('#nextPackageReview').boundingBox();
  expect(next.y + next.height).toBeLessThanOrEqual(844);
  expect(await page.locator('.package-review-shell').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: 'output/draft-review-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'output/draft-review-desktop.png' });
  expect(errors).toEqual([]);
});

test('copy uses the selected document without preparing or submitting anything', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await setup(page);
  await page.locator('#packageMoreOptions summary').click();
  await page.locator('#copyPackageText').click();
  await expect(page.locator('#packageCopyStatus')).toContainText('Copied.');
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(resume);
  await page.locator('#packageCoverTab').click();
  await page.locator('#copyPackageText').click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(cover);
  expect(errors).toEqual([]);
});

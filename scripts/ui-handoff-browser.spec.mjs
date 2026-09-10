import { test, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.env.BROWSER_TEST_ORIGIN || 'http://127.0.0.1:4175';

test('subscriber workspace uses light surfaces and opens Needs You', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/concierge?uiFixture=subscriber`, { waitUntil: 'networkidle' });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
  await expect(page.locator('.attention-now')).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), '1ststep-ui-handoff-desktop.png') });
  await page.locator('#openNeedsYou').click();
  await expect(page.locator('.needs-sheet')).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), '1ststep-ui-handoff-needs-you.png') });
});

test('first visit presents one clear task and keeps secondary tools behind Menu', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/concierge`, { waitUntil: 'networkidle' });

  await expect(page.locator('#agentTitle')).toHaveText('Let’s get your job search ready.');
  await expect(page.locator('#openGuidedLaunch')).toContainText('Add my resume');
  await expect(page.locator('.agent-promise')).toHaveText('Nothing is sent without your approval.');
  await expect(page.locator('.agent-launch .launch-benefits span')).toHaveCount(3);
  await expect(page.locator('.agent-footer')).toHaveCount(0);
  await expect(page.locator('#openVault')).toBeHidden();
  await page.screenshot({ path: join(tmpdir(), '1ststep-simplified-first-visit-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#openJobs')).toBeHidden();
  await expect(page.locator('#openNeedsYou')).toBeHidden();
  await expect(page.locator('#appMenu > summary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), '1ststep-simplified-first-visit-mobile.png'), fullPage: true });
});

test('mobile My Jobs reviews one match at a time without submitting by swipe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => sessionStorage.setItem('1ststep_concierge_desk_v2', JSON.stringify({
    roles: [
      { id: 'swipe-one', employer: 'Example Company', title: 'Procurement Manager', status: 'Found', fitScore: 92, remoteEligibility: 'Remote', salaryMin: 100000, salaryMax: 125000, matchReasons: ['Vendor and sourcing experience.'], discoveryRunId: 'swipe-run', applyPathActive: true, requisitionId: 'REQ-SWIPE-1', directEmployerUrl: 'https://jobs.example.test/1', jobDescription: 'Verified role description. '.repeat(20) },
      { id: 'swipe-two', employer: 'Second Company', title: 'Strategic Sourcing Manager', status: 'Found', fitScore: 88, remoteEligibility: 'Hybrid', salaryMin: 110000, salaryMax: 130000, matchReasons: ['Procurement leadership experience.'], discoveryRunId: 'swipe-run', applyPathActive: true, requisitionId: 'REQ-SWIPE-2', directEmployerUrl: 'https://jobs.example.test/2', jobDescription: 'Verified role description. '.repeat(20) },
    ], reusableFacts: [], standingPolicies: [], approvalBatches: [], actionQueue: [], applicationSessions: [], hiringEcosystem: [], acquisitionOutcomes: [], auditEvents: [],
  })));
  await page.goto(`${base}/concierge`, { waitUntil: 'domcontentloaded' });
  await page.locator('#appMenu > summary').click();
  await page.locator('#openJobsMenu').click();

  await expect(page.locator('.swipe-job-card:visible')).toHaveCount(1);
  await expect(page.locator('.swipe-job-card:visible')).toContainText('Example Company');
  await expect(page.locator('[data-swipe-prepare]')).toHaveText(/Save & prepare/);
  await expect(page.locator('.swipe-job-controls')).toContainText('No application is sent by a swipe.');
  expect((await page.locator('.swipe-actions button').allTextContents()).join(' ')).not.toMatch(/Apply|Submit/i);
  await page.screenshot({ path: join(tmpdir(), '1ststep-mobile-swipe-jobs.png'), fullPage: true });

  const box = await page.locator('.swipe-job-card:visible').boundingBox();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.swipe-job-card:visible')).toContainText('Second Company');
  await page.locator('[data-swipe-undo]').click();
  await expect(page.locator('.swipe-job-card:visible')).toContainText('Example Company');
  await page.locator('#closeJobs').click();
  await expect(page.locator('#appMenu > summary')).toBeFocused();
});

test('resume chooser hides unavailable capability, stacks on mobile, and opens builder', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}/app/resume`);
  await expect(page.locator('#welcomeResumeProductBtn')).toBeVisible();
  await expect(page.locator('#welcomeExtensionProductBtn')).toBeHidden();
  const columns = await page.locator('#productChoiceGrid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  await page.locator('#welcomeResumeProductBtn').click();
  await page.locator('#welcomeBuildBtn').click();
  await expect(page.locator('#resumeBuilderModal')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [375, 390, 720]) {
  test(`mobile navigation has readable labels and usable targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/concierge`);
    for (const button of await page.locator('.agent-header nav button:visible').all()) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(10.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('mobile first visit keeps one menu in the header and secondary actions on demand', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/concierge`);

  await expect(page.locator('#appMenu > summary')).toBeVisible();
  await expect(page.locator('#openAgentAccess')).toBeHidden();
  await expect(page.locator('#openVault')).toBeHidden();
  await expect(page.locator('#openJobs')).toBeHidden();
  await expect(page.locator('#openNeedsYou')).toBeHidden();
  await page.locator('#appMenu > summary').click();
  await expect(page.locator('#openAgentAccess')).toBeVisible();
  await expect(page.locator('#openVault')).toBeVisible();
  const layout = await page.evaluate(() => {
    const header = document.querySelector('.agent-header');
    const nav = header.querySelector('nav');
    const menu = document.querySelector('#appMenu > summary');
    const headerBox = header.getBoundingClientRect();
    const menuBox = menu.getBoundingClientRect();
    return {
      bodyPaddingBottom: getComputedStyle(document.body).paddingBottom,
      headerPosition: getComputedStyle(header).position,
      navPosition: getComputedStyle(nav).position,
      menuInsideHeader: menuBox.top >= headerBox.top && menuBox.bottom <= headerBox.bottom,
      footerRemoved: !document.querySelector('.agent-footer'),
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  expect(layout).toEqual({
    bodyPaddingBottom: '0px',
    headerPosition: 'relative',
    navPosition: 'static',
    menuInsideHeader: true,
    footerRemoved: true,
    noHorizontalOverflow: true,
  });
  await page.screenshot({ path: join(tmpdir(), '1ststep-mobile-shell-layout.png'), fullPage: true });
});

test('mobile subscriber workspace keeps navigation and theme control in flow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/concierge?uiFixture=subscriber`, { waitUntil: 'networkidle' });
  await expect(page.locator('#openAgentAccess')).toBeHidden();
  await expect(page.locator('#openJobs')).toBeHidden();
  await expect(page.locator('#appMenu > summary')).toBeVisible();
  expect(await page.locator('.agent-header nav').evaluate(el => getComputedStyle(el).position)).toBe('static');
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).paddingBottom)).toBe('0px');
  await page.locator('#appMenu > summary').click();
  await expect(page.locator('#openJobsMenu')).toBeVisible();
  await expect(page.locator('[data-theme-toggle]')).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), '1ststep-mobile-workspace-navigation.png'), fullPage: true });
});

test('reduced motion keeps workspace progress visible without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/app/resume`);
  const result = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'skeleton';
    document.body.append(el);
    const value = getComputedStyle(el).animationName;
    el.remove();
    return value;
  });
  expect(result).toBe('none');
});

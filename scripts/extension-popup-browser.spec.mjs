import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const extensionRoot = new URL('../1ststep-extension/', import.meta.url);
const completeJob = {
  site: 'careers.example.com',
  jobId: 'OPS-123',
  jobTitle: 'Operations Lead',
  company: 'Example Industries',
  jobDescription: 'Lead operations, reporting, vendor coordination, and process improvement. '.repeat(8),
  applyUrl: 'https://careers.example.com/jobs/ops-123',
  location: 'Newark, NJ',
};

async function openPopup(page, job = completeJob, activeUrl = job?.applyUrl || 'https://careers.example.com/') {
  const html = await readFile(new URL('popup.html', extensionRoot), 'utf8');
  const script = await readFile(new URL('popup.js', extensionRoot), 'utf8');
  await page.addInitScript(({ capturedJob, currentUrl }) => {
    globalThis.__runtimeMessages = [];
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          globalThis.__runtimeMessages.push(message);
          const response = message.action === 'GET_JOB_AGENT_STATUS'
            ? { success: true, data: { capabilities: { jobAgentAccess: true } } }
            : message.action === 'CAPTURE_ACTIVE_TAB'
              ? { success: Boolean(capturedJob), job: capturedJob }
              : { success: true, jobCaptureId: 'capture-test' };
          Promise.resolve().then(() => callback?.(response));
          return Promise.resolve(response);
        },
      },
      tabs: {
        query(_query, callback) {
          const tabs = [{ id: 1, url: currentUrl }];
          callback?.(tabs);
          return Promise.resolve(tabs);
        },
        sendMessage(_id, _message, _options, callback) {
          const done = typeof _options === 'function' ? _options : callback;
          Promise.resolve().then(() => done?.({ job: capturedJob }));
        },
        create() {},
      },
    };
  }, { capturedJob: job, currentUrl: activeUrl });
  await page.route('https://extension.test/popup.html', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('https://extension.test/popup.js', route => route.fulfill({ contentType: 'text/javascript', body: script }));
  await page.goto('https://extension.test/popup.html');
}

test('popup shows the two useful paths without a manual description field', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.setViewportSize({ width: 380, height: 650 });
  await openPopup(page);

  await expect(page.locator('#jobTitle')).toHaveText('Operations Lead');
  await expect(page.locator('#company')).toHaveText('Example Industries');
  await expect(page.locator('#tailorBtn')).toHaveText('Save to My Jobs');
  await expect(page.locator('#jobAgentBtn')).toHaveText('Use in Resume Builder');
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.locator('#jobCard')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.locator('#tailorBtn').click();
  await expect.poll(() => page.evaluate(() => globalThis.__runtimeMessages.at(-1)?.mode)).toBe('jobAgent');
  expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: join(tmpdir(), '1ststep-extension-popup-v1.6.0.png'), fullPage: true });
});

test('popup requires a company before handoff', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 650 });
  await openPopup(page, { ...completeJob, company: '' });

  await expect(page.locator('#jobInfoForm')).toBeVisible();
  await page.locator('#tailorBtn').click();
  await expect(page.locator('#companyInput')).toBeFocused();
  await expect(page.locator('#companyInput')).toHaveClass(/required-error/);
});

test('empty state offers autofill only on a supported Greenhouse page', async ({ page }) => {
  await openPopup(page, null, 'https://careers.example.com/jobs/123');
  await expect(page.locator('#autofillEmptyBtn')).toBeHidden();

  await page.reload();
  await openPopup(page, null, 'https://boards.greenhouse.io/example/jobs/123');
  await expect(page.locator('#autofillEmptyBtn')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const extensionRoot = new URL('../1ststep-extension/', import.meta.url);
const sampleJob = {
  site: 'job-page', sourceLabel: 'careers.example.com', jobId: 'OPS-123',
  jobTitle: 'Operations Lead', company: 'Example Industries',
  jobDescription: 'Lead operations, reporting, vendor coordination, and process improvement. '.repeat(8),
  applyUrl: 'https://careers.example.com/jobs/ops-123', location: 'Newark, NJ',
};

async function openExtensionSurface(page, name, authenticated = true) {
  const html = await readFile(new URL(name, extensionRoot), 'utf8');
  const scriptName = name.replace('.html', '.js');
  const script = await readFile(new URL(scriptName, extensionRoot), 'utf8');
  await page.addInitScript(({ job, signedIn }) => {
    const runtime = {
      lastError: null,
      sendMessage(message, callback) {
        const response = message.action === 'GET_JOB_AGENT_STATUS'
          ? { success: signedIn, data: { capabilities: { jobAgentAccess: signedIn } } }
          : message.action === 'CAPTURE_ACTIVE_JOB' ? { success: true, job }
            : { success: true, jobCaptureId: 'capture-test' };
        Promise.resolve().then(() => callback?.(response));
        return Promise.resolve(response);
      },
    };
    globalThis.chrome = {
      runtime,
      tabs: {
        query(_query, callback) { const tabs = [{ id: 1, url: job.applyUrl }]; callback?.(tabs); return Promise.resolve(tabs); },
        sendMessage(_id, _message, _options, callback) {
          const done = typeof _options === 'function' ? _options : callback;
          Promise.resolve().then(() => done?.({ job }));
        },
        create() {},
      },
    };
  }, { job: sampleJob, signedIn: authenticated });
  await page.route(`https://extension.test/${name}`, route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route(`https://extension.test/${scriptName}`, route => route.fulfill({ contentType: 'text/javascript', body: script }));
  await page.goto(`https://extension.test/${name}`);
}

test('popup presents one clear save action without copy and paste', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 650 });
  await openExtensionSurface(page, 'popup.html');
  await expect(page.locator('#jobTitle')).toHaveText('Operations Lead');
  await expect(page.locator('#company')).toHaveText('Example Industries');
  await expect(page.locator('#tailorBtn')).toHaveText('Save to My Jobs');
  await expect(page.locator('body')).not.toContainText('paste');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), '1ststep-extension-popup-v1.4.0.png'), fullPage: true });
});

test('side panel captures the current job and keeps editing available', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 780 });
  await openExtensionSurface(page, 'sidepanel.html');
  await expect(page.locator('#title')).toHaveText('Operations Lead');
  await expect(page.locator('#capture')).toHaveText('Save to My Jobs');
  await page.locator('#edit').click();
  await expect(page.locator('#companyName')).toHaveValue('Example Industries');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), '1ststep-extension-sidepanel-v1.4.0.png'), fullPage: true });
});


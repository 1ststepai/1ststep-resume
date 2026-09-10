import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const extensionPath = join(root, '1ststep-extension');
const profilePath = await mkdtemp(join(tmpdir(), 'firststep-extension-smoke-'));
let context;

try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  assert.match(worker.url(), /^chrome-extension:\/\/[a-p]{32}\/background\.js$/);

  await context.route('https://boards.greenhouse.io/fixture/jobs/123', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head><title>Procurement Lead | Fixture Co</title></head><body>
      <h1>Procurement Lead</h1><div class="company-name">Fixture Co</div>
      <main id="app_body" class="job-description">${'Lead verified sourcing strategy, negotiations, and supplier performance. '.repeat(10)}</main>
    </body></html>`,
  }));
  await context.route('https://app.1ststep.ai/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><title>1stStep fixture receiver</title><main>Captured job receiver</main>',
  }));

  for (const existing of context.pages()) {
    if (existing.url().startsWith('https://app.1ststep.ai/')) await existing.close();
  }
  const jobPage = await context.newPage();
  await jobPage.goto('https://boards.greenhouse.io/fixture/jobs/123');
  const actionButton = jobPage.locator('[id="1ststep-tailor-btn"]');
  await actionButton.waitFor({ state: 'visible' });

  const badge = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://boards.greenhouse.io/*' });
    return { text: await chrome.action.getBadgeText({ tabId: tab.id }), title: await chrome.action.getTitle({ tabId: tab.id }) };
  });
  assert.equal(badge.text, 'JOB');
  assert.match(badge.title, /Procurement Lead/);

  await actionButton.click();
  let receiver = null;
  for (let attempt = 0; attempt < 100 && !receiver; attempt += 1) {
    receiver = context.pages().find(page => /^https:\/\/app\.1ststep\.ai\/app\/resume\?/.test(page.url())) || null;
    if (!receiver) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(receiver, 'Resume Builder receiver did not open or activate');
  await receiver.waitForLoadState('domcontentloaded');
  assert.match(receiver.url(), /^https:\/\/app\.1ststep\.ai\/app\/resume\?jobCaptureId=[0-9a-f-]+&mode=tailor$/);

  console.log('Unpacked Chromium smoke passed: real MV3 worker loaded, Greenhouse page detected, JOB badge set, in-page action rendered, and exact Resume Builder handoff opened.');
} finally {
  await context?.close();
  if (profilePath.startsWith(join(tmpdir(), 'firststep-extension-smoke-'))) {
    await rm(profilePath, { recursive: true, force: true });
  }
}

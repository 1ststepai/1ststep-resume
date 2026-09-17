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

async function launchFixtureBrowser() {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: true,
    // Apply before extension bootstrap: onInstalled can open the welcome tab
    // before Playwright routes exist. Fixture fulfillment needs no DNS lookup.
    args: ['--host-resolver-rules=MAP * ~NOTFOUND', `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  // All employer/app traffic is synthetic, including after profile restart.
  await context.route('**/*', route => route.abort());
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
    body: `<!doctype html><title>1stStep fixture receiver</title><main>Captured job receiver</main>
      <script>window.captures = []; window.addEventListener('message', event => {
        if (event.source === window && event.origin === location.origin && event.data?.type === '1STSTEP_JOB_CAPTURE') window.captures.push(event.data);
      });</script>`,
  }));
  await context.route('https://app.1ststep.ai/api/**', route => route.fulfill({
    status: 401, contentType: 'application/json', body: '{"error":"Fixture signed out"}',
  }));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  assert.match(worker.url(), /^chrome-extension:\/\/[a-p]{32}\/background\.js$/);
  return worker;
}

async function restartFixtureBrowser() {
  // Do not restore tabs before routing is installed; preserve only the profile.
  for (const page of context.pages()) await page.close();
  await context.close();
  return launchFixtureBrowser();
}

try {
  let worker = await launchFixtureBrowser();

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
  const receiverUrl = receiver.url();
  const captureId = new URL(receiverUrl).searchParams.get('jobCaptureId');
  await receiver.waitForFunction(id => window.captures.some(capture => capture.captureId === id), captureId);
  const beforeRestart = await worker.evaluate(async () => (await chrome.storage.local.get('pendingJobs')).pendingJobs);
  assert.equal(beforeRestart[captureId].jobData.jobTitle, 'Procurement Lead');
  await worker.evaluate(async () => chrome.storage.session.set({ restartProbe: true }));

  worker = await restartFixtureBrowser();
  assert.deepEqual(await worker.evaluate(async () => chrome.storage.session.get('restartProbe')), {}, 'session data must not survive browser restart');
  assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get('pendingJobs')).pendingJobs), beforeRestart,
    'unacknowledged capture must survive a real browser restart');
  receiver = await context.newPage();
  await receiver.goto(receiverUrl);
  await receiver.waitForFunction(id => window.captures.some(capture => capture.captureId === id), captureId);
  const delivered = await receiver.evaluate(() => window.captures[0]);
  assert.equal(delivered.captureId, captureId);
  assert.equal(delivered.jobData.jobTitle, 'Procurement Lead');
  assert.equal(delivered.resumeText, null, 'restart must not invent a résumé authority');

  await receiver.evaluate(id => {
    window.captures = [];
    window.postMessage({ type: '1STSTEP_JOB_CAPTURE_ACK', captureId: 'wrong-capture' }, location.origin);
    window.postMessage({ type: '1STSTEP_JOB_CAPTURE_REQUEST', captureId: id }, location.origin);
  }, captureId);
  await receiver.waitForFunction(id => window.captures.some(capture => capture.captureId === id), captureId);
  assert.deepEqual(await worker.evaluate(async () => (await chrome.storage.local.get('pendingJobs')).pendingJobs), beforeRestart,
    'wrong-ID acknowledgement must not consume the pending capture');

  await receiver.evaluate(id => window.postMessage({ type: '1STSTEP_JOB_CAPTURE_ACK', captureId: id }, location.origin), captureId);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const pending = await worker.evaluate(async () => (await chrome.storage.local.get('pendingJobs')).pendingJobs);
    if (!pending[captureId]) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await worker.evaluate(async id => !!(await chrome.storage.local.get('pendingJobs')).pendingJobs[id], captureId), false,
    'matching ACK must consume the capture');
  worker = await restartFixtureBrowser();
  assert.equal(await worker.evaluate(async id => !!(await chrome.storage.local.get('pendingJobs')).pendingJobs[id], captureId), false,
    'consumed capture must remain absent after second browser restart');

  console.log('FIXTURE VERIFIED: real unpacked MV3 Chromium worker, Greenhouse detection/badge/handoff, browser restart persistence, transient-session reset, exact-ID bridge redelivery, wrong-ID ACK rejection, and durable matching-ACK retirement. Hosted auth/storage, extension update migration, and employer submission are NOT VERIFIED.');
} finally {
  await context?.close();
  if (profilePath.startsWith(join(tmpdir(), 'firststep-extension-smoke-'))) {
    await rm(profilePath, { recursive: true, force: true });
  }
}

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contentScript = path.join(root, '1ststep-extension', 'content.js');

test('controlled Greenhouse adapter fills only server-authorized ordinary fields and never submits', async ({ page }) => {
  const resumeBytes = Buffer.from('%PDF-1.4\n% synthetic resume fixture\n%%EOF\n');
  const resumeDocument = {
    fieldRef: 'resume_upload', fieldKey: 'resumeDocument', documentVersion: 'resume-greenhouse-v1',
    filename: 'fixture-role-resume.pdf', contentType: 'application/pdf', bytes: resumeBytes.length,
    sha256: createHash('sha256').update(resumeBytes).digest('hex'), contentBase64: resumeBytes.toString('base64'),
  };
  await page.route('https://boards.greenhouse.io/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: `<!doctype html><html><head><title>Procurement Manager | Fixture Co</title></head><body>
      <h1 class="app-title">Procurement Manager</h1><div class="company-name">Fixture Co</div>
      <div id="app_body" class="job-description">${'Synthetic direct-employer job description. '.repeat(8)}</div>
      <form id="application">
        <label for="first_name">First name</label><input id="first_name" name="first_name" required>
        <label for="email_address">Email</label><input id="email_address" name="email" type="email" required>
        <label for="resume_upload">Resume upload</label><input id="resume_upload" name="resume" type="file" required>
        <label for="veteran_status">Veteran status</label><select id="veteran_status" name="veteran_status"><option value="">Unanswered</option><option>Prefer not to answer</option></select>
        <button id="submit" type="submit">Submit application</button>
      </form><script>window.__submitted=false;document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.__submitted=true})</script>
    </body></html>`,
  }));
  await page.addInitScript((resumeDocument) => {
    const listeners = [];
    window.__bridgeMessages = [];
    window.chrome = { runtime: {
      id: 'fixture-extension',
      onMessage: { addListener(listener) { listeners.push(listener); } },
      sendMessage(message, callback) {
        window.__bridgeMessages.push(JSON.parse(JSON.stringify(message)));
        let response = { success: true };
        if (message.action === 'PREPARE_GREENHOUSE_HANDOFF') response = { success: true, data: {
          status: 'ready-to-fill', handoffToken: 'synthetic-signed-handoff',
          matchAssessment: { schemaVersion: 1, confidenceScore: 88, classification: 'Strong Match', tailoringJustification: 'Credible interview path based on functional alignment and verified experience.', matchedEvidence: ['functional alignment', 'experience alignment'], credibleInterviewPath: true, minimumAutofillScore: 70, source: 'deterministic-verified-evidence-v1' },
          fields: [
            { fieldRef: 'first_name', fieldKey: 'firstName', value: 'Jordan' },
            { fieldRef: 'email_address', fieldKey: 'email', value: 'jordan@example.test' },
          ],
          document: { ...resumeDocument, contentBase64: undefined, available: true },
        } };
        if (message.action === 'GET_GREENHOUSE_DOCUMENT') response = { success: true, data: { status: 'document-ready', document: resumeDocument, valuesPersistedByExtension: false, submissionAuthorized: false } };
        if (message.action === 'COMPLETE_GREENHOUSE_HANDOFF') response = { success: true, data: { status: 'checkpoint-preserved', submitted: false, receiptVerified: false } };
        if (callback) queueMicrotask(() => callback(response));
        return Promise.resolve(response);
      },
      lastError: null,
    } };
    window.__sendExtensionMessage = message => new Promise(resolve => {
      const listener = listeners[listeners.length - 1];
      listener(message, {}, resolve);
    });
  }, resumeDocument);
  await page.goto('https://boards.greenhouse.io/fixtureco/jobs/123456#1ststep-session=application_fixture_12345678&1ststep-version=7');
  await page.addScriptTag({ path: contentScript });
  const review = await page.evaluate(() => window.__sendExtensionMessage({ action: 'AUTOFILL' }));
  expect(review).toMatchObject({ success: true, reviewRequired: true, filled: 0, submitted: false, matchAssessment: { confidenceScore: 88, credibleInterviewPath: true } });
  await expect(page.locator('#first_name')).toHaveValue('');
  await expect(page.locator('#email_address')).toHaveValue('');
  await expect(page.locator('#resume_upload')).toHaveValue('');
  const result = await page.evaluate(() => window.__sendExtensionMessage({ action: 'AUTOFILL', confirmPrecision: true }));
  expect(result).toMatchObject({ success: true, filled: 3, total: 3, submitted: false, receiptVerified: false });
  await expect(page.locator('#first_name')).toHaveValue('Jordan');
  await expect(page.locator('#email_address')).toHaveValue('jordan@example.test');
  await expect(page.locator('#resume_upload')).toHaveValue(/fixture-role-resume\.pdf$/);
  await expect(page.locator('#veteran_status')).toHaveValue('');
  expect(await page.evaluate(() => window.__submitted)).toBe(false);

  const messages = await page.evaluate(() => window.__bridgeMessages);
  const prepare = messages.find(message => message.action === 'PREPARE_GREENHOUSE_HANDOFF');
  const complete = messages.find(message => message.action === 'COMPLETE_GREENHOUSE_HANDOFF');
  const document = messages.find(message => message.action === 'GET_GREENHOUSE_DOCUMENT');
  expect(prepare.payload.fields.some(field => field.inputType === 'file')).toBe(true);
  expect(prepare.payload.fields.some(field => /veteran/i.test(field.label))).toBe(true);
  expect(JSON.stringify(prepare)).not.toContain('Jordan');
  expect(document.payload).toEqual({ handoffToken: 'synthetic-signed-handoff' });
  expect(complete.payload).toEqual({ handoffToken: 'synthetic-signed-handoff', filledFieldKeys: ['resumeDocument', 'firstName', 'email'], failedFieldKeys: [] });
  expect(JSON.stringify(complete)).not.toContain('jordan@example.test');
});

test('Greenhouse adapter rejects a mismatched resume before filling ordinary fields', async ({ page }) => {
  const approved = Buffer.from('%PDF-1.4\n% approved fixture\n%%EOF\n');
  const corrupted = Buffer.from('%PDF-1.4\n% changed fixture\n%%EOF\n');
  const metadata = {
    available: true, fieldRef: 'resume_upload', fieldKey: 'resumeDocument', documentVersion: 'resume-v1',
    filename: 'approved-resume.pdf', contentType: 'application/pdf', bytes: approved.length,
    sha256: createHash('sha256').update(approved).digest('hex'),
  };
  await page.route('https://boards.greenhouse.io/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: `
    <html><head><title>Buyer | Fixture Co</title></head><body><div id="app_body">${'Synthetic description. '.repeat(12)}</div>
    <input id="first_name" name="first_name" aria-label="First name"><input id="resume_upload" name="resume" type="file" aria-label="Resume upload"></body></html>` }));
  await page.addInitScript(({ metadata, corruptedBase64 }) => {
    const listeners = [];
    window.__bridgeMessages = [];
    window.chrome = { runtime: { id: 'fixture-extension', lastError: null, onMessage: { addListener(fn) { listeners.push(fn); } }, sendMessage(message, callback) {
      window.__bridgeMessages.push(JSON.parse(JSON.stringify(message)));
      let response = { success: true };
      if (message.action === 'PREPARE_GREENHOUSE_HANDOFF') response = { success: true, data: { status: 'ready-to-fill', handoffToken: 'signed', matchAssessment: { schemaVersion: 1, confidenceScore: 82, classification: 'Strong Match', tailoringJustification: 'Credible interview path based on verified experience.', matchedEvidence: ['experience alignment'], credibleInterviewPath: true, minimumAutofillScore: 70, source: 'deterministic-verified-evidence-v1' }, fields: [{ fieldRef: 'first_name', fieldKey: 'firstName', value: 'Jordan' }], document: metadata } };
      if (message.action === 'GET_GREENHOUSE_DOCUMENT') response = { success: true, data: { document: { ...metadata, available: undefined, contentBase64: corruptedBase64 } } };
      if (message.action === 'COMPLETE_GREENHOUSE_HANDOFF') response = { success: false, error: 'The partial fill was preserved.' };
      if (callback) queueMicrotask(() => callback(response));
      return Promise.resolve(response);
    } } };
    window.__sendExtensionMessage = message => new Promise(resolve => listeners[listeners.length - 1](message, {}, resolve));
  }, { metadata, corruptedBase64: corrupted.toString('base64') });
  await page.goto('https://boards.greenhouse.io/fixtureco/jobs/123456#1ststep-session=application_fixture_12345678&1ststep-version=7');
  await page.addScriptTag({ path: contentScript });
  const review = await page.evaluate(() => window.__sendExtensionMessage({ action: 'AUTOFILL' }));
  expect(review.reviewRequired).toBe(true);
  await expect(page.locator('#first_name')).toHaveValue('');
  const result = await page.evaluate(() => window.__sendExtensionMessage({ action: 'AUTOFILL', confirmPrecision: true }));
  expect(result.success).toBe(false);
  await expect(page.locator('#first_name')).toHaveValue('');
  await expect(page.locator('#resume_upload')).toHaveValue('');
  const complete = (await page.evaluate(() => window.__bridgeMessages)).find(message => message.action === 'COMPLETE_GREENHOUSE_HANDOFF');
  expect(complete.payload).toEqual({ handoffToken: 'signed', filledFieldKeys: [], failedFieldKeys: ['resumeDocument'] });
});

test('Greenhouse adapter refuses pages not opened from a durable 1stStep application', async ({ page }) => {
  await page.route('https://boards.greenhouse.io/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<input id="email" name="email" type="email" aria-label="Email">' }));
  await page.addInitScript(() => {
    const listeners = [];
    window.chrome = { runtime: { id: 'fixture-extension', lastError: null, onMessage: { addListener(fn) { listeners.push(fn); } }, sendMessage() { return Promise.resolve({ success: true }); } } };
    window.__sendExtensionMessage = message => new Promise(resolve => listeners[listeners.length - 1](message, {}, resolve));
  });
  await page.goto('https://boards.greenhouse.io/fixtureco/jobs/123456');
  await page.addScriptTag({ path: contentScript });
  const result = await page.evaluate(() => window.__sendExtensionMessage({ action: 'AUTOFILL' }));
  expect(result.success).toBe(false);
  expect(result.error).toContain('saved 1stStep application workspace');
  await expect(page.locator('#email')).toHaveValue('');
});

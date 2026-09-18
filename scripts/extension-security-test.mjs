import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = ['content.js', 'job-capture.js', 'background.js', 'auth-bridge.js', 'popup.js', 'popup.html', 'manifest.json'];
const files = Object.fromEntries(await Promise.all(paths.map(async path => [path, await readFile(new URL(`../1ststep-extension/${path}`, import.meta.url), 'utf8')])));
const combined = Object.values(files).join('\n');
const manifest = JSON.parse(files['manifest.json']);

assert.match(files['content.js'], /BLOCKED_AUTOFILL_FIELD/);
for (const requiredBlock of ['social security', 'captcha', 'signature', 'disability', 'outside employment', 'export control', 'security clearance', 'criminal', 'referral', 'salary acceptance']) {
  assert.ok(files['content.js'].toLowerCase().includes(requiredBlock), `autofill must block ${requiredBlock}`);
}
assert.match(files['content.js'], /PREPARE_GREENHOUSE_HANDOFF/);
assert.match(files['content.js'], /GET_GREENHOUSE_DOCUMENT/);
assert.match(files['content.js'], /COMPLETE_GREENHOUSE_HANDOFF/);
assert.match(files['content.js'], /crypto\.subtle\.digest\('SHA-256'/);
assert.match(files['content.js'], /new DataTransfer\(\)/);
assert.match(files['content.js'], /bytes\.fill\(0\)/);
assert.match(files['content.js'], /submitted: false, receiptVerified: false/);
assert.doesNotMatch(combined, /1ststep_profile|1ststep_resume|GET_AUTOFILL_MAP|autofillContext|tierToken/);
assert.doesNotMatch(files['background.js'], /api\/claude|api\/subscription|TRACK_EVENT|track-event/);
assert.doesNotMatch(files['auth-bridge.js'], /localStorage|storage\.sync/);
assert.match(files['auth-bridge.js'], /credentials: 'include'/);
assert.match(files['auth-bridge.js'], /\/api\/extension-application-handoff/);
assert.match(files['auth-bridge.js'], /\['prepare', 'document', 'complete'\]/);
assert.doesNotMatch(files['background.js'], /chrome\.storage\.(?:local|session)\.set\([^\n]*(?:document|contentBase64|resumeDocument)/);
// -- Job capture destination and durable acknowledgement --------------------
const conciergeJs = await readFile(new URL('../concierge.js', import.meta.url), 'utf8');
assert.match(files['background.js'], /\$\{APP_URL\}\/concierge\?jobCaptureId=/,
  'job capture must open the Job Agent');
assert.match(files['auth-bridge.js'], /type: '1STSTEP_JOB_CAPTURE'/,
  'auth-bridge must still post the capture contract message');
assert.match(conciergeJs, /event\.data\?\.type !== '1STSTEP_JOB_CAPTURE'/,
  'concierge.js must listen for the capture contract message');
assert.match(conciergeJs, /campaignSync\.status !== 'synced'/,
  'the Job Agent must not acknowledge before secure persistence succeeds');
assert.ok(conciergeJs.indexOf("campaignSync.status !== 'synced'") < conciergeJs.indexOf('acknowledgeExtensionCapture(capture.captureId)'),
  'secure persistence must be checked before acknowledgement');

assert.deepEqual(manifest.host_permissions.sort(), ['https://*.greenhouse.io/*', 'https://app.1ststep.ai/*'].sort());
assert.equal(manifest.content_scripts[0].all_frames, false);
assert.equal('web_accessible_resources' in manifest, false);
assert.equal(manifest.description.toLowerCase().includes('greenhouse'), false);
assert.equal(manifest.permissions.includes('activeTab'), true);
assert.equal(manifest.permissions.includes('scripting'), true);
assert.equal(manifest.permissions.includes('tabs'), false);
assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
assert.match(files['job-capture.js'], /CAPTURE_JOB_PAGE/);
assert.doesNotMatch(files['job-capture.js'], /querySelectorAll\([^)]*(?:input|textarea|select)|document\.forms|localStorage|sessionStorage|document\.cookie/i,
  'job capture must not read user-entered form values or browser storage');

assert.match(files['content.js'], /sendResponse\(\{ success: true, reviewRequired: true, matchAssessment, filled: 0, submitted: false/);
assert.ok(files['content.js'].indexOf('reviewRequired: true') < files['content.js'].indexOf('if (await fillApprovedResume'), 'match review must happen before document or ordinary-field mutation');
assert.match(files['content.js'], /confirmPrecision: true|msg\.confirmPrecision === true/);
assert.match(files['popup.js'], /btn\.dataset\.precisionReviewed = 'true'/);
assert.match(files['popup.html'], /Review &amp; fill application/);

console.log('Controlled extension captures only user-invoked job content, uses transient server-authorized values and integrity-checked resume bytes for supported fill, stores no raw profile or document data, keeps narrow persistent hosts, and never submits.');

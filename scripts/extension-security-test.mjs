import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = ['content.js', 'generic-capture.js', 'background.js', 'auth-bridge.js', 'popup.js', 'popup.html', 'manifest.json'];
const files = Object.fromEntries(await Promise.all(paths.map(async path => [path, await readFile(new URL(`../1ststep-extension/${path}`, import.meta.url), 'utf8')])));
const combined = Object.values(files).join('\n');
const manifest = JSON.parse(files['manifest.json']);

assert.match(files['content.js'], /BLOCKED_AUTOFILL_FIELD/);
for (const requiredBlock of ['social security', 'captcha', 'signature', 'disability', 'outside employment', 'export control', 'security clearance', 'criminal', 'referral', 'salary acceptance']) {
  assert.ok(files['content.js'].toLowerCase().includes(requiredBlock), `autofill must block ${requiredBlock}`);
}
assert.match(files['content.js'], /PREPARE_GREENHOUSE_HANDOFF/);
assert.match(files['content.js'], /MutationObserver/);
assert.match(files['content.js'], /source\.length > 2_000_000/,
  'Greenhouse embedded data parsing must remain bounded');
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
assert.match(files['auth-bridge.js'], /SYNC_JOB_AGENT_STATUS/);
assert.match(files['background.js'], /JOB_AGENT_STATUS_CACHE_TTL_MS = 5 \* 60 \* 1000/);
assert.match(files['background.js'], /sender\?\.url[\s\S]*APP_URL/,
  'only a 1stStep app page may update the short-lived capability cache');
const capabilityCacheSource = files['background.js'].slice(
  files['background.js'].indexOf('function compactJobAgentCapabilities'),
  files['background.js'].indexOf('function relayToTab'),
);
assert.doesNotMatch(capabilityCacheSource, /(?:email|subject|resume|document)/i,
  'the capability cache must not retain identity or application content');
assert.doesNotMatch(files['background.js'], /chrome\.storage\.(?:local|session)\.set\([^\n]*(?:document|contentBase64|resumeDocument)/);
assert.match(files['popup.js'], /CAPTURE_ACTIVE_TAB/,
  'popup capture must delegate to the single user-triggered capture path');
assert.match(files['background.js'], /chrome\.scripting\.executeScript/,
  'generic capture must run only after the user opens the popup or chooses a context-menu action');
assert.match(files['background.js'], /files: \['generic-capture\.js'\]/);
assert.match(files['background.js'], /allFrames: true/,
  'user-triggered capture must inspect accessible job frames without permanent host access');
assert.match(files['background.js'], /allFrames: false/,
  'protected frames must fall back to the selected top-level page');
assert.match(files['background.js'], /CONTEXT_MENU_RESUME/);
assert.match(files['background.js'], /CONTEXT_MENU_AGENT/);
assert.match(files['background.js'], /setBadgeText\(\{ tabId, text: job \? 'JOB' : '\?' \}\)/,
  'explicit capture must leave a visible per-tab capability result');
assert.match(files['popup.js'], /JOB_AGENT_APP_BRIDGE_UNAVAILABLE[\s\S]*Reconnect Agent/,
  'a stale app bridge must be shown as a reconnect problem, not silently downgraded to Resume Tools');
assert.match(files['popup.html'], /id="agentConnectionHint"[\s\S]*aria-live="polite"/,
  'the reconnect instruction must be announced accessibly');
assert.match(files['generic-capture.js'], /application\/ld\+json/);
for (const ats of ['workday', 'lever', 'ashby', 'smartrecruiters']) {
  assert.match(files['generic-capture.js'], new RegExp(`id: '${ats}'`), `generic capture must include the ${ats} adapter`);
}
assert.match(files['generic-capture.js'], /window\.getSelection/,
  'highlighted text must provide a no-copy-paste fallback');
assert.match(files['generic-capture.js'], /jobDescription\.length < 120/,
  'generic capture must reject pages without a meaningful visible description');
assert.doesNotMatch(files['generic-capture.js'], /fetch\(|XMLHttpRequest|chrome\.storage/,
  'generic capture must only inspect the selected page and return data to the popup');
// -- Job capture destination (regression guard) -----------------------------
// /app serves the Job Agent since 2026-09-04. Captured jobs must open the
// legacy workspace at /app/resume, because that is where the
// 1STSTEP_JOB_CAPTURE listener lives. auth-bridge.js deletes the pending job
// from chrome.storage as it delivers, so a wrong destination loses the capture
// silently instead of failing loudly. These three assertions pin the whole
// chain: background opens the route -> auth-bridge posts -> app.js receives.
const appJs = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const conciergeJs = await readFile(new URL('../concierge.js', import.meta.url), 'utf8');
assert.match(files['background.js'], /\$\{APP_URL\}\/app\/resume\?jobCaptureId=/,
  'job capture must open /app/resume');
assert.doesNotMatch(files['background.js'], /\$\{APP_URL\}\/app\?jobCaptureId=/,
  'job capture must not open /app, which now serves the Job Agent');
assert.match(files['auth-bridge.js'], /type: '1STSTEP_JOB_CAPTURE'/,
  'auth-bridge must still post the capture contract message');
assert.match(appJs, /event\.data\.type !== '1STSTEP_JOB_CAPTURE'/,
  'app.js must still listen for the capture contract message');
assert.match(appJs, /Nothing is generated until you click Tailor My Resume/,
  'Resume Builder must tell the user that capture does not start AI generation');
assert.doesNotMatch(appJs, /function showJobCaptureConfirm[\s\S]{0,1800}runTailoring\(/,
  'showing a captured job must never spend a credit or start tailoring');
assert.match(appJs, /jobTitle: _srcJob\?\.title \|\| window\._capturedJob\?\.title \|\| kwData\?\.job_title/,
  'tracker history must prefer the verified captured role over a generic model label');
assert.match(appJs, /const tailoredMatchPct = calcMatchScore\(atsClean, jobDesc\)/,
  'saved match scores must be deterministically calculated from the generated resume');
assert.doesNotMatch(appJs, /matchPct: gapData\?\.match_score_after_estimate - clientMatchPct/,
  'tracker match score must not be a subtraction of unrelated percentages');
assert.match(files['background.js'], /\$\{APP_URL\}\/concierge\?jobCaptureId=\$\{jobCaptureId\}&mode=\$\{mode\}/,
  'Job Agent review must open the concierge receiver with the exact capture id');
assert.match(conciergeJs, /event\.data\.type !== '1STSTEP_JOB_CAPTURE'/,
  'concierge must receive explicitly selected Job Agent captures');
assert.match(conciergeJs, /event\.source !== window \|\| event\.origin !== window\.location\.origin/,
  'concierge capture acknowledgements must be same-document and same-origin');
assert.match(conciergeJs, /sourceType: 'user-captured'/,
  'captured jobs must remain visibly distinct from verified employer listings');
assert.match(conciergeJs, /applyPathActive: false/,
  'a generic capture must never claim that the employer Apply path was verified');
assert.match(conciergeJs, /Job already saved; duplicate suppressed/,
  'a repeated capture must report duplicate suppression instead of claiming it was newly added');

assert.deepEqual(manifest.host_permissions.sort(), ['https://*.greenhouse.io/*', 'https://app.1ststep.ai/*'].sort());
assert.equal(manifest.permissions.includes('scripting'), true);
assert.equal(manifest.permissions.includes('contextMenus'), true);
assert.equal(manifest.permissions.includes('cookies'), false);
assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
assert.equal(manifest.content_scripts[0].all_frames, false);
assert.equal('web_accessible_resources' in manifest, false);
assert.equal(manifest.description.toLowerCase().includes('greenhouse'), true);

assert.match(files['content.js'], /sendResponse\(\{ success: true, reviewRequired: true, matchAssessment, filled: 0, submitted: false/);
assert.ok(files['content.js'].indexOf('reviewRequired: true') < files['content.js'].indexOf('if (await fillApprovedResume'), 'match review must happen before document or ordinary-field mutation');
assert.match(files['content.js'], /confirmPrecision: true|msg\.confirmPrecision === true/);
assert.match(files['popup.js'], /btn\.dataset\.precisionReviewed = 'true'/);
assert.match(files['popup.html'], /Review match &amp; fill/);
assert.match(files['popup.html'], /id="fillResult"[\s\S]*aria-live="polite"/);
assert.match(files['content.js'], /data-firststep-needs-review/);
assert.match(files['content.js'], /Nothing was submitted/);

console.log('Controlled Greenhouse extension uses transient server-authorized values and integrity-checked resume bytes, requires match evidence and explicit review before fill, stores no raw profile or document data, performs no AI field guessing, keeps narrow hosts, and never submits.');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = ['content.js', 'background.js', 'auth-bridge.js', 'popup.js', 'manifest.json'];
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
assert.deepEqual(manifest.host_permissions.sort(), ['https://*.greenhouse.io/*', 'https://app.1ststep.ai/*'].sort());
assert.equal(manifest.content_scripts[0].all_frames, false);
assert.equal('web_accessible_resources' in manifest, false);
assert.equal(manifest.description.toLowerCase().includes('greenhouse'), true);

console.log('Controlled Greenhouse extension uses transient server-authorized values and integrity-checked resume bytes, no raw profile or document storage, no AI field guessing, no local Applied state, narrow hosts, and no-submit completion.');

// Guards the privacy policy against the code it describes. A policy that drifts from
// the shipped manifest or the real retention window is a Chrome Web Store rejection and
// a false statement to users, so both are asserted here rather than reviewed by eye.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [policy, manifestSource, storeSource, justifications, listing] = await Promise.all([
  read('privacy.html'),
  read('1ststep-extension/manifest.json'),
  read('lib/captured-job-store.js'),
  read('1ststep-extension/PERMISSION_JUSTIFICATIONS.md'),
  read('1ststep-extension/STORE_LISTING.md'),
]);
const manifest = JSON.parse(manifestSource);

// The policy's permission table must list exactly the permissions the manifest requests.
// Extra rows promise oversight of capabilities that do not exist; missing rows are undisclosed access.
const tableStart = policy.indexOf('<strong>Permissions used.</strong>');
assert.ok(tableStart > 0, 'privacy.html must keep the extension permissions table');
const table = policy.slice(tableStart, policy.indexOf('</table>', tableStart));
const documented = [...table.matchAll(/<td><strong>([^<]+)<\/strong><\/td>/g)].map(match => match[1].trim());
const declared = [...manifest.permissions].sort();
const listed = documented.filter(name => name !== 'Declared site access').sort();
assert.deepEqual(listed, declared,
  `permissions table must match manifest.json exactly (documented: ${listed}, manifest: ${declared})`);
assert.ok(documented.includes('Declared site access'),
  'permissions table must explain the manifest host permissions, not just the API permissions');

// Every host the extension is granted in advance has to be named in the policy.
for (const host of manifest.host_permissions || []) {
  const domain = host.replace(/^https:\/\/(\*\.)?/, '').replace(/\/\*$/, '');
  assert.ok(policy.includes(domain), `privacy.html must disclose the declared host ${domain}`);
}

// Retention: every "N days" claim made in a sentence about captures must be the real TTL.
const ttlMatch = storeSource.match(/TTL_SECONDS\s*=\s*(\d+)\s*\*\s*24\s*\*\s*60\s*\*\s*60/);
assert.ok(ttlMatch, 'captured-job-store.js must express TTL_SECONDS as a day count');
const ttlDays = Number(ttlMatch[1]);
const blocks = [...policy.matchAll(/<(p|li|td)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(match => match[2]);
const captureBlocks = blocks.filter(block => /captur/i.test(block));
assert.ok(captureBlocks.length >= 3, 'privacy.html must still describe capture handling');
for (const block of captureBlocks) {
  for (const [, days] of block.matchAll(/(\d+)\s*days/g)) {
    assert.equal(Number(days), ttlDays,
      `capture retention in privacy.html says ${days} days but TTL_SECONDS is ${ttlDays} days`);
  }
}
assert.ok(captureBlocks.some(block => new RegExp(`${ttlDays}\\s*days`).test(block)),
  'privacy.html must state the captured-job retention window');

// Regression guard: captures became durable server-side records in v1.6. The policy must
// not go back to describing them as a transient browser-only handoff.
assert.doesNotMatch(policy, /captured job awaiting delivery[\s\S]{0,120}short-lived/i,
  'captures are durable server-side records; do not describe them as short-lived handoffs');
assert.match(policy, /saved to your account as a durable record/i,
  'privacy.html must disclose that captured jobs are stored server-side');

// The store listing and the permission justifications are read by the same reviewer as the
// policy, so they must tell the same retention story rather than a stale one.
for (const [name, doc] of [['PERMISSION_JUSTIFICATIONS.md', justifications], ['STORE_LISTING.md', listing]]) {
  const relevant = doc.split('\n').filter(line => /captur|jobs? you save|saved jobs?/i.test(line));
  assert.ok(relevant.length > 0, `${name} must describe how captured jobs are handled`);
  for (const line of relevant) {
    for (const [, days] of line.matchAll(/(\d+)\s*days/g)) {
      assert.equal(Number(days), ttlDays, `${name} says ${days} days but TTL_SECONDS is ${ttlDays} days`);
    }
  }
  assert.ok(new RegExp(`${ttlDays}\\s*days`).test(doc), `${name} must state the ${ttlDays}-day capture retention window`);
}

console.log(`Privacy policy drift tests passed (${declared.length} permissions, ${ttlDays}-day capture retention, 3 documents).`);

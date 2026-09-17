import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JOB_AGENT_OWNER_REVIEWED_POLICY_PIN, ownerReviewedBundleMatchesPin } from '../lib/job-agent-owner-reviewed-policy.js';
import { JOB_AGENT_POLICY_STATIC_DOCUMENTS } from '../lib/job-agent-policy-bundle.js';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const [name, expected] of Object.entries(JOB_AGENT_POLICY_STATIC_DOCUMENTS)) {
  const bytes = await readFile(`${root}${name}.html`);
  const actual = createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual, expected.sha256, `${name}.html changed. Update the owner-reviewed policy pin and checked-in digest together. Do not set JOB_AGENT_COUNSEL_APPROVED.`);
}

assert.equal(JOB_AGENT_POLICY_STATIC_DOCUMENTS.terms.sha256, JOB_AGENT_OWNER_REVIEWED_POLICY_PIN.termsSha256);
assert.equal(JOB_AGENT_POLICY_STATIC_DOCUMENTS.privacy.sha256, JOB_AGENT_OWNER_REVIEWED_POLICY_PIN.privacySha256);
assert.equal(ownerReviewedBundleMatchesPin(), true);

console.log('Checked-in Job Agent Terms and Privacy document digests verified.');

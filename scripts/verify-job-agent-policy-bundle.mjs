import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JOB_AGENT_POLICY_STATIC_DOCUMENTS } from '../lib/job-agent-policy-bundle.js';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const [name, expected] of Object.entries(JOB_AGENT_POLICY_STATIC_DOCUMENTS)) {
  const bytes = await readFile(`${root}${name}.html`);
  const actual = createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual, expected.sha256, `${name}.html changed. Have counsel review it, update its policy version, then intentionally update the checked-in digest.`);
}

console.log('Checked-in Job Agent Terms and Privacy document digests verified.');

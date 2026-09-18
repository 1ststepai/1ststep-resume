import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = [
  readFileSync(new URL('../concierge.js', import.meta.url), 'utf8'),
  readFileSync(new URL('../client/concierge-router.js', import.meta.url), 'utf8'),
].join('\n');
assert.ok(source.includes('discoveryNextStep'));
assert.ok(source.includes("prompt: 'Show my jobs'"));
assert.ok(source.includes("prompt: 'Try a different job type'"));
assert.ok(source.includes('Imported “applied” labels are not treated as receipts.'));
assert.ok(!source.includes('duplicates were suppressed'));
assert.ok(!source.includes('These roles are Found—not Submitted'));
assert.ok(!source.includes('Employer-feed screening'));
console.log('PASS: narration keeps next-step actions without screening jargon');

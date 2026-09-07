import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const origin = String(process.env.APPLICATION_VOLUME_COPY_ORIGIN || '').replace(/\/$/, '');
for (const [path, expected, prohibited] of [
  ['/pricing.html', 'Does Job Agent guarantee a number of applications?', 'lower than your target'],
  ['/concierge.html', 'Results vary with your criteria and available openings.', 'Daily target (not a guarantee)'],
  ['/concierge.js', 'Verified fit and your observed outcomes matter more than application volume.', 'Daily target set to'],
]) {
  let content;
  if (origin) {
    const response = await fetch(origin + path, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200);
    content = await response.text();
  } else {
    content = await readFile(fileURLToPath(new URL(`..${path}`, import.meta.url)), 'utf8');
  }
  assert.ok(content.includes(expected), `${path}: ${origin ? 'hosted' : 'candidate'} copy missing`);
  assert.ok(!content.includes(prohibited), `${path}: obsolete subscriber quota copy remains`);
}
console.log(`${origin ? 'Hosted' : 'Candidate'} truthful variable-volume copy and removal of subscriber quota controls verified.`);

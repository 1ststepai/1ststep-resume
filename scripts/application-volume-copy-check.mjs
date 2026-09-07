import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const origin = String(process.env.APPLICATION_VOLUME_COPY_ORIGIN || '').replace(/\/$/, '');
for (const [path, expected] of [
  ['/pricing.html', 'Does Job Agent guarantee a number of applications?'],
  ['/concierge.html', 'including zero when no suitable openings are found'],
  ['/concierge.js', 'This is not a promised number of applications.'],
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
}
console.log(`${origin ? 'Hosted' : 'Candidate'} pricing FAQ, dashboard explanation and target confirmation verified.`);

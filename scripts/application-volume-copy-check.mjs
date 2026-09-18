import assert from 'node:assert/strict';
const origin = 'https://app.1ststep.ai';
for (const [path, expected] of [
  ['/pricing.html', 'Does Job Agent guarantee a number of applications?'],
  ['/concierge.html', 'including zero when no suitable openings are found'],
  ['/concierge.js', 'This is not a promised number of applications.'],
]) {
  const response = await fetch(origin + path, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes(expected), `${path}: live copy missing`);
}
console.log('Production pricing FAQ, dashboard explanation and target confirmation verified.');

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

for (const relative of ['../partner.html', '../partner.js', '../partner.css']) {
  assert.equal(existsSync(new URL(relative, import.meta.url)), true, `${relative} must exist.`);
}

const [html, script, styles, landing, build, vercel, concierge] = await Promise.all([
  readFile(new URL('../partner.html', import.meta.url), 'utf8'),
  readFile(new URL('../partner.js', import.meta.url), 'utf8'),
  readFile(new URL('../partner.css', import.meta.url), 'utf8'),
  readFile(new URL('../partners-landing/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../build-public-web.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
  readFile(new URL('../concierge.js', import.meta.url), 'utf8'),
]);

assert.match(landing, /Sign in with your 1stStep account/);
assert.match(landing, /Apply as an affiliate[^<]*no Job Agent account required/i);
assert.match(landing, /returnTo=%2Fpartner%3Fpath%3Dexisting-user/);
assert.match(landing, /returnTo=%2Fpartner%3Fpath%3Daffiliate-only/);
assert.doesNotMatch(landing, /id="savePartnerBtn"|id="partnerEmail"/);

assert.match(html, /id="application"/);
assert.match(html, /id="status"/);
assert.match(html, /pending|approved|rejected/);
assert.match(html, /Affiliate access does not create a Job Agent profile, résumé, My Jobs data, or Job Agent entitlement/);
assert.match(script, /fetch\('\/api\/partner'/);
assert.match(script, /https:\/\/app\.1ststep\.ai\/app\?ref=/);
assert.match(script, /\['pending', 'approved', 'rejected'\]/);
assert.doesNotMatch(script, /localStorage|sessionStorage|innerHTML/);
assert.match(styles, /min-height:\s*44px/);
assert.match(styles, /padding-(?:top|bottom):\s*env\(safe-area-inset-/);
assert.match(styles, /overflow-x:\s*hidden/);
assert.match(styles, /@media\s*\(max-width:/);
assert.match(build, /'partner\.html'/);
assert.match(vercel, /"source": "\/partner"/);
assert.match(vercel, /api\/partner\.js/);
assert.match(concierge, /\/api\/partner\?action=attribute/);
assert.match(concierge, /recordPartnerReferralAttribution\(\)/);

console.log('Partner surface tests passed: explicit role paths, honest states, isolated browser behavior, and mobile-safe layout.');

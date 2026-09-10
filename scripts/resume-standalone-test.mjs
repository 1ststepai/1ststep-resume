import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../resume-tailor-landing/standalone/', import.meta.url);
const [html, config, robots, sitemap] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('vercel.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('robots.txt', root), 'utf8'),
  readFile(new URL('sitemap.xml', root), 'utf8'),
]);

assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.match(html, /Tailor your résumé and cover letter\./);
assert.match(html, /Start an ongoing Job Agent search/);
assert.match(html, /Start free\. No card required\. You review before anything is sent\./);
assert.match(html, /<link rel="canonical" href="https:\/\/resume\.1ststep\.ai\/">/);
assert.match(html, /Verified founder test · August 24, 2026/);
assert.match(html, /LogicSource interview invitation received August 24/);
assert.match(html, /Aug 25 · 1:00–1:30 PM/);
assert.match(html, /Estimated time saved/);
assert.match(html, /Estimate based on completed steps/);
assert.match(html, /https:\/\/www\.youtube\.com\/shorts\/5WCJcfwF5Q8/);
assert.doesNotMatch(html, /1ststepdotai|professornode|swingtradepros/i);
assert.doesNotMatch(html, /leadconnector|msgsndr|highlevel|ghl-/i);

const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));
for (const name of ['Strict-Transport-Security', 'Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
  assert.ok(headers[name], `${name} must be present`);
}
assert.match(robots, /Allow: \//);
assert.match(sitemap, /https:\/\/resume\.1ststep\.ai\//);

console.log('PASS: standalone resume page identity, proof, SEO, and security contracts.');

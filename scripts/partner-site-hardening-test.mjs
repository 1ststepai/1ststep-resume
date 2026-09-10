import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../partners-landing/', import.meta.url);
const [html, config, robots, sitemap, llms] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('vercel.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('robots.txt', root), 'utf8'),
  readFile(new URL('sitemap.xml', root), 'utf8'),
  readFile(new URL('llms.txt', root), 'utf8'),
]);
const stylesheetPath = html.match(/href="(\/assets\/partner-[a-f0-9]{12}\.css)"/)?.[1];
assert.ok(stylesheetPath, 'Partner page must use a content-hashed stylesheet');
const stylesheet = await readFile(new URL(`.${stylesheetPath}`, root), 'utf8');
assert.equal(stylesheetPath.match(/partner-([a-f0-9]{12})\.css/)?.[1], createHash('sha256').update(stylesheet.replaceAll('\r\n', '\n')).digest('hex').slice(0, 12));
assert.match(stylesheet, /--muted:\s*#62677f/);
assert.match(stylesheet, /--green:\s*#147d5a/);
assert.match(stylesheet, /\.footer-inner \.brand-dot\s*\{\s*color:\s*#7c72f2/);

assert.match(html, /<link rel="canonical" href="https:\/\/partners\.1ststep\.ai\/">/);
assert.match(html, /property="og:image" content="https:\/\/partners\.1ststep\.ai\/assets\/og-partners-[a-f0-9]{12}\.png"/);
assert.match(html, /type="application\/ld\+json"/);
assert.doesNotMatch(html, /<style>|<script>(?!\s*\{)/);

const assetUrls = [...html.matchAll(/(?:href|src|content)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
for (const assetUrl of new Set(assetUrls)) {
  await readFile(new URL(`.${assetUrl}`, root));
}

const globalHeaders = Object.fromEntries(config.headers.find((rule) => rule.source === '/(.*)').headers.map(({ key, value }) => [key, value]));
for (const name of ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security']) {
  assert.ok(globalHeaders[name], `${name} must be configured`);
}
assert.match(globalHeaders['Content-Security-Policy'], /frame-ancestors 'none'/);
assert.doesNotMatch(globalHeaders['Content-Security-Policy'], /unsafe-inline|https:\/\//);

const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
assert.ok(jsonLd, 'JSON-LD block must exist');
JSON.parse(jsonLd);
const hash = createHash('sha256').update(jsonLd).digest('base64');
assert.match(globalHeaders['Content-Security-Policy'], new RegExp(`sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

assert.match(robots, /Sitemap: https:\/\/partners\.1ststep\.ai\/sitemap\.xml/);
assert.match(sitemap, /<loc>https:\/\/partners\.1ststep\.ai\/<\/loc>/);
assert.match(llms, /Beta signups may be attributed, but they do not accrue commission/);

console.log('PASS: partner security, social, crawl, and AEO contracts.');

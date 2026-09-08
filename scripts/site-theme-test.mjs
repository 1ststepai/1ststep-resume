import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../site-theme.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../site-theme.css', import.meta.url), 'utf8');
const pages = ['index.html', 'concierge.html', 'pricing.html', 'login.html', 'admin.html'];
const values = new Map();
const events = {};
const button = {
  events: {}, attributes: {}, innerHTML: '', title: '',
  addEventListener(name, handler) { this.events[name] = handler; },
  setAttribute(name, value) { this.attributes[name] = value; },
};
const meta = { content: '' };
const documentElement = { dataset: {}, style: {} };
const document = {
  readyState: 'complete', documentElement,
  querySelectorAll(selector) {
    if (selector === '[data-theme-toggle]') return [button];
    if (selector === 'meta[name="theme-color"]') return [meta];
    return [];
  },
  body: { appendChild() {} },
};
const localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
const window = { addEventListener(name, handler) { events[name] = handler; } };
vm.runInNewContext(source, { document, window, localStorage });
assert.equal(documentElement.dataset.theme, 'light');
assert.match(button.attributes['aria-label'], /dark theme/);
button.events.click();
assert.equal(documentElement.dataset.theme, 'dark');
assert.equal(values.get('1ststep_theme'), 'dark');
assert.match(button.attributes['aria-label'], /light theme/);
assert.match(button.innerHTML, /<svg/);
assert.doesNotMatch(button.innerHTML, /🌙|☀|🌞/u);

for (const page of pages) {
  const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
  assert.match(html, /site-theme\.js/, `${page} must initialize the shared theme before rendering`);
  assert.match(html, /site-theme\.css/, `${page} must load the shared theme styles`);
}
assert.match(readFileSync(new URL('../app.js', import.meta.url), 'utf8'), /1ststep_theme/);
assert.match(css, /html\[data-theme="dark"\]/);
assert.match(css, /body\[data-page="concierge"\]/);
assert.match(css, /prefers-reduced-motion:reduce/);
console.log('PASS: shared light/dark theme persists, stays accessible, and covers marketing, Job Agent, pricing, login, and admin pages.');

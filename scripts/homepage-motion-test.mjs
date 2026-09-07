import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../home.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../home.css', import.meta.url), 'utf8');
function element() {
  const values = new Set();
  return { dataset: {}, textContent: '', events: {}, attributes: {}, classList: {
    add: key => values.add(key), remove: key => values.delete(key),
    contains: key => values.has(key), toggle(key, on) { if (on) values.add(key); else values.delete(key); }
  }, addEventListener(name, fn) { this.events[name] = fn; }, setAttribute(name, value) { this.attributes[name] = value; } };
}
const scene = element();
const items = [element(), element(), element()];
const ids = Object.fromEntries(['runSteps','motionToggle','demoHeadline','demoDocument','demoDetail','demoStatus'].map(id => [id, element()]));
ids.runSteps.closest = () => scene;
ids.runSteps.querySelectorAll = () => items;
const query = { matches: false, addEventListener(name, fn) { this.change = fn; } };
const timers = new Map();
const events = {};
let nextTimer = 0;
let intersection;
const document = { readyState: 'complete', hidden: false,
  getElementById: id => ids[id] || null,
  querySelectorAll: selector => selector === '[data-motion-scene]' ? [scene] : [],
  addEventListener(name, fn) { events[name] = fn; }
};
function IntersectionObserver(fn) { intersection = fn; this.observe = () => {}; }
const window = { matchMedia: () => query, IntersectionObserver,
  setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
  clearTimeout(id) { timers.delete(id); }, addEventListener() {} };
vm.runInNewContext(source, { window, document, IntersectionObserver, Set, Date });
assert.equal(timers.size, 0, 'Offscreen demo must not schedule work');
intersection([{ target: scene, isIntersecting: true }]);
assert.equal(timers.size, 1);
const advance = [...timers.values()][0];
advance();
assert.equal(ids.runSteps.dataset.demoStep, '1');
assert.match(ids.demoStatus.textContent, /not sent/);
ids.motionToggle.events.click();
assert.equal(timers.size, 0, 'Pause clears pending timer');
assert.equal(scene.classList.contains('motion-running'), false);
assert.equal(ids.motionToggle.attributes['aria-pressed'], 'true');
ids.motionToggle.events.click();
document.hidden = true;
events.visibilitychange();
assert.equal(timers.size, 0, 'Hidden tab must stop');
document.hidden = false;
events.visibilitychange();
assert.equal(timers.size, 1);
query.matches = true;
query.change();
assert.equal(timers.size, 0, 'Live reduced-motion preference must stop');
assert.equal(ids.motionToggle.disabled, true);
query.matches = false;
query.change();
intersection([{ target: scene, isIntersecting: false }]);
assert.equal(timers.size, 0, 'Scrolling away must stop');
assert.match(html, /Fictional data\. Not a live search\./);
assert.match(html, /Nothing will be sent until you approve this application\./);
assert.match(html, /data-chrome-web-store-url/);
assert.match(html, /mailto:evan@1ststep.ai/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest/);
console.log('PASS: homepage motion lifecycle, pause, offscreen, hidden tab, reduced motion, safety labels and preserved links.');

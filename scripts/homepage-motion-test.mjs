import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../home-motion.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../home-motion.css', import.meta.url), 'utf8');
function element() {
  const values = new Set();
  return { dataset: {}, textContent: '', events: {}, attributes: {}, inert: false, style: { values: {}, setProperty(name, value) { this.values[name] = value; } }, classList: {
    add: key => values.add(key), remove: key => values.delete(key),
    contains: key => values.has(key), toggle(key, on) { if (on) values.add(key); else values.delete(key); }
  }, addEventListener(name, fn) { this.events[name] = fn; }, setAttribute(name, value) { this.attributes[name] = value; } };
}
const scene = element();
const items = [element(), element(), element()];
const buttons = [element(), element(), element()];
buttons.forEach((button, i) => { button.dataset.previewStep = String(i); });
const ids = Object.fromEntries(['runSteps','motionToggle','featureMotionToggle','motionExplanation','demoHeadline','demoDocument','demoDetail','demoStatus'].map(id => [id, element()]));
const journey = element();
const journeyCards = [element(), element(), element(), element()];
const journeyButtons = [element(), element(), element(), element()];
journeyButtons.forEach((button, i) => { button.dataset.chapterButton = String(i); });
journey.querySelectorAll = selector => selector === '[data-chapter-button]' ? journeyButtons : journeyCards;
ids.outcomeJourney = journey;
ids.runSteps.closest = () => scene;
ids.runSteps.querySelectorAll = selector => selector === '[data-preview-step]' ? buttons : items;
const query = { matches: false, addEventListener(name, fn) { this.change = fn; } };
const timers = new Map();
const events = {};
let nextTimer = 0;
let intersection;
const document = { readyState: 'complete', hidden: false, documentElement: element(),
  getElementById: id => ids[id] || null,
  querySelectorAll: selector => selector === '[data-motion-scene]' ? [scene, journey] : [],
  addEventListener(name, fn) { events[name] = fn; }
};
function IntersectionObserver(fn) { intersection = fn; this.observe = () => {}; }
const window = { matchMedia: () => query, IntersectionObserver,
  setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
  clearTimeout(id) { timers.delete(id); }, addEventListener() {} };
vm.runInNewContext(source, { window, document, IntersectionObserver, Set, Date });
assert.equal(journey.style.values['--journey-index'], '0');
assert.equal(journeyCards[0].attributes['aria-hidden'], 'false');
assert.equal(journeyCards[1].inert, true);
assert.equal(document.documentElement.classList.contains('motion-opt-in'), true, 'Homepage motion starts enabled');
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
assert.equal(timers.size, 1, 'Product motion remains on when the system preference changes');
assert.equal(ids.motionToggle.textContent, 'Pause motion');
ids.featureMotionToggle.events.click();
assert.equal(timers.size, 0, 'The visible pause control stops motion');
ids.featureMotionToggle.events.click();
assert.equal(timers.size, 1, 'Motion can be resumed');
query.matches = false;
query.change();
intersection([{ target: scene, isIntersecting: false }]);
assert.equal(timers.size, 0, 'Scrolling away must stop');
buttons[2].events.click();
assert.equal(ids.runSteps.dataset.demoStep, '2');
assert.equal(buttons[2].attributes['aria-pressed'], 'true');
assert.equal(ids.motionToggle.attributes['aria-pressed'], 'false', 'Choosing a step must not pause unrelated illustrations');
intersection([{ target: scene, isIntersecting: true }]);
assert.equal(scene.classList.contains('motion-running'), true);
assert.equal(timers.size, 0);
intersection([{ target: journey, isIntersecting: true }]);
assert.equal(timers.size, 1, 'Visible journey carousel must schedule its next slide');
[...timers.values()][0]();
assert.equal(journey.style.values['--journey-index'], '1');
assert.equal(journeyCards[0].attributes['aria-hidden'], 'true');
assert.equal(journeyCards[1].attributes['aria-hidden'], 'false');
assert(statSync(new URL('../home-momentum.jpg', import.meta.url)).size < 200_000, 'Hero asset stays under 200 KB');
assert.match(readFileSync(new URL('../build-public-web.mjs', import.meta.url), 'utf8'), /'home-momentum.jpg'/);
assert.match(readFileSync(new URL('../build-public-web.mjs', import.meta.url), 'utf8'), /'site-theme\.js'/);
assert.match(html, /class="demo-label">Product tour<\/span>/);
assert.doesNotMatch(html, /controlled production beta|invite.paced|Request a beta spot/i);
assert.match(html, /Request early access/);
assert.match(html, /does not currently submit applications on your behalf/);
assert.doesNotMatch(html, /Play animations|featureMotionToggle|journeyMotionToggle/);
assert.equal((html.match(/class="journey-card"/g) || []).length, 4);
assert.match(html, /class="journey-viewport"/);
assert.match(html, /class="journey-track"/);
assert.equal((html.match(/\/ YOUR GOAL/g) || []).length, 2, 'Interviews and offers must be goals, not claimed results');
assert.match(html, /Employers decide interviews and offers/);
assert.doesNotMatch(html, /40 (?:jobs|applications)|guaranteed interviews/i);
assert.doesNotMatch(html, /illustrative|fictional|made-up|example only|sample preview/i);
assert.match(html, /Nothing will be sent until you approve this application\./);
assert.match(html, /data-chrome-web-store-url/);
assert.match(html, /mailto:sales@1ststep.ai/);
for (const publicFile of [
  'index.html',
  'pricing.html',
  'app.html',
  'terms.html',
  'privacy.html',
  'resume-tailor-landing/ghl-custom-code.html',
  'resume-tailor-landing/ghl-cro-custom-code.html',
]) {
  const source = readFileSync(new URL(`../${publicFile}`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:mailto:|Email\s+)evan@1ststep\.ai/i, `${publicFile} must not expose the owner inbox`);
}
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(html, /data-theme-toggle/);
assert.match(css, /\.journey-track\s*\{[^}]*transition:\s*transform/);
assert.match(css, /translate3d\(calc\(var\(--journey-index/);
assert.match(css, /\.job-reel\s*\{[^}]*job-reel-scroll 7\.2s/);
assert.match(css, /\.motion-running \.job-reel \.mini-job/);
assert.match(css, /@keyframes job-card-focus/);
assert.match(css, /@keyframes caret-blink/);
assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest/);
console.log('PASS: homepage motion lifecycle, pause, offscreen, hidden tab, reduced motion, safety labels and preserved links.');

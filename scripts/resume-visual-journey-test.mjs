import fs from 'node:fs';
import vm from 'node:vm';

const path = new URL('../resume-tailor-landing/ghl-visual-journey-custom-code.html', import.meta.url);
const html = fs.readFileSync(path, 'utf8');
const required = [
  'id="fs-journey"',
  'Spend your time choosing the right job.',
  'On supported Greenhouse job pages',
  'Get the Chrome extension',
  'Start My Job Agent',
  'href="https://app.1ststep.ai"',
  'https://www.instagram.com/1ststepdotai/',
  'One capture. Less repetitive work.',
  'See the time you get back.',
  'Estimated time saved on this application',
  'Example estimate.',
  'completed, auditable workflow events',
  'Automation for the work. Human judgment for the decision.',
  'You control submission',
  'No automatic submission',
  'prefers-reduced-motion:reduce',
  'gnbjcmennlcbkmakameknfcnioohnjkp',
  'data-stage="0"',
  'data-stage="3"',
  'data-theme="dark"',
  'data-theme-toggle',
  "localStorage.getItem('1ststep_theme')",
  'data-capture',
  'data-worktab="0"',
  'data-worktab="3"',
];

for (const value of required) {
  if (!html.includes(value)) throw new Error(`Missing required landing contract: ${value}`);
}

for (const forbidden of [
  /guaranteed interview/i,
  /auto(?:matic(?:ally)?)?\s+submit/i,
  /bypass(?:es|ing)?\s+(?:a\s+)?captcha/i,
  /\d+\s*(?:hours?|minutes?)\s+saved/i,
]) {
  if (forbidden.test(html)) throw new Error(`Unsafe marketing claim matched: ${forbidden}`);
}

if (html.includes('https://app.1ststep.ai/app/resume')) {
  throw new Error('App CTA must use the canonical https://app.1ststep.ai entry point');
}

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
if (scripts.length !== 1) throw new Error(`Expected exactly one inline script, found ${scripts.length}`);
new vm.Script(scripts[0], { filename: 'ghl-visual-journey-custom-code.html' });

const primaryCtas = (html.match(/Get the Chrome extension/g) || []).length;
if (primaryCtas < 3) throw new Error(`Expected at least three extension CTAs, found ${primaryCtas}`);

for (const noisyMotion of ['@keyframes fsFloat', '@keyframes fsDrift', '@keyframes fsGaugeSpin', '@keyframes fsPacket']) {
  if (html.includes(noisyMotion)) throw new Error(`Decorative motion returned: ${noisyMotion}`);
}

console.log(`Resume visual journey contract passed (${primaryCtas} extension CTAs).`);

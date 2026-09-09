import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../partners-landing/marketing-motion.js', import.meta.url), 'utf8');

assert.match(source, /20260909-v2/);
assert.match(source, /From job post to application-ready\./);
assert.equal((source.match(/data-fs-step=/g) || []).length, 3);
assert.match(source, /Capture the role/);
assert.match(source, /Tailor the résumé/);
assert.match(source, /Review your packet/);
assert.match(source, /nothing submitted/);
assert.match(source, /prefers-reduced-motion: reduce/);
assert.match(source, /IntersectionObserver/);
assert.match(source, /visibilitychange/);
assert.match(source, /pagehide/);
assert.match(source, /clearTimeout\(timer\)/);
assert.match(source, /aria-selected/);
assert.match(source, /ArrowLeft/);
assert.match(source, /ArrowRight/);
assert.match(source, /fs-site-motion-running/);
assert.match(source, /fs-hero-float/);
assert.match(source, /fs-flow/);
assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
assert.doesNotMatch(source, /guarantee|interview rate|hired|offer rate/i);

console.log('PASS: resume-site motion v2 preserves truthful copy, accessibility controls, reduced motion, visibility suspension, and a three-step app-style workflow.');

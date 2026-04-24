#!/usr/bin/env node
/**
 * smoke-test.js — 1stStep.ai static QA checks
 * Run: node scripts/smoke-test.js
 * CI: called by .github/workflows/qa.yml on push to main / PR
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
let warnings = 0;

function pass(msg) { console.log('  ✓', msg); }
function fail(msg) { console.error('  ✗', msg); failures++; }
function warn(msg) { console.warn('  ⚠', msg); warnings++; }
function section(title) { console.log('\n──', title); }

// ── 1. Required files ─────────────────────────────────────────────────────────
section('Required files');

const REQUIRED_FILES = ['index.html', 'app.js', 'style.css'];
REQUIRED_FILES.forEach(f => {
  if (fs.existsSync(path.join(ROOT, f))) pass(f + ' exists');
  else fail(f + ' is MISSING');
});

const html = fs.existsSync(path.join(ROOT, 'index.html'))
  ? fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') : '';
const js   = fs.existsSync(path.join(ROOT, 'app.js'))
  ? fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8') : '';

// ── 2. HTML structure ─────────────────────────────────────────────────────────
section('HTML structure');

if (html) {
  if (/<link[^>]+href=["']style\.css["']/.test(html)) pass('style.css linked in <head>');
  else fail('style.css NOT linked in <head>');

  if (/<script[^>]+src=["']app\.js["']/.test(html)) pass('app.js linked before </body>');
  else fail('app.js NOT linked');

  // Orphaned content after </html>
  const afterHtml = html.split(/<\/html>/i).slice(1).join('').trim();
  if (afterHtml.length === 0) pass('No content after </html>');
  else fail('Orphaned content after </html>: ' + JSON.stringify(afterHtml.slice(0, 80)));

  // Premature </body> or </html> — find them and confirm only one each at the end
  const bodyCloseCount = (html.match(/<\/body>/gi) || []).length;
  const htmlCloseCount = (html.match(/<\/html>/gi) || []).length;
  if (bodyCloseCount === 1) pass('Exactly one </body>');
  else fail('</body> appears ' + bodyCloseCount + ' times (expected 1)');
  if (htmlCloseCount === 1) pass('Exactly one </html>');
  else fail('</html> appears ' + htmlCloseCount + ' times (expected 1)');
}

// ── 3. Duplicate IDs ──────────────────────────────────────────────────────────
section('Duplicate IDs');

if (html) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const count = {};
  ids.forEach(id => count[id] = (count[id] || 0) + 1);
  const dupes = Object.entries(count).filter(([, n]) => n > 1);
  if (dupes.length === 0) pass('No duplicate IDs');
  else dupes.forEach(([id, n]) => fail('Duplicate ID "' + id + '" appears ' + n + ' times'));
}

// ── 4. Required DOM elements ──────────────────────────────────────────────────
section('Required DOM elements');

// Core elements that must exist for the app to function.
// Grouped by feature area — add new IDs here when building new features.
const REQUIRED_IDS = [
  // File upload / resume input
  'fileInput', 'fileDrop', 'resumeText', 'clearFileBtn',

  // Main action buttons
  'runBtn', 'searchBtn',

  // Results panels
  'resultsPanel', 'resumeOutput', 'coverOutput', 'jobResultsPanel',

  // Navigation (desktop sidebar)
  'modeResume', 'modeTailored', 'modeJobs', 'modeLinkedIn',
  'modeTracker', 'modeBulkApply',

  // Mobile nav
  'mobileQuickBar', 'mobileMoreSheet',

  // Modals
  'upgradeModal', 'profileModal', 'feedbackModal',
  'interviewModal', 'diffModal', 'templatePickerOverlay',
  'applyModal', 'linkedInPdfModal', 'linkedInImportModal',

  // Access gates
  'betaGate', 'betaExpired', 'paywallGate',

  // Onboarding
  'welcomeOverlay',

  // Toast
  'toast',

  // Theme toggle
  'themeToggle',
];

if (html) {
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  REQUIRED_IDS.forEach(id => {
    if (htmlIds.has(id)) pass('#' + id);
    else fail('Required element #' + id + ' is MISSING from index.html');
  });
}

// ── 5. Required global functions ──────────────────────────────────────────────
section('Required global functions');

// Functions called from HTML inline handlers or dynamically generated HTML.
// These must be top-level (not nested inside blocks where they'd be inaccessible).
const REQUIRED_FUNCTIONS = [
  'switchMode', 'runTailoring', 'searchJobs',
  'toggleTheme', 'checkBetaAccess', 'verifySubscription',
  'openUpgradeModal', 'closeUpgradeModal',
  'openFeedbackModal', 'closeFeedbackModal',
  'openProfileModal', 'closeProfileModal',
  'closeDiffModal', 'closeInterviewModal',
  'closeApplyModal', 'closeTemplateModal',
  'closeLinkedInPdfModal', 'closeLinkedInImportModal',
  'submitBetaCode', 'submitPaywallVerify',
  'handleJsFileSelect',
  'toggleJobType',
  'openJobBoard',
];

if (js) {
  REQUIRED_FUNCTIONS.forEach(fn => {
    // Match function declarations and assignments (arrow fns, var/let/const)
    const pattern = new RegExp(
      '(?:^|\\n)\\s*(?:async\\s+)?function\\s+' + fn + '\\s*\\(' +
      '|(?:^|\\n)\\s*(?:var|let|const)\\s+' + fn + '\\s*=' +
      '|(?:^|\\n)\\s*window\\.' + fn + '\\s*='
    );
    if (pattern.test(js)) pass(fn + '()');
    else fail('Required function ' + fn + '() NOT found in app.js');
  });
}

// ── 6. Inline handler audit ───────────────────────────────────────────────────
section('Inline event handler audit');

// These are the ONLY inline handlers intentionally kept.
// Everything else should use addEventListener (Phase 4).
const ALLOWLISTED_HANDLERS = [
  // Enter-key shortcuts on inputs
  { pattern: /onkeydown="if\(event\.key===.Enter.\)\s*(searchJobs|submitBetaCode|submitPaywallVerify)\(\)"/, label: 'Enter-key shortcut on inputs (searchJobs/betaCode/paywallVerify)' },
  // File input change (dynamic clone pattern prevents addEventListener attachment)
  { pattern: /onchange="handleJsFileSelect\(event\)"/, label: 'onchange="handleJsFileSelect(event)" on jsFileInput' },
  // Border-color focus/blur styling
  { pattern: /onfocus=|onblur=/, label: 'onfocus/onblur border-color styling' },
  // Footer hover color swaps
  { pattern: /onmouseover=|onmouseout=/, label: 'onmouseover/onmouseout on footer links' },
];

const BLOCKED_HANDLERS = ['onclick', 'ondrop', 'ondragover', 'ondragleave'];

if (html) {
  BLOCKED_HANDLERS.forEach(h => {
    const matches = [...html.matchAll(new RegExp(h + '=', 'g'))];
    if (matches.length === 0) pass('No ' + h + '= inline handlers');
    else fail(matches.length + ' ' + h + '= inline handler(s) found — convert to addEventListener');
  });

  const remaining = ['onchange', 'onkeydown', 'onfocus', 'onblur', 'onmouseover', 'onmouseout'];
  remaining.forEach(h => {
    const count = (html.match(new RegExp(h + '=', 'g')) || []).length;
    if (count > 0) warn(count + ' ' + h + '= (allowlisted — see ALLOWLISTED_HANDLERS in smoke-test.js)');
  });
}

// ── 7. No raw <script> or <style> blocks in HTML (post-extraction) ────────────
section('No inline <script> or <style> blocks');

if (html) {
  // Allow <script type="application/ld+json"> (SEO structured data) and tailwind config
  const scriptBlocks = [...html.matchAll(/<script(?![^>]*type=["']application\/ld\+json["'])[^>]*>/gi)];
  // Allow CDN scripts (src= attribute present) and inline tailwind config
  const inlineScripts = scriptBlocks.filter(m => !/src=/.test(m[0]) && !/tailwind\.config/.test(
    html.slice(m.index, m.index + 200)
  ));
  if (inlineScripts.length === 0) pass('No unexpected inline <script> blocks');
  else warn(inlineScripts.length + ' non-CDN <script> block(s) without src= — verify intentional');

  const styleBlocks = [...html.matchAll(/<style[^>]*>/gi)];
  if (styleBlocks.length === 0) pass('No inline <style> blocks');
  else warn(styleBlocks.length + ' <style> block(s) in HTML — should live in style.css');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log('Failures:', failures, '  Warnings:', warnings);
if (failures > 0) {
  console.error('\nSMOKE TEST FAILED — ' + failures + ' issue(s) must be fixed before merging.\n');
  process.exit(1);
} else {
  console.log('\nAll checks passed.' + (warnings > 0 ? ' (' + warnings + ' warning(s) — review above)' : '') + '\n');
  process.exit(0);
}

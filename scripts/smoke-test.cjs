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
const css  = fs.existsSync(path.join(ROOT, 'style.css'))
  ? fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8') : '';
const ghlCro = fs.existsSync(path.join(ROOT, 'resume-tailor-landing', 'ghl-cro-custom-code.html'))
  ? fs.readFileSync(path.join(ROOT, 'resume-tailor-landing', 'ghl-cro-custom-code.html'), 'utf8') : '';
const ghlDefault = fs.existsSync(path.join(ROOT, 'resume-tailor-landing', 'ghl-custom-code.html'))
  ? fs.readFileSync(path.join(ROOT, 'resume-tailor-landing', 'ghl-custom-code.html'), 'utf8') : '';
const apiSubscription = fs.existsSync(path.join(ROOT, 'api', 'subscription.js'))
  ? fs.readFileSync(path.join(ROOT, 'api', 'subscription.js'), 'utf8') : '';
const apiBeta = fs.existsSync(path.join(ROOT, 'api', 'beta.js'))
  ? fs.readFileSync(path.join(ROOT, 'api', 'beta.js'), 'utf8') : '';

// ── 2. HTML structure ─────────────────────────────────────────────────────────
section('HTML structure');

if (html) {
  if (/<link[^>]+href=["']style\.css["']/.test(html)) pass('style.css linked in <head>');
  else fail('style.css NOT linked in <head>');

  if (/<script[^>]+src=["']app\.js(?:\?[^"']*)?["']/.test(html)) pass('app.js linked before </body>');
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
  'runBtn', 'searchBtn', 'positioningAnalyzeBtn', 'positioningUseBtn', 'positioningClearBtn', 'positioningActiveBadge',

  // Contextual guidance
  'currentObjectiveBar', 'currentObjectiveText',
  'whatsNextCard', 'whatsNextTitle', 'whatsNextPrimaryBtn', 'whatsNextSecondaryBtn', 'whatsNextRestoreBtn',
  'applicationChecklistCard', 'applicationChecklistItems', 'applicationChecklistCount', 'smartActionReason',
  'analyzePositioningReason', 'usePositioningReason', 'analyzePositioningResultReason', 'clearPositioningReason',
  'trackerEmpty', 'tailoredHistoryList', 'jobEmptyState', 'jobList', 'appList',

  // Results panels
  'resultsPanel', 'resumeOutput', 'coverOutput', 'jobResultsPanel',
  'positioningBriefCard', 'positioningBriefContent',

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

section('Career Positioning Brief smoke');

if (html) {
  if (/Analyze My Positioning/.test(html)) pass('Analyze My Positioning CTA is present');
  else fail('Analyze My Positioning CTA is missing');

  if (/Career Positioning Brief/.test(html)) pass('Career Positioning Brief panel is present');
  else fail('Career Positioning Brief panel is missing');

  if (/Use This Positioning/.test(html)) pass('Use This Positioning bridge CTA is present');
  else fail('Use This Positioning bridge CTA is missing');

  if (/Remove positioning context/.test(html)) pass('Remove positioning context control is present');
  else fail('Remove positioning context control is missing');
}

if (js) {
  if (/usedPositioningBrief\s*:\s*usingPositioningBrief/.test(js)) pass('usedPositioningBrief metadata is saved from active bridge state');
  else fail('usedPositioningBrief metadata handling is missing');

  if (/positioningBriefUsedAt\s*:\s*usingPositioningBrief/.test(js)) pass('positioningBriefUsedAt metadata is saved when bridge is used');
  else fail('positioningBriefUsedAt metadata handling is missing');

  try {
    const start = js.indexOf('function stripPositioningCodeFences');
    const end = js.indexOf('function attachPositioningBriefToLatestEntry');
    if (start < 0 || end < 0 || end <= start) throw new Error('Could not isolate positioning brief helpers');

    const helperSource = js.slice(start, end);
    const sanitizeProse = (value, max = 9999) => String(value || '').trim().slice(0, max);
    const escHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
    const helpers = new Function('sanitizeProse', 'escHtml', helperSource + '; return { normalizePositioningBrief, renderSavedPositioningBrief };')(sanitizeProse, escHtml);

    const fencedJson = '```json\n{"ValueProposition":"Procurement operator","StrongestAngle":"Construction procurement","ImpactOpportunities":["Negotiate supplier terms","Improve contract compliance"],"GenericBulletWarnings":[{"Original":"Managed vendors","Improved":"Managed supplier performance across capital projects"}],"DifferentiationNotes":"Lead with sourcing and contracts.","MissingProofPoints":["Annual spend managed"]}\n```';
    const normalizedFenced = helpers.normalizePositioningBrief(fencedJson);
    if (normalizedFenced.valueProposition === 'Procurement operator' && normalizedFenced.impactOpportunities.length === 2) pass('normalizePositioningBrief handles fenced JSON string');
    else fail('normalizePositioningBrief does not parse fenced JSON string');

    const normalizedPascal = helpers.normalizePositioningBrief({
      ValueProposition: 'Capital procurement operator',
      StrongestAngle: 'Construction and supplier performance',
      ImpactOpportunities: ['Reduce vendor risk'],
      GenericBulletWarnings: [{ Original: 'Helped purchasing', Improved: 'Improved purchasing workflows' }],
      DifferentiationNotes: 'Use procurement depth.',
      MissingProofPoints: ['Savings results'],
    });
    if (normalizedPascal.valueProposition && normalizedPascal.strongestAngle && normalizedPascal.genericBulletWarnings[0]?.improved) pass('normalizePositioningBrief handles PascalCase keys');
    else fail('normalizePositioningBrief does not map PascalCase keys');

    const normalizedRawText = helpers.normalizePositioningBrief({ rawText: fencedJson });
    if (normalizedRawText.valueProposition === 'Procurement operator' && !normalizedRawText.rawText) pass('normalizePositioningBrief handles object.rawText containing fenced JSON');
    else fail('normalizePositioningBrief does not parse object.rawText fenced JSON');

    const savedHtml = helpers.renderSavedPositioningBrief({ rawText: fencedJson }, true);
    if (!/```json/i.test(savedHtml)) pass('saved-entry renderer does not output literal ```json for parseable content');
    else fail('saved-entry renderer leaked literal ```json');

    if (!/<div class="positioning-raw-text">\s*\{/.test(savedHtml) && /Candidate Value Proposition/.test(savedHtml) && /Used for this resume/.test(savedHtml)) pass('saved-entry renderer sections parseable fields instead of raw braces');
    else fail('saved-entry renderer shows raw braces as primary UI for parseable fields');
  } catch (err) {
    fail('Career Positioning Brief normalization regression checks errored: ' + err.message);
  }
}

// ── 5. Required global functions ──────────────────────────────────────────────
section('Workflow guidance smoke');

if (html) {
  if (/id="currentObjectiveBar"/.test(html) && /id="currentObjectiveText"/.test(html)) pass('Current objective bar is present');
  else fail('Current objective bar is missing');

  if (/Application checklist/i.test(html)) pass('Application checklist card copy is present');
  else fail('Application checklist card copy is missing');

  if (/id="smartActionReason"/.test(html)) pass('Smart disabled reason live region is present');
  else fail('Smart disabled reason live region is missing');
}

if (js) {
  if (/function getApplicationWorkflowState\s*\(/.test(js)) pass('Shared workflow state snapshot exists');
  else fail('Shared workflow state snapshot is missing');

  if (/function getDisabledReason\s*\(/.test(js)) pass('Disabled reason helper exists');
  else fail('Disabled reason helper is missing');

  if (/function updateDisabledButtonReasons\s*\(/.test(js)) pass('Disabled reason updater exists');
  else fail('Disabled reason updater is missing');

  if (/function getApplicationChecklistItems\s*\(/.test(js)) pass('Application checklist item builder exists');
  else fail('Application checklist item builder is missing');

  if (/function updateApplicationChecklist\s*\(/.test(js)) pass('Application checklist updater exists');
  else fail('Application checklist updater is missing');

  if (/function getCurrentObjective\s*\(/.test(js)) pass('Current objective helper exists');
  else fail('Current objective helper is missing');

  if (/function updateCurrentObjectiveBar\s*\(/.test(js)) pass('Current objective updater exists');
  else fail('Current objective updater is missing');

  if (/let lastCurrentObjectiveRenderKey\s*=/.test(js)) pass('Current objective render-key guard exists');
  else fail('Current objective render-key guard is missing');

  if (/function updateWorkflowGuidanceUI[\s\S]*updateCurrentObjectiveBar\(workflowState\)/.test(js)) pass('Central workflow guidance refresh updates current objective');
  else fail('Central workflow guidance refresh does not update current objective');

  if (/function renderEmptyState\s*\(/.test(js)) pass('Reusable empty-state renderer exists');
  else fail('Reusable empty-state renderer is missing');

  if (/function handleEmptyStateAction\s*\(/.test(js)) pass('Empty-state action router exists');
  else fail('Empty-state action router is missing');

  if (/function updateEmptyStates\s*\(/.test(js)) pass('Central empty-state refresh exists');
  else fail('Central empty-state refresh is missing');

  if (/EMPTY_STATE_SHOWN/.test(js)) pass('Empty-state shown analytics event is present');
  else fail('EMPTY_STATE_SHOWN analytics event is missing');

  if (/EMPTY_STATE_ACTION_CLICKED/.test(js)) pass('Empty-state action analytics event is present');
  else fail('EMPTY_STATE_ACTION_CLICKED analytics event is missing');

  if (/getWhatsNextState\(workflowState\)/.test(js)) pass('What’s Next reuses shared workflow state');
  else fail('What’s Next does not appear to reuse shared workflow state');

  if (/function updateWorkflowGuidanceUI\s*\(/.test(js)) pass('Central workflow guidance refresh exists');
  else fail('Central workflow guidance refresh is missing');

  if (/function getWhatsNextElements\s*\(/.test(js) && /function getApplicationChecklistElements\s*\(/.test(js) && /if \(!els\) return/.test(js) && /return card && items && count/.test(js)) pass('Missing guide/checklist nodes no-op structurally');
  else fail('Missing guide/checklist no-op guards are missing or unclear');
}

section('Meaningful empty states smoke');

if (html) {
  if (/id="trackerEmpty"/.test(html)) pass('Tracker empty-state hook exists');
  else fail('Tracker empty-state hook is missing');

  if (/id="tailoredHistoryList"/.test(html)) pass('Vault/history empty-state hook exists');
  else fail('Vault/history empty-state hook is missing');

  if (/id="resumeOutput"/.test(html)) pass('Resume output empty-state hook exists');
  else fail('Resume output empty-state hook is missing');

  if (/id="coverOutput"/.test(html)) pass('Cover letter empty-state hook exists');
  else fail('Cover letter empty-state hook is missing');

  if (/id="jobEmptyState"/.test(html) && /id="jobList"/.test(html)) pass('Search/results empty-state hooks exist');
  else fail('Search/results empty-state hooks are missing');
}

if (css) {
  ['empty-state', 'empty-state-title', 'empty-state-text', 'empty-state-actions', 'empty-state-button', 'empty-state-secondary-button'].forEach(cls => {
    if (new RegExp('\\.' + cls + '\\b').test(css)) pass('.' + cls);
    else fail('Missing CSS class .' + cls);
  });
}

section('Layout collision smoke');

if (css) {
  [
    '--sidebar-width',
    '--fixed-bottom-safe-space',
    '--mobile-fixed-bottom-safe-space',
    '--z-sidebar',
    '--z-objective-bar',
    '--z-guide-sheet',
    '--z-chat'
  ].forEach(variable => {
    if (new RegExp(variable + '\\s*:').test(css)) pass(variable + ' CSS variable exists');
    else fail(variable + ' CSS variable is missing');
  });

  if (/\.debug-layout\s+\*/.test(css)) pass('Debug layout helper exists');
  else fail('Debug layout helper is missing');

  if (/#resumeGrid[\s\S]*minmax\(0,\s*1fr\)/.test(css)) pass('Resume grid uses minmax(0, 1fr) for safe shrink');
  else fail('Resume grid does not include minmax(0, 1fr) safe column sizing');

  if (/#currentObjectiveBar[\s\S]*margin-left:\s*var\(--sidebar-width\)/.test(css)) pass('Objective bar reserves desktop sidebar space');
  else fail('Objective bar does not reserve desktop sidebar space');

  if (/overflow-wrap:\s*anywhere/.test(css)) pass('Long guidance text has overflow wrapping');
  else fail('Missing overflow wrapping for guidance text');

  if (/env\(safe-area-inset-bottom/.test(css) && /--fixed-bottom-safe-space/.test(css)) pass('Fixed bottom safe spacing is present');
  else fail('Fixed bottom safe spacing is missing');
}

section('Free-to-Pro conversion smoke');

if (html) {
  if (/\$24\.99/.test(html)) pass('Job Hunt Pass price appears in upgrade/paywall copy');
  else fail('Job Hunt Pass price $24.99 is missing from upgrade/paywall copy');

  if (/Upgrade to Job Hunt Pass/.test(html) || /Start Job Hunt Pass/.test(html)) pass('Single-plan Job Hunt Pass upgrade CTA copy exists');
  else fail('Job Hunt Pass upgrade CTA copy is missing');
}

if (js) {
  [
    'FREE_TO_PRO_PRICE',
    'PRO_TIER_ALIASES',
    'getPlanState',
    'guardProFeature',
    'canSaveTrackedJob'
  ].forEach(symbol => {
    if (new RegExp(symbol).test(js)) pass(symbol + ' exists');
    else fail(symbol + ' is missing');
  });

  if (/free:\s*\{\s*searches:\s*5,\s*tailors:\s*3,\s*coverLetters:\s*1,\s*savedJobs:\s*3/.test(js)) pass('Free plan limits are explicit');
  else fail('Free plan limits are not explicit or changed unexpectedly');

  if (/UPGRADE_PROMPT_VIEWED/.test(js) && /PRO_FEATURE_LOCKED/.test(js) && /UPGRADE_CTA_CLICKED/.test(js)) pass('Conversion analytics events are present');
  else fail('Conversion analytics events are missing');

  if (!/generatePositioningBrief[\s\S]*?guardProFeature\('positioningBrief'/.test(js)) pass('Positioning Brief is included in the free plan');
  else fail('Positioning Brief should not be gated as a paid-only feature');

  if (/function _activateCoverLetter[\s\S]*openUpgradeModal\('coverLetter'\)/.test(js)) pass('Cover letter upgrade trigger is present');
  else fail('Cover letter upgrade trigger is missing');

  if (/legacy private-access user -> free tier/.test(js) && !/BETA_GRACE_PERIOD && beta && beta\.grantedAt[\s\S]{0,240}currentTier = 'complete'/.test(js)) pass('Legacy beta signups are forced to free in the client');
  else fail('Legacy beta signups can still become paid in the client');
}

if (apiSubscription) {
  if (/isBetaEmail\(email\)[\s\S]{0,180}tier: 'free'/.test(apiSubscription)) pass('Beta email override resolves to free');
  else fail('Beta email override may still grant paid access');
}

if (apiBeta) {
  if (/tier:\s+'free'/.test(apiBeta) && !/signTierToken\(cleanEmail,\s*'complete'/.test(apiBeta)) pass('Legacy beta endpoint returns free only');
  else fail('Legacy beta endpoint may still issue paid access');
}

section('Landing conversion tracking smoke');

if (js) {
  if (/typeof window\.gtag === 'function'/.test(js) && /window\.dataLayer/.test(js)) pass('App analytics can forward safe events to GA4/GTM');
  else fail('App analytics does not forward events to GA4/GTM');

  if (/APP_GA_ID\s*=\s*'G-RYPRPJDLVE'/.test(js) && /initAppGoogleAnalytics/.test(js)) pass('App GA4 measurement ID is configured');
  else fail('App GA4 measurement ID is missing or changed unexpectedly');
}

[
  ['GHL CRO landing', ghlCro],
  ['GHL default landing', ghlDefault],
].forEach(([name, source]) => {
  if (!source) {
    fail(name + ' source is missing');
    return;
  }
  if (/FIRSTSTEP_GA_ID/.test(source)) pass(name + ' has configurable GA4 measurement ID');
  else fail(name + ' is missing configurable GA4 measurement ID');
  if (/firstStepTrack/.test(source)) pass(name + ' exposes firstStepTrack()');
  else fail(name + ' is missing firstStepTrack()');
  if (/LANDING_PAGE_VIEW/.test(source) && /START_FREE_CLICKED/.test(source) && /CHECKOUT_STARTED/.test(source)) pass(name + ' tracks page, free CTA, and checkout intent');
  else fail(name + ' is missing core conversion events');
  if (/SCROLL_DEPTH_REACHED/.test(source) && /PRICING_VIEWED/.test(source)) pass(name + ' tracks scroll depth and pricing views');
  else fail(name + ' is missing engagement events');
  if (/firststep_attribution/.test(source) && /fs_vid/.test(source)) pass(name + ' persists attribution and app handoff visitor ID');
  else fail(name + ' is missing attribution handoff');
});

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
  'generatePositioningBrief',
  'normalizePositioningBrief',
  'renderPositioningBrief',
  'useCurrentPositioningBrief',
  'clearActivePositioningContext',
  'getApplicationWorkflowState',
  'getDisabledReason',
  'updateDisabledButtonReasons',
  'getApplicationChecklistItems',
  'updateApplicationChecklist',
  'getCurrentObjective',
  'updateCurrentObjectiveBar',
  'renderEmptyState',
  'handleEmptyStateAction',
  'updateEmptyStates',
  'updateWorkflowGuidanceUI',
  'updateWhatsNextGuide',
  'getPlanState',
  'guardProFeature',
  'canSaveTrackedJob',
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

// ── 5b. addEventListener bare-reference check ─────────────────────────────────
// Catches the exact bug that broke the welcome buttons: a bare function name
// passed to addEventListener that doesn't exist in the file.
// Pattern: .addEventListener('event', someName) — where someName is NOT a =>/{/function
section('addEventListener reference check');

if (js) {
  // Extract bare function names passed as the second arg to addEventListener
  // Matches: .addEventListener('type', fnName) or .addEventListener("type", fnName)
  // Excludes: arrow functions, anonymous functions, method calls (fn.method), chained ?.
  const bareRefs = [...js.matchAll(/\.addEventListener\(\s*['"][^'"]+['"]\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)/g)]
    .map(m => m[1])
    .filter(name => !['true','false','null','undefined'].includes(name));

  const uniqueRefs = [...new Set(bareRefs)];
  const missing = uniqueRefs.filter(name => {
    // Check if the name is declared as a function somewhere in app.js
    const declPattern = new RegExp(
      '(?:^|\\n)\\s*(?:async\\s+)?function\\s+' + name + '\\s*\\(' +
      '|(?:^|\\n)\\s*(?:var|let|const)\\s+' + name + '\\s*='
    );
    return !declPattern.test(js);
  });

  if (missing.length === 0) pass('All addEventListener bare references resolve to declared functions');
  else missing.forEach(name => fail('addEventListener references "' + name + '" which is not declared in app.js'));
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
section('Accessibility smoke checks');

function readIfExists(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
}

const A11Y_FILES = [
  'index.html',
  'funnel.html',
  'admin.html',
  path.join('1ststep-extension', 'popup.html'),
  path.join('1ststep-extension', 'sidepanel.html'),
].filter(rel => fs.existsSync(path.join(ROOT, rel)));

function escRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

A11Y_FILES.forEach(rel => {
  const src = readIfExists(rel);
  const markup = src.split(/<script\b/i)[0];
  if (/<html\b[^>]*\blang=["'][^"']+["']/i.test(markup)) pass(rel + ' has <html lang>');
  else fail(rel + ' is missing <html lang>');

  const ids = [...markup.matchAll(/<[a-zA-Z][^>]*\bid=["']([^"']+)["']/g)].map(m => m[1]);
  const counts = {};
  ids.forEach(id => counts[id] = (counts[id] || 0) + 1);
  Object.entries(counts).filter(([, n]) => n > 1)
    .forEach(([id, n]) => fail(rel + ' duplicate ID "' + id + '" appears ' + n + ' times'));

  const missingAlt = [...markup.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/gi)];
  if (missingAlt.length === 0) pass(rel + ' has no <img> without alt');
  else fail(rel + ' has ' + missingAlt.length + ' <img> tag(s) missing alt');

  const unlabeledFields = [...markup.matchAll(/<(input|textarea|select)\b(?![^>]*(?:aria-label|aria-labelledby|type=["']hidden["']|aria-hidden=["']true["']))[^>]*\bid=["']([^"']+)["'][^>]*>/gi)]
    .filter(([, , id]) => !new RegExp(`<label\\b[^>]*\\bfor=["']${escRe(id)}["']`, 'i').test(markup));
  if (unlabeledFields.length === 0) pass(rel + ' has no obvious unlabeled fields');
  else unlabeledFields.forEach(([, tag, id]) => fail(rel + ' <' + tag.toLowerCase() + '> #' + id + ' has no obvious accessible label'));

  const unnamedIconButtons = [...markup.matchAll(/<button\b(?![^>]*(?:aria-label|aria-labelledby))[^>]*>([\s\S]*?)<\/button>/gi)]
    .filter(([, body]) => {
      const text = body.replace(/<[^>]+>/g, '').trim();
      const hasOnlySvg = /<svg\b/i.test(body) && text.length === 0;
      return hasOnlySvg || ['×', '✕', '★', 'â˜…', '↻', '?'].includes(text);
    });
  if (unnamedIconButtons.length === 0) pass(rel + ' has no obvious unnamed icon-only buttons');
  else fail(rel + ' has ' + unnamedIconButtons.length + ' obvious unnamed icon-only button(s)');
});

console.log('\n' + '─'.repeat(50));
console.log('Failures:', failures, '  Warnings:', warnings);
if (failures > 0) {
  console.error('\nSMOKE TEST FAILED — ' + failures + ' issue(s) must be fixed before merging.\n');
  process.exit(1);
} else {
  console.log('\nAll checks passed.' + (warnings > 0 ? ' (' + warnings + ' warning(s) — review above)' : '') + '\n');
  process.exit(0);
}

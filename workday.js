/**
 * workday.js — Shadow DOM Input Detector
 * Part of: 1ststep-extension/sites/workday.js
 *
 * Workday renders its apply forms as a deeply nested SPA inside multiple
 * layers of Shadow DOM. Standard querySelector() cannot pierce shadow roots,
 * so we walk the composed tree manually, observe for dynamic form steps, and
 * return a normalised FieldMap that filler.js can consume.
 *
 * Architecture notes (from arch map):
 *  - Workday = SPA modal, difficulty: HARD
 *  - Requires MutationObserver + retries
 *  - React-managed inputs need dispatchEvent(new Event("input")), not .value=
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Selectors that identify Workday input elements inside shadow roots. */
const WD_INPUT_SELECTORS = [
  'input[data-automation-id]',
  'textarea[data-automation-id]',
  'select[data-automation-id]',
  '[data-automation-id="formField"] input',
  '[data-automation-id="formField"] textarea',
  '[data-automation-id="formField"] select',
  // Phone / date pickers rendered as role="combobox"
  '[role="combobox"]',
  // File upload
  'input[type="file"]',
  // Rich-text editors (cover letter box)
  '[contenteditable="true"]',
];

/** Automation IDs Workday uses for known fields — extend as needed. */
const WD_FIELD_MAP = {
  legalNameSection_firstName:   'firstName',
  legalNameSection_lastName:    'lastName',
  email:                        'email',
  phone:                        'phone',
  addressSection_city:          'city',
  addressSection_countryRegion: 'state',
  addressSection_postalCode:    'zip',
  linkedin:                     'linkedin',
  howDidYouHear:                'source',
  workAuthSection:              'workAuth',
  salaryExpectations:           'salary',
  coverLetter:                  'coverLetter',
};

// ─── Core: Deep Shadow-DOM Walker ─────────────────────────────────────────────

/**
 * Recursively walks a DOM subtree, crossing every open shadow root it finds.
 *
 * @param {Element|ShadowRoot} root   - Starting node.
 * @param {string[]}           selectors - CSS selectors to match against.
 * @param {Element[]}          [results] - Accumulator (internal).
 * @returns {Element[]} All matching elements found at any shadow depth.
 */
function deepQueryAll(root, selectors, results = []) {
  const selectorStr = selectors.join(', ');

  // Query at this level
  try {
    const found = root.querySelectorAll(selectorStr);
    found.forEach(el => {
      if (!results.includes(el)) results.push(el);
    });
  } catch (_) {
    // Malformed selector or closed shadow root — skip silently
  }

  // Recurse into every child's shadow root
  const children = root.querySelectorAll('*');
  children.forEach(child => {
    if (child.shadowRoot) {
      deepQueryAll(child.shadowRoot, selectors, results);
    }
  });

  return results;
}

/**
 * Single-element variant — returns the first match across the shadow tree.
 *
 * @param {Element|ShadowRoot} root
 * @param {string[]}           selectors
 * @returns {Element|null}
 */
function deepQuery(root, selectors) {
  return deepQueryAll(root, selectors)[0] ?? null;
}

// ─── Field Metadata Extraction ────────────────────────────────────────────────

/**
 * Derives a human-readable label for a Workday input by checking (in order):
 *   1. data-automation-id attribute
 *   2. aria-labelledby → label text
 *   3. aria-label attribute
 *   4. Closest visible <label> in the composed tree
 *   5. placeholder attribute
 *
 * @param {Element} el
 * @returns {string} label, or '' if none found
 */
function resolveLabel(el) {
  // 1. data-automation-id gives us the best semantic key
  const autoId = el.getAttribute('data-automation-id');
  if (autoId) return autoId;

  // 2. aria-labelledby (may point to a node inside another shadow root)
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    // Search the composed document for the label element
    const labelEl = deepQuery(document, [`#${CSS.escape(labelledBy)}`]);
    if (labelEl?.textContent?.trim()) return labelEl.textContent.trim();
  }

  // 3. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // 4. Closest <label> — walk up through shadow host if needed
  let node = el;
  while (node) {
    const label = node.closest?.('label');
    if (label?.textContent?.trim()) return label.textContent.trim();
    // Step out of shadow root to its host
    node = node.getRootNode?.()?.host ?? null;
  }

  // 5. Placeholder
  return el.getAttribute('placeholder') ?? '';
}

/**
 * Maps a raw Workday automation-id / label string to a canonical field key.
 *
 * @param {string} raw
 * @returns {string} canonical key, or the raw value if unmapped
 */
function canonicalKey(raw) {
  for (const [wdKey, canonical] of Object.entries(WD_FIELD_MAP)) {
    if (raw.toLowerCase().includes(wdKey.toLowerCase())) return canonical;
  }
  return raw;
}

/**
 * Returns the current value of any input type, including contenteditable.
 *
 * @param {Element} el
 * @returns {string}
 */
function readValue(el) {
  if (el.isContentEditable)         return el.innerText.trim();
  if (el.tagName === 'SELECT')      return el.options[el.selectedIndex]?.text ?? el.value;
  return el.value ?? '';
}

// ─── Field Filling ────────────────────────────────────────────────────────────

/**
 * Sets a value on a Workday input and fires the events React/Angular need
 * to acknowledge the change (per arch map: dispatchEvent not .value=).
 *
 * @param {Element} el
 * @param {string}  value
 */
function fillField(el, value) {
  if (el.isContentEditable) {
    el.focus();
    el.innerText = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;

  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (el.tagName === 'TEXTAREA' && nativeTextareaSetter) {
    nativeTextareaSetter.call(el, value);
  } else if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true }));
}

// ─── Main: detectWorkdayFields ────────────────────────────────────────────────

/**
 * Scans the page's full composed DOM (piercing all Shadow roots) for Workday
 * apply-form input fields and returns a structured FieldMap.
 *
 * @typedef  {Object} WorkdayField
 * @property {string}   key        - Canonical field key (e.g. 'firstName')
 * @property {string}   rawLabel   - Original automation-id or label text
 * @property {string}   type       - Input type: 'text'|'select'|'file'|'rich'|etc.
 * @property {string}   value      - Current value
 * @property {Element}  el         - Live DOM reference for filling
 * @property {number}   depth      - Shadow nesting depth (diagnostic)
 *
 * @typedef  {Object} FieldMap
 * @property {WorkdayField[]} fields   - All detected fields
 * @property {boolean}        isReady  - False if form isn't fully rendered yet
 * @property {string}         formStep - 'personalInfo'|'resume'|'questions'|'review'|'unknown'
 *
 * @param {Element} [contextRoot=document] - Narrow scope for retries on step changes
 * @returns {FieldMap}
 */
function detectWorkdayFields(contextRoot = document) {
  const allInputs = deepQueryAll(contextRoot, WD_INPUT_SELECTORS);

  // De-duplicate by element reference (deepQueryAll can find via multiple selectors)
  const unique = [...new Set(allInputs)];

  // Filter out hidden, disabled, and readonly fields that aren't meant to be filled
  const visible = unique.filter(el => {
    if (el.disabled || el.readOnly)  return false;
    if (el.type === 'hidden')         return false;
    const rect = el.getBoundingClientRect();
    // A zero-size element is likely hidden by Workday's tab/step logic
    return rect.width > 0 || el.isContentEditable || el.type === 'file';
  });

  const fields = visible.map(el => {
    const rawLabel = resolveLabel(el);
    const key      = canonicalKey(rawLabel);

    let type = 'text';
    if (el.type === 'file')       type = 'file';
    else if (el.tagName === 'SELECT') type = 'select';
    else if (el.isContentEditable)    type = 'rich';
    else if (el.type === 'checkbox')  type = 'checkbox';
    else if (el.type === 'radio')     type = 'radio';
    else if (el.role === 'combobox' || el.getAttribute('role') === 'combobox') type = 'combobox';

    // Compute shadow depth for diagnostics
    let depth = 0;
    let node  = el;
    while (node) {
      const root = node.getRootNode();
      if (root === document || root === node) break;
      depth++;
      node = root.host ?? null;
    }

    return { key, rawLabel, type, value: readValue(el), el, depth };
  });

  const isReady   = fields.length > 0;
  const formStep  = resolveFormStep(fields);

  return { fields, isReady, formStep };
}

// ─── Step Detection ───────────────────────────────────────────────────────────

/**
 * Heuristically identifies which Workday apply step is currently rendered.
 *
 * @param {WorkdayField[]} fields
 * @returns {string}
 */
function resolveFormStep(fields) {
  const keys = fields.map(f => f.key);

  if (keys.some(k => ['firstName', 'lastName', 'email', 'phone'].includes(k))) {
    return 'personalInfo';
  }
  if (fields.some(f => f.type === 'file')) {
    return 'resume';
  }
  if (keys.includes('coverLetter') || keys.some(k => k.startsWith('question'))) {
    return 'questions';
  }
  if (fields.length === 0) {
    return 'review'; // Final step often has no editable inputs
  }
  return 'unknown';
}

// ─── MutationObserver: watch for SPA step changes ────────────────────────────

/**
 * Watches the Workday modal for DOM changes caused by multi-step navigation,
 * calling `onStepChange(fieldMap)` whenever a new form step is detected.
 *
 * Implements exponential-backoff retry logic so the first observation after
 * a step change doesn't fire before React has finished rendering.
 *
 * @param {function(FieldMap): void} onStepChange
 * @param {Object}  [opts]
 * @param {number}  [opts.debounceMs=400]   - Quiet period before re-scanning
 * @param {number}  [opts.maxRetries=5]     - Re-scan attempts if isReady=false
 * @param {number}  [opts.retryBaseMs=300]  - Base delay for retry back-off
 * @returns {{ stop: function(): void }}    - Call stop() to disconnect
 */
function observeWorkdaySteps(onStepChange, {
  debounceMs   = 400,
  maxRetries   = 5,
  retryBaseMs  = 300,
} = {}) {
  let debounceTimer = null;
  let retryCount    = 0;
  let lastStep      = null;

  function scan(attempt = 0) {
    const result = detectWorkdayFields();

    if (!result.isReady && attempt < maxRetries) {
      // Form not rendered yet — retry with back-off
      const delay = retryBaseMs * Math.pow(1.6, attempt);
      setTimeout(() => scan(attempt + 1), delay);
      return;
    }

    retryCount = 0;

    // Only fire callback when the step actually changes
    if (result.formStep !== lastStep) {
      lastStep = result.formStep;
      onStepChange(result);
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => scan(0), debounceMs);
  });

  // Attach to the Workday apply-modal container if present, else document.body
  const modalRoot = deepQuery(document, [
    '[data-automation-id="applyButtonContainer"]',
    '[data-automation-id="wd-popup-body"]',
    '.wd-popup-body',
  ]) ?? document.body;

  observer.observe(modalRoot, {
    childList: true,
    subtree:   true,
    attributes: false,
  });

  // Run an initial scan
  scan(0);

  return {
    stop() {
      clearTimeout(debounceTimer);
      observer.disconnect();
    },
  };
}

// ─── Auto-fill Helper ─────────────────────────────────────────────────────────

/**
 * Given a FieldMap from detectWorkdayFields() and a values object (as returned
 * by the claude.js autofill callType), fills every matched field.
 *
 * @param {FieldMap} fieldMap         - Result of detectWorkdayFields()
 * @param {Object}   values           - { firstName, lastName, email, … }
 * @returns {{ filled: string[], skipped: string[] }}
 */
function applyWorkdayValues(fieldMap, values) {
  const filled  = [];
  const skipped = [];

  for (const field of fieldMap.fields) {
    const val = values[field.key];

    if (val === undefined || val === null || field.type === 'file') {
      skipped.push(field.key);
      continue;
    }

    try {
      fillField(field.el, String(val));
      filled.push(field.key);
    } catch (err) {
      console.warn(`[workday.js] Could not fill field "${field.key}":`, err);
      skipped.push(field.key);
    }
  }

  return { filled, skipped };
}

// ─── Exports (MV3 content-script compatible) ─────────────────────────────────

// In MV3 content scripts there's no module system — attach to window or use
// a shared namespace. background.js / content.js can also import via
// chrome.scripting.executeScript({ files: ['sites/workday.js'] }).

window.__1stStep = window.__1stStep ?? {};
window.__1stStep.workday = {
  detectWorkdayFields,
  observeWorkdaySteps,
  applyWorkdayValues,
  // Expose low-level utilities for unit testing
  _deepQueryAll:  deepQueryAll,
  _deepQuery:     deepQuery,
  _resolveLabel:  resolveLabel,
  _canonicalKey:  canonicalKey,
  _fillField:     fillField,
};

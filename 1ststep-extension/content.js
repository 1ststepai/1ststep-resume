/**
 * content.js - Content Script
 * Detects job postings and notifies background service worker.
 */

// ─── SITE SELECTORS ──────────────────────────────────────────

const GREENHOUSE_SELECTORS = {
  jobDescriptionSelector: '#content .job-post, #app_body, .job-description, [class*="job-description"]',
  jobTitleSelector: 'h1',
  companySelector: '.company-name, .company, [itemprop="hiringOrganization"] [itemprop="name"]'
};

// ─── SITE DETECTION ──────────────────────────────────────────

function detectSite() {
  return /(?:^|\.)greenhouse\.io$/i.test(window.location.hostname) ? 'greenhouse' : 'unsupported';
}

const SITE = detectSite();
const SEL = GREENHOUSE_SELECTORS;
console.log(`[1stStep] Loaded on: ${SITE} | host=${location.hostname} | topFrame=${window === window.top}`);

// ─── EXTRACTION ──────────────────────────────────────────────

function extractText(selector) {
  const el = document.querySelector(selector);
  return el ? (el.innerText || el.textContent || '').trim() : null;
}

function extractJobDescription() {
  const text = extractText(SEL.jobDescriptionSelector);
  return text && text.length > 100 ? text : null;
}

// Parse page <title> when DOM selectors miss the job title.
// Common patterns: "Senior PM | Acme Corp", "Senior PM - Jobs at Acme", "Senior PM — LinkedIn"
function extractTitleFallback() {
  const raw = document.title || '';
  const cleaned = raw
    .replace(/\s*[-–|•]\s*(jobs?\s+at|careers?|greenhouse).*/i, '')
    .replace(/\s*\|\s*greenhouse.*/i, '')
    .trim();
  const parts = cleaned.split(/\s*[|\-–•]\s*/);
  return parts[0]?.trim() || null;
}

// Extract company when the DOM selector misses it.
function extractCompanyFallback() {
  // og:site_name (many job boards set this to the company name)
  const ogSite = document.querySelector('meta[property="og:site_name"]')?.content?.trim();
  if (ogSite && ogSite.length < 80) return ogSite;
  return null;
}

// Extract a specific line (0 = first, 1 = second) from job description text as last-resort fallback.
function extractFromJdLines(jd, lineIndex) {
  if (!jd) return null;
  const lines = jd.split('\n').map(l => l.trim()).filter(l => l.length > 1 && l.length < 120);
  const line = lines[lineIndex] || null;
  return line && line.length > 2 ? line : null;
}

// ─── JOB DETECTION ───────────────────────────────────────────

let detectedJob = null;

function pollForJob() {
  if (!chrome.runtime?.id) return;

  const jd = extractJobDescription();
  if (!jd) { detectedJob = null; removeTailorButton(); return; }

  // Skip if nothing changed
  if (detectedJob && jd === detectedJob.jobDescription && location.href === detectedJob.applyUrl) return;

  const rawTitle   = extractText(SEL.jobTitleSelector);
  const rawCompany = extractText(SEL.companySelector);
  const titleFallback   = extractTitleFallback()   || extractFromJdLines(jd, 0);
  const companyFallback = extractCompanyFallback() || extractFromJdLines(jd, 1);
  const jobTitle   = (rawTitle   && rawTitle.length   > 2 ? rawTitle   : titleFallback)   || 'Unknown Role';
  const company    = (rawCompany && rawCompany.length  > 2 ? rawCompany : companyFallback) || '';

  detectedJob = { site: SITE, jobTitle, company, jobDescription: jd, applyUrl: location.href };
  console.log(`[1stStep] Job detected: "${jobTitle}" at "${company}" (${SITE})`);

  // Pre-stage in background so popup and app tab can pick it up instantly
  chrome.runtime.sendMessage({ action: 'JOB_DETECTED', ...detectedJob }).catch(() => {});

  // Inject page-level button so user never has to open the popup
  injectTailorButton(detectedJob);
}

// ─── INJECTED TAILOR BUTTON ───────────────────────────────────

function removeTailorButton() {
  document.getElementById('1ststep-action-strip')?.remove();
}

function injectTailorButton(job) {
  if (document.getElementById('1ststep-action-strip')) return;
  if (!chrome.runtime?.id) return;
    const tailorLabel = 'Open in 1stStep';
    const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

    const strip = document.createElement('div');
    strip.id = '1ststep-action-strip';
    strip.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:2147483647',
      'display:flex', 'gap:8px', 'align-items:center',
      `font-family:${FONT}`,
    ].join(';');

    // ── Tailor button (primary) ──────────────────────────────
    const tailorBtn = document.createElement('button');
    tailorBtn.id = '1ststep-tailor-btn';
    tailorBtn.textContent = tailorLabel;
    tailorBtn.setAttribute('aria-label', '1stStep: Tailor resume for this job');
    tailorBtn.style.cssText = [
      'background:linear-gradient(135deg,#4F46E5,#6366F1)',
      'color:#fff', 'border:none', 'border-radius:10px',
      'padding:11px 18px', `font-family:${FONT}`,
      'font-size:13px', 'font-weight:700', 'cursor:pointer',
      'box-shadow:0 4px 20px rgba(99,102,241,0.45)',
      'transition:transform 0.15s,box-shadow 0.15s',
      'display:flex', 'align-items:center', 'gap:6px', 'white-space:nowrap',
    ].join(';');
    tailorBtn.onmouseover = () => { tailorBtn.style.transform = 'translateY(-2px)'; tailorBtn.style.boxShadow = '0 6px 28px rgba(99,102,241,0.55)'; };
    tailorBtn.onmouseout  = () => { tailorBtn.style.transform = ''; tailorBtn.style.boxShadow = '0 4px 20px rgba(99,102,241,0.45)'; };
    tailorBtn.onclick = () => {
      tailorBtn.textContent = 'Opening…';
      tailorBtn.disabled = true;
      chrome.runtime.sendMessage({ action: 'OPEN_IN_APP', jobData: job }, (response) => {
        if (!response?.success) { tailorBtn.textContent = tailorLabel; tailorBtn.disabled = false; }
      });
    };

    strip.appendChild(tailorBtn);
    document.body.appendChild(strip);
}

// ─── INIT ─────────────────────────────────────────────────────

// Detect once on page load
pollForJob();

// Re-detect on URL change — covers LinkedIn/Indeed SPA navigation
let lastUrl = location.href;
setInterval(() => {
  if (!chrome.runtime?.id) return;
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    detectedJob = null;
    removeTailorButton();
    setTimeout(pollForJob, 1500); // first attempt: most sites ready by now
    setTimeout(pollForJob, 4000); // second attempt: LinkedIn lazy-loads description panel
  }
}, 1000);

// ─── AUTOFILL — FIELD SCAN + FILL ─────────────────────────────

function getFieldLabel(el) {
  try {
    if (el.labels && el.labels.length) {
      return (el.labels[0].innerText || el.labels[0].textContent || '').trim();
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return (lbl.innerText || lbl.textContent || '').trim();
    }
    const parentLabel = el.closest('label');
    if (parentLabel) return (parentLabel.innerText || parentLabel.textContent || '').trim();
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();
  } catch (_) {}
  return '';
}

function isVisible(el) {
  if (el.tagName === 'SELECT') return true; // selects can be offscreen but still fillable
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || el.offsetParent !== null;
}

const BLOCKED_AUTOFILL_FIELD = /(?:social security|\bssn\b|tax(?:payer)? id|passport|driver'?s? licen[cs]e|date of birth|\bdob\b|\bage\b|gender|sex(?:ual)? orientation|race|ethnicity|religion|marital|disability|veteran|pronouns?|password|passcode|verification code|\botp\b|captcha|signature|e-?sign|certif(?:y|ication)|attest|consent|agree(?:ment)?|arbitration|background|consumer report|drug test|health screen|medical|outside employment|conflict of interest|citizen(?:ship)?|visa|sponsorship|export control|itar|security clearance|criminal|conviction|referral|restrictive agreement|salary acceptance|compensation acceptance|desired salary)/i;

function isBlockedAutofillField(el, label = '') {
  if (!el) return true;
  if (['password', 'hidden', 'file', 'checkbox', 'radio'].includes(String(el.type || '').toLowerCase())) return true;
  const description = [label, el.id, el.name, el.getAttribute?.('aria-label'), el.getAttribute?.('placeholder'), el.autocomplete]
    .filter(Boolean).join(' ');
  return BLOCKED_AUTOFILL_FIELD.test(description);
}

function scanFormFields() {
  const fields = [];
  const seen = new Set();
  // Password and file controls are included only as value-free schema so the server can
  // create a Needs You action. fillField() always refuses them.
  const selector =
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]), ' +
    'select, textarea';
  const elements = document.querySelectorAll(selector);

  for (const el of elements) {
    if (!isVisible(el)) continue;

    const label = getFieldLabel(el);
    const fieldRef = el.id || el.name || `field_${fields.length + 1}`;
    const semantic = `${el.name || ''} ${el.id || ''} ${label}`.toLowerCase();
    const fieldKey = String(el.type || '').toLowerCase() === 'file' && /(?:resume|résumé|curriculum vitae|\bcv\b)/.test(semantic) ? 'resumeDocument'
      : /first[ _-]?name/.test(semantic) ? 'firstName'
      : /last[ _-]?name/.test(semantic) ? 'lastName'
      : /e-?mail/.test(semantic) ? 'email'
      : /phone|mobile/.test(semantic) ? 'phone'
      : /postal|zip/.test(semantic) ? 'postalCode'
      : /\bstate\b|province/.test(semantic) ? 'state'
      : /\bcity\b/.test(semantic) ? 'city'
      : /linkedin/.test(semantic) ? 'linkedin'
      : /portfolio|website/.test(semantic) ? 'portfolio'
      : /current[ _-]?(?:company|employer)/.test(semantic) ? 'currentEmployer'
      : /current[ _-]?(?:title|position)/.test(semantic) ? 'currentTitle'
      : `unknownField${fields.length + 1}`;
    if (seen.has(fieldRef)) continue;
    seen.add(fieldRef);
    if (!el.id && !el.name) el.dataset.firststepFieldRef = fieldRef;

    const field = {
      fieldRef,
      fieldKey,
      inputType: el.type || el.tagName.toLowerCase(),
      label:    label.slice(0, 120),
      required: !!el.required
    };
    fields.push(field);
  }

  return fields.slice(0, 80); // cap to control token usage
}

function findElementByKey(key) {
  if (!key) return null;
  try {
    let el = document.getElementById(key);
    if (el) return el;
  } catch (_) {}
  try {
    let el = document.querySelector(`[name="${CSS.escape(key)}"]`);
    if (el) return el;
  } catch (_) {}
  try {
    let el = document.querySelector(`[aria-label="${CSS.escape(key)}"]`);
    if (el) return el;
  } catch (_) {}
  try {
    let el = document.querySelector(`[data-firststep-field-ref="${CSS.escape(key)}"]`);
    if (el) return el;
  } catch (_) {}
  // Fallback: scan for a field whose label matches
  const all = document.querySelectorAll('input, select, textarea');
  for (const el of all) {
    if (!isVisible(el)) continue;
    if ((el.id || el.name) === key) return el;
    const lbl = getFieldLabel(el);
    if (lbl && lbl.toLowerCase() === String(key).toLowerCase()) return el;
  }
  return null;
}

function fillField(el, value) {
  if (!el || value === null || value === undefined || value === '') return false;
  if (isBlockedAutofillField(el, getFieldLabel(el))) return false;
  try {
    const inputSetter    = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,    'value')?.set;
    const textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    const selectSetter   = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,   'value')?.set;
    const checkedSetter  = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,    'checked')?.set;

    if (el.tagName === 'SELECT') {
      const str = String(value).trim().toLowerCase();
      const opt =
        Array.from(el.options).find(o => (o.text || '').trim().toLowerCase() === str) ||
        Array.from(el.options).find(o => (o.value || '').trim().toLowerCase() === str) ||
        Array.from(el.options).find(o => (o.text || '').trim().toLowerCase().includes(str)) ||
        Array.from(el.options).find(o => str.includes((o.text || '').trim().toLowerCase()));
      if (!opt) return false;
      if (selectSetter) selectSetter.call(el, opt.value); else el.value = opt.value;
    } else if (el.tagName === 'TEXTAREA') {
      const v = String(value);
      if (textareaSetter) textareaSetter.call(el, v); else el.value = v;
    } else {
      const v = String(value).slice(0, 2000);
      if (inputSetter) inputSetter.call(el, v); else el.value = v;
    }

    // React/Vue/Angular synthetic event dispatch
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur',   { bubbles: true }));
    return true;
  } catch (err) {
    console.warn('[1stStep] fillField error:', err);
    return false;
  }
}

function applicationContext() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const sessionId = params.get('1ststep-session') || '';
  const version = Number(params.get('1ststep-version'));
  return /^[A-Za-z0-9:_-]{8,160}$/.test(sessionId) && Number.isSafeInteger(version) && version > 0 ? { sessionId, version } : null;
}

let pendingPrecisionHandoff = null;
const PRECISION_REVIEW_TTL_MS = 90 * 1000;

function decodeBase64Document(value) {
  const encoded = String(value || '');
  if (!encoded || encoded.length > 1_100_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('The approved résumé payload was invalid.');
  const binary = atob(encoded);
  if (!binary.length || binary.length > 800_000) throw new Error('The approved résumé payload was outside the safe size limit.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

async function fillApprovedResume(documentHandoff, preparedMetadata) {
  const payload = documentHandoff?.document;
  if (!payload || payload.fieldKey !== 'resumeDocument' || payload.fieldRef !== preparedMetadata?.fieldRef
    || payload.documentVersion !== preparedMetadata?.documentVersion || payload.filename !== preparedMetadata?.filename
    || payload.contentType !== 'application/pdf' || payload.sha256 !== preparedMetadata?.sha256
    || Number(payload.bytes) !== Number(preparedMetadata?.bytes)) return false;
  const el = findElementByKey(payload.fieldRef);
  if (!el || String(el.type || '').toLowerCase() !== 'file') return false;
  const bytes = decodeBase64Document(payload.contentBase64);
  try {
    if (bytes.length !== Number(payload.bytes) || await sha256Hex(bytes) !== String(payload.sha256).toLowerCase()) return false;
    const file = new File([bytes], payload.filename, { type: 'application/pdf', lastModified: Date.now() });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    el.files = transfer.files;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return el.files?.length === 1 && el.files[0]?.name === payload.filename && el.files[0]?.size === bytes.length;
  } finally {
    bytes.fill(0);
  }
}

// ─── MESSAGE HANDLERS ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // ── DETECT_JOB_NOW: popup requests the current detected job ──
  // Only respond from the top frame to prevent multiple responses from iframes.
  if (msg?.action === 'DETECT_JOB_NOW') {
    if (window !== window.top) { sendResponse({ success: false, job: null }); return false; }
    pollForJob();
    sendResponse({ success: true, job: detectedJob });
    return false;
  }

  if (msg?.action !== 'AUTOFILL') return;

  (async () => {
    try {
      const fields = scanFormFields();
      if (fields.length === 0) {
        sendResponse({ success: false, error: 'No form fields detected on this page.' });
        return;
      }

      const context = applicationContext();
      if (!context) {
        sendResponse({ success: false, error: 'Open this employer page from the saved 1stStep application workspace.' });
        return;
      }
      const precisionKey = `${context.sessionId}:${context.version}:${location.href}`;
      let response;
      if (msg.confirmPrecision === true && pendingPrecisionHandoff?.key === precisionKey && pendingPrecisionHandoff.expiresAt > Date.now()) {
        response = { success: true, data: pendingPrecisionHandoff.data };
        pendingPrecisionHandoff = null;
      } else {
        response = await new Promise((resolve) =>
          chrome.runtime.sendMessage({ action: 'PREPARE_GREENHOUSE_HANDOFF', payload: { ...context, pageUrl: location.href, fields } }, (r) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(r);
            }
          })
        );
      }

      if (!response?.success) {
        sendResponse({ success: false, error: response?.error || 'Autofill request failed.' });
        return;
      }
      if (response.data?.status === 'waiting-for-user') {
        sendResponse({ success: false, needsYou: true, error: 'This form has a question that needs you. Return to the 1stStep Needs You queue.' });
        return;
      }
      const matchAssessment = response.data?.matchAssessment;
      const credibleAssessment = Number.isInteger(matchAssessment?.confidenceScore)
        && matchAssessment.confidenceScore >= Number(matchAssessment.minimumAutofillScore)
        && matchAssessment.credibleInterviewPath === true
        && typeof matchAssessment.tailoringJustification === 'string'
        && matchAssessment.tailoringJustification.trim();
      if (!credibleAssessment) {
        pendingPrecisionHandoff = null;
        sendResponse({ success: false, needsYou: true, matchAssessment, error: 'This match needs review in 1stStep.ai before any fields are filled.' });
        return;
      }
      if (msg.confirmPrecision !== true) {
        pendingPrecisionHandoff = { key: precisionKey, data: response.data, expiresAt: Date.now() + PRECISION_REVIEW_TTL_MS };
        sendResponse({ success: true, reviewRequired: true, matchAssessment, filled: 0, submitted: false, receiptVerified: false });
        return;
      }
      const filledFieldKeys = [];
      const failedFieldKeys = [];
      let documentResponse = null;
      if (response.data?.document?.available === true) {
        documentResponse = await new Promise(resolve => chrome.runtime.sendMessage({
          action: 'GET_GREENHOUSE_DOCUMENT', payload: { handoffToken: response.data.handoffToken },
        }, r => resolve(chrome.runtime.lastError ? { success: false, error: chrome.runtime.lastError.message } : r)));
        if (!documentResponse?.success) failedFieldKeys.push('resumeDocument');
      }
      if (response.data?.document?.available === true && documentResponse?.success) {
        if (await fillApprovedResume(documentResponse.data, response.data.document)) filledFieldKeys.push('resumeDocument');
        else failedFieldKeys.push('resumeDocument');
      }
      if (!failedFieldKeys.includes('resumeDocument')) {
        for (const field of response.data?.fields || []) {
          const el = findElementByKey(field.fieldRef);
          if (el && fillField(el, field.value)) filledFieldKeys.push(field.fieldKey);
          else failedFieldKeys.push(field.fieldKey);
        }
      }
      const completion = await new Promise(resolve => chrome.runtime.sendMessage({
        action: 'COMPLETE_GREENHOUSE_HANDOFF',
        payload: { handoffToken: response.data.handoffToken, filledFieldKeys, failedFieldKeys },
      }, r => resolve(chrome.runtime.lastError ? { success: false, error: chrome.runtime.lastError.message } : r)));
      if (!completion?.success) {
        sendResponse({ success: false, error: completion?.error || 'The partial fill was preserved and moved to Needs You.' });
        return;
      }
      sendResponse({ success: true, matchAssessment, filled: filledFieldKeys.length, total: (response.data?.fields || []).length + (response.data?.document?.available === true ? 1 : 0), scanned: fields.length, submitted: false, receiptVerified: false });
    } catch (err) {
      console.error('[1stStep] AUTOFILL error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // keep channel open for async sendResponse
});

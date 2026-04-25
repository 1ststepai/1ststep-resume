/**
 * content.js - Content Script
 * Detects job postings and notifies background service worker.
 */

// ─── SITE SELECTORS ──────────────────────────────────────────

const SITE_SELECTORS = {
  linkedin: {
    jobDescriptionSelector: '.jobs-description__content, .jobs-description-content__text, .job-view-layout .jobs-box__html-content, [class*="jobs-description"], .jobs-details__main-content',
    jobTitleSelector: '.jobs-unified-top-card__job-title h1, .job-details-jobs-unified-top-card__job-title h1, h1.t-24, h1',
    companySelector: '.jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__subtitle-primary-grouping a'
  },
  indeed: {
    jobDescriptionSelector: '#jobDescriptionText, .jobsearch-jobDescriptionText, [data-testid="jobsearch-JobComponent-description"]',
    jobTitleSelector: 'h1.jobsearch-JobInfoHeader-title, h1[data-testid="jobsearch-JobInfoHeader-title"]',
    companySelector: '[data-testid="inlineHeader-companyName"] a, [data-testid="jobsearch-JobInfoHeader-companyNameSimple"]'
  },
  greenhouse: {
    jobDescriptionSelector: '#content .job-post, #app_body, .job-description, [class*="job-description"]',
    jobTitleSelector: 'h1.app-title, h1',
    companySelector: '.company-name, .company'
  },
  lever: {
    // Company extracted via URL fallback in extractCompanyFallback() — the DOM selector
    // .sort-by-team returns the team name, not the company.
    jobDescriptionSelector: '.posting-content, .posting-description, .section-wrapper',
    jobTitleSelector: 'h2[data-qa="posting-name"], .posting-headline h2',
    companySelector: '.main-header-logo[alt]'
  },
  workday: {
    jobDescriptionSelector: '[data-automation-id="jobPostingDescription"], [class*="jobPostingDescription"]',
    jobTitleSelector: '[data-automation-id="jobPostingHeader"] h2, [data-automation-id="jobPostingHeader"] h1',
    companySelector: '[data-automation-id="jobPostingCompanyName"], [data-automation-id="jobPostingHeader"] [class*="subtitle"]'
  },
  icims: {
    jobDescriptionSelector: '.iCIMS_JobContent, #jobContentArea, .job-details',
    jobTitleSelector: '.iCIMS_Header h1, h1',
    companySelector: '.iCIMS_EmployerInfo, .employer-name'
  }
};

const GENERIC_SELECTORS = {
  jobDescriptionSelector: [
    '#job-description', '.job-description', '.jobDescription',
    '[class*="job-description"]', '[class*="jobDescription"]',
    '[id*="job-description"]', '[id*="jobDescription"]',
    '[data-testid="job-details"]', '[data-testid="job-description"]',
    '.job-details', '.posting-description', 'section[class*="description"]'
  ].join(', '),
  jobTitleSelector: 'h1',
  companySelector: '[data-testid="companyName"], .company-name, [class*="company-name"], [itemprop="hiringOrganization"] [itemprop="name"]'
};

// ─── SITE DETECTION ──────────────────────────────────────────

function detectSite() {
  const h = window.location.hostname;
  if (h.includes('linkedin.com')) return 'linkedin';
  if (h.includes('indeed.com')) return 'indeed';
  if (h.includes('greenhouse.io')) return 'greenhouse';
  if (h.includes('lever.co') || h.includes('lever.com')) return 'lever';
  if (h.includes('workday.com')) return 'workday';
  if (h.includes('icims.com')) return 'icims';
  return 'unknown';
}

const SITE = detectSite();
const SEL = SITE_SELECTORS[SITE] || GENERIC_SELECTORS;
console.log(`[1stStep] Loaded on: ${SITE} | host=${location.hostname} | topFrame=${window === window.top}`);

// ─── EXTRACTION ──────────────────────────────────────────────

function extractText(selector) {
  const el = document.querySelector(selector);
  return el ? (el.innerText || el.textContent || '').trim() : null;
}

function extractJobDescription() {
  // For LinkedIn, try expanding collapsed "See more" before reading text
  if (SITE === 'linkedin') {
    const expandBtn = document.querySelector(
      'button.jobs-description__footer-button, ' +
      'button[aria-label*="more"], ' +
      '.jobs-description-content__toggle-btn-more, ' +
      '.jobs-description__toggle-btn'
    );
    if (expandBtn) {
      try { expandBtn.click(); } catch (_) {}
    }

    // Check inside iframe (job view sometimes rendered there)
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentDocument) {
      try {
        const iframeEl = iframe.contentDocument.querySelector(SEL.jobDescriptionSelector);
        if (iframeEl) {
          const text = (iframeEl.innerText || iframeEl.textContent || '').trim();
          if (text.length > 100) return text;
        }
      } catch (_) {} // cross-origin guard
    }
  }
  const text = extractText(SEL.jobDescriptionSelector);
  return text && text.length > 100 ? text : null;
}

// Parse page <title> when DOM selectors miss the job title.
// Common patterns: "Senior PM | Acme Corp", "Senior PM - Jobs at Acme", "Senior PM — LinkedIn"
function extractTitleFallback() {
  const raw = document.title || '';
  const cleaned = raw
    .replace(/\s*[-–|•]\s*(jobs?\s+at|careers?|linkedin|indeed|glassdoor).*/i, '')
    .replace(/\s*\|\s*(linkedin|indeed|glassdoor|greenhouse|lever|workday).*/i, '')
    .trim();
  const parts = cleaned.split(/\s*[|\-–•]\s*/);
  return parts[0]?.trim() || null;
}

// Extract company when the DOM selector misses it.
function extractCompanyFallback() {
  // Lever: URL pattern is https://jobs.lever.co/company-slug/uuid
  if (SITE === 'lever') {
    const m = location.pathname.match(/^\/([^/]+)\//);
    if (m) return m[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  // og:site_name (many job boards set this to the company name)
  const ogSite = document.querySelector('meta[property="og:site_name"]')?.content?.trim();
  if (ogSite && ogSite.length < 80) return ogSite;
  return null;
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
  const jobTitle   = (rawTitle   && rawTitle.length   > 2 ? rawTitle   : extractTitleFallback())   || '';
  const company    = (rawCompany && rawCompany.length  > 2 ? rawCompany : extractCompanyFallback()) || '';

  detectedJob = { site: SITE, jobTitle, company, jobDescription: jd, applyUrl: location.href };
  console.log(`[1stStep] Job detected: "${jobTitle}" at "${company}" (${SITE})`);

  // Pre-stage in background so popup and app tab can pick it up instantly
  chrome.runtime.sendMessage({ action: 'JOB_DETECTED', ...detectedJob }).catch(() => {});

  // Inject page-level button so user never has to open the popup
  injectTailorButton(detectedJob);
}

// ─── INJECTED TAILOR BUTTON ───────────────────────────────────

function removeTailorButton() {
  document.getElementById('1ststep-tailor-btn')?.remove();
}

function injectTailorButton(job) {
  if (document.getElementById('1ststep-tailor-btn')) return; // already present

  chrome.storage.sync.get(['1ststep_resume'], (data) => {
    if (!chrome.runtime?.id) return;
    const hasResume = !!(data['1ststep_resume']);
    const label = hasResume ? '⚡ Tailor Resume' : '⚡ Tailor with 1stStep';

    const btn = document.createElement('button');
    btn.id = '1ststep-tailor-btn';
    btn.textContent = label;
    btn.setAttribute('aria-label', '1stStep: Tailor resume for this job');
    btn.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:2147483647',
      'background:linear-gradient(135deg,#4F46E5,#6366F1)',
      'color:#fff', 'border:none', 'border-radius:10px',
      'padding:11px 18px',
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      'font-size:13px', 'font-weight:700', 'cursor:pointer',
      'box-shadow:0 4px 20px rgba(99,102,241,0.45)',
      'transition:transform 0.15s,box-shadow 0.15s',
      'display:flex', 'align-items:center', 'gap:6px', 'white-space:nowrap',
    ].join(';');

    btn.onmouseover = () => {
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 6px 28px rgba(99,102,241,0.55)';
    };
    btn.onmouseout = () => {
      btn.style.transform = '';
      btn.style.boxShadow = '0 4px 20px rgba(99,102,241,0.45)';
    };

    btn.onclick = () => {
      btn.textContent = 'Opening…';
      btn.disabled = true;
      chrome.runtime.sendMessage({ action: 'OPEN_IN_APP', jobData: job }, (response) => {
        if (!response?.success) {
          btn.textContent = label;
          btn.disabled = false;
        }
      });
    };

    document.body.appendChild(btn);
  });
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

function scanFormFields() {
  const fields = [];
  const seen = new Set();
  // Excludes file inputs — resume/cover-letter upload is left to the user per product choice.
  // Also excludes buttons, images, and password fields for obvious reasons.
  const selector =
    'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]):not([type=password]):not([type=file]), ' +
    'select, textarea';
  const elements = document.querySelectorAll(selector);

  for (const el of elements) {
    if (!isVisible(el)) continue;

    // Build a stable key — id > name > label > type
    const label = getFieldLabel(el);
    const key = el.id || el.name || label || (el.type + ':' + fields.length);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const field = {
      id:       el.id || '',
      name:     el.name || '',
      key:      key,
      type:     el.type || el.tagName.toLowerCase(),
      label:    label.slice(0, 120),
      required: !!el.required
    };

    if (el.tagName === 'SELECT') {
      field.options = Array.from(el.options)
        .map(o => (o.text || o.value || '').trim())
        .filter(Boolean)
        .slice(0, 50);
    }

    fields.push(field);
  }

  return fields.slice(0, 80); // cap to control token usage
}

function findElementByKey(key) {
  if (!key) return null;
  // Try id, name, aria-label, then iterate inputs matching the key as label
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
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      const v = String(value).toLowerCase();
      const checked = v === 'true' || v === 'yes' || v === '1' || v === 'on';
      if (checkedSetter) checkedSetter.call(el, checked); else el.checked = checked;
    } else {
      const v = String(value);
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

function applyFillMap(fillMap) {
  let filled = 0;
  let total  = 0;
  for (const [key, value] of Object.entries(fillMap || {})) {
    if (value === null || value === undefined || value === '') continue;
    total++;
    const el = findElementByKey(key);
    if (!el) continue;
    if (fillField(el, value)) filled++;
  }
  return { filled, total };
}

function parseClaudeAutofillResponse(data) {
  // Anthropic response shape: { content: [{type: 'text', text: '...'}], ... }
  const text = data?.content?.[0]?.text || '';
  // Strip optional markdown fences
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Last-ditch: extract first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) {}
    }
    throw new Error('AI response was not valid JSON.');
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

      // Read profile + resume from chrome.storage.sync (written by auth-bridge.js)
      const storage = await new Promise((resolve) =>
        chrome.storage.sync.get(['1ststep_profile', '1ststep_resume'], resolve)
      );
      const profile = storage['1ststep_profile'] || {};
      const resume  = storage['1ststep_resume']  || '';

      // Ask background service worker to POST /api/claude (callType: autofill)
      const response = await new Promise((resolve) =>
        chrome.runtime.sendMessage(
          {
            action:    'GET_AUTOFILL_MAP',
            profile,
            resume,
            fields,
            email:     msg.email,
            tierToken: msg.tierToken
          },
          (r) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(r);
            }
          }
        )
      );

      if (!response?.success) {
        sendResponse({ success: false, error: response?.error || 'Autofill request failed.' });
        return;
      }

      let fillMap;
      try {
        fillMap = parseClaudeAutofillResponse(response.data);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
        return;
      }

      const { filled, total } = applyFillMap(fillMap);
      sendResponse({ success: true, filled, total, scanned: fields.length });
    } catch (err) {
      console.error('[1stStep] AUTOFILL error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // keep channel open for async sendResponse
});

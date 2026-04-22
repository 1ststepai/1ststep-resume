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
    jobDescriptionSelector: '#jobDescriptionText, .jobsearch-jobDescriptionText',
    jobTitleSelector: 'h1.jobsearch-JobInfoHeader-title',
    companySelector: '[data-testid="inlineHeader-companyName"] a'
  },
  greenhouse: {
    jobDescriptionSelector: '#content .job-post, #app_body',
    jobTitleSelector: 'h1.app-title',
    companySelector: '.company-name'
  },
  lever: {
    jobDescriptionSelector: '.section-wrapper, .posting-content',
    jobTitleSelector: 'h2[data-qa="posting-name"]',
    companySelector: '.posting-headline .sort-by-team'
  },
  workday: {
    jobDescriptionSelector: '[data-automation-id="jobPostingDescription"]',
    jobTitleSelector: '[data-automation-id="jobPostingHeader"] h2',
    companySelector: '[data-automation-id="jobPostingHeader"] [class*="subtitle"]'
  },
  icims: {
    jobDescriptionSelector: '.iCIMS_JobContent, #jobContentArea',
    jobTitleSelector: '.iCIMS_Header h1',
    companySelector: '.iCIMS_EmployerInfo'
  }
};

const GENERIC_SELECTORS = {
  jobDescriptionSelector: '#job-description, .job-description, .description, [data-testid="job-details"], main article',
  jobTitleSelector: 'h1',
  companySelector: '[data-testid="companyName"], .company-name'
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
console.log(`[1stStep] Loaded on: ${SITE}`);

// ─── EXTRACTION ──────────────────────────────────────────────

function extractText(selector) {
  const el = document.querySelector(selector);
  return el ? (el.innerText || el.textContent || '').trim() : null;
}

function extractJobDescription() {
  // For LinkedIn, search inside the iframe too
  if (SITE === 'linkedin') {
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentDocument) {
      const iframeEl = iframe.contentDocument.querySelector(SEL.jobDescriptionSelector);
      if (iframeEl) {
        const text = (iframeEl.innerText || iframeEl.textContent || '').trim();
        if (text.length > 100) return text;
      }
    }
  }
  const text = extractText(SEL.jobDescriptionSelector);
  return text && text.length > 100 ? text : null;
}

// ─── JOB DETECTION ───────────────────────────────────────────

let lastDetectedJD = null;
let isSending = false;

function pollForJob() {
  // Don't send if extension context is gone
  if (!chrome.runtime?.id) return;
  if (isSending) return;

  const jd = extractJobDescription();
  if (!jd || jd === lastDetectedJD) return;

  lastDetectedJD = jd;
  isSending = true;

  const jobTitle = extractText(SEL.jobTitleSelector);
  const company = extractText(SEL.companySelector);

  console.log(`[1stStep] Job detected: "${jobTitle}" at "${company}"`);

  chrome.runtime.sendMessage({
    action: 'JOB_DETECTED',
    site: SITE,
    jobTitle,
    company,
    jobDescription: jd,
    applyUrl: window.location.href
  }, (response) => {
    isSending = false;
    if (chrome.runtime.lastError) return; // Extension reloaded - ignore
  });
}

// ─── INIT ─────────────────────────────────────────────────────

// Poll on interval only (no MutationObserver spam)
pollForJob();
setInterval(() => {
  if (!chrome.runtime?.id) return; // Stop if extension reloaded
  pollForJob();
}, 3000);

// For LinkedIn SPA: re-poll when URL changes (job selection)
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    lastDetectedJD = null; // Reset so new job gets detected
    setTimeout(pollForJob, 1500); // Wait for content to render
  }
}, 1000);

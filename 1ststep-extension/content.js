/**
 * content.js - Content Script
 * Runs on job pages. Detects job description, identifies apply forms, enables auto-fill.
 * Dynamically imports site-specific selectors based on detected domain.
 */

const APP_URL = 'https://app.1ststep.ai';

// ─── SITE DETECTION ──────────────────────────────────────────

function detectSite() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('linkedin.com')) return 'linkedin';
  if (hostname.includes('indeed.com')) return 'indeed';
  if (hostname.includes('greenhouse.io')) return 'greenhouse';
  if (hostname.includes('lever.co') || hostname.includes('lever.com')) return 'lever';
  if (hostname.includes('workday.com')) return 'workday';
  if (hostname.includes('icims.com')) return 'icims';
  if (hostname.includes('taleo.net')) return 'taleo';
  
  return 'unknown';
}

const SITE = detectSite();

// ─── DYNAMIC SITE SELECTOR IMPORT ──────────────────────────────

let SiteSelectors = null;

async function loadSiteSelectors() {
  if (SITE === 'unknown') {
    console.log('[1stStep] Site not recognized, using generic fallback');
    SiteSelectors = getGenericSelectors();
    return;
  }
  
  try {
    // Dynamically import site-specific module
    const module = await import(chrome.runtime.getURL(`sites/${SITE}.js`));
    SiteSelectors = module.default;
    console.log(`[1stStep] Loaded selectors for ${SITE}`);
  } catch (error) {
    console.warn(`[1stStep] Failed to load ${SITE} selectors:`, error);
    SiteSelectors = getGenericSelectors();
  }
}

// ─── JOB DESCRIPTION EXTRACTION ──────────────────────────────

function extractJobDescription() {
  if (!SiteSelectors || !SiteSelectors.jobDescriptionSelector) {
    return null;
  }
  
  const element = document.querySelector(SiteSelectors.jobDescriptionSelector);
  if (!element) return null;
  
  const text = element.innerText || element.textContent;
  return text.trim();
}

// ─── JOB METADATA EXTRACTION ────────────────────────────────

function extractJobMetadata() {
  if (!SiteSelectors) return {};
  
  const metadata = {
    site: SITE,
    jobId: null,
    jobTitle: null,
    company: null,
    applyUrl: window.location.href
  };
  
  // Try to extract job title
  if (SiteSelectors.jobTitleSelector) {
    const titleEl = document.querySelector(SiteSelectors.jobTitleSelector);
    if (titleEl) metadata.jobTitle = titleEl.innerText?.trim();
  }
  
  // Try to extract company
  if (SiteSelectors.companySelector) {
    const companyEl = document.querySelector(SiteSelectors.companySelector);
    if (companyEl) metadata.company = companyEl.innerText?.trim();
  }
  
  return metadata;
}

// ─── POLL FOR JOB DETECTION ────────────────────────────────

let lastDetectedJD = null;

async function pollForJob() {
  const jd = extractJobDescription();
  
  if (jd && jd !== lastDetectedJD) {
    lastDetectedJD = jd;
    
    const metadata = extractJobMetadata();
    
    // Notify background script - job detected
    chrome.runtime.sendMessage({
      action: 'JOB_DETECTED',
      site: SITE,
      jobId: metadata.jobId,
      jobTitle: metadata.jobTitle,
      company: metadata.company,
      jobDescription: jd,
      applyUrl: window.location.href
    }, (response) => {
      if (response?.success) {
        console.log(`[1stStep] Job detected on ${SITE}: ${metadata.jobTitle || 'Unknown'}`);
      }
    });
  }
}

// ─── AUTO-FILL INJECTION ──────────────────────────────────────

/**
 * Injects auto-fill UI (button or badge) into the page
 * Allows user to trigger the autofill flow without leaving the page
 */
function injectAutoFillUI() {
  if (!SiteSelectors || !SiteSelectors.applyButtonSelector) {
    return;
  }
  
  const applyBtn = document.querySelector(SiteSelectors.applyButtonSelector);
  if (!applyBtn) return;
  
  // Check if we already injected
  if (document.getElementById('1ststep-autofill-badge')) {
    return;
  }
  
  // Create badge/button
  const badge = document.createElement('div');
  badge.id = '1ststep-autofill-badge';
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #4fffb0;
    color: #0b0d11;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    margin-left: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  `;
  badge.innerText = '✨ Auto-fill with 1stStep';
  
  badge.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'SHOW_AUTOFILL_FLOW' }, (response) => {
      if (response?.success) {
        console.log('[1stStep] Autofill flow initiated');
      }
    });
  });
  
  applyBtn.parentElement?.appendChild(badge);
  console.log('[1stStep] Injected auto-fill UI');
}

// ─── GENERIC SELECTORS (FALLBACK) ──────────────────────────

function getGenericSelectors() {
  return {
    jobDescriptionSelector: [
      '[data-testid="job-details"]',
      '.job-description',
      '.job-details',
      '[role="main"] article',
      'main article'
    ].join(', '),
    jobTitleSelector: 'h1, [data-testid="jobTitle"]',
    companySelector: '[data-testid="companyName"], .company-name, [role="heading"]',
    applyButtonSelector: 'button[aria-label*="pply"], button:contains("Apply")'
  };
}

// ─── INITIALIZATION ────────────────────────────────────────

async function init() {
  console.log(`[1stStep] Content script loaded on ${SITE}`);
  
  await loadSiteSelectors();
  
  // Poll for job every 2 seconds
  setInterval(pollForJob, 2000);
  
  // Inject auto-fill UI after 1 second (page render)
  setTimeout(injectAutoFillUI, 1000);
  
  // Re-inject UI if DOM changes (SPA navigation)
  const observer = new MutationObserver(() => {
    injectAutoFillUI();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

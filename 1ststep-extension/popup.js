/**
 * popup.js - Self-contained, no ES module imports
 */

const APP_URL = 'https://app.1ststep.ai';

// Keep in sync with background.js MODES
const MODES = { TAILOR: 'tailor', COVER_LETTER: 'coverLetter' };

const statusBadge    = document.getElementById('statusBadge');
const loadingState   = document.getElementById('loadingState');
const unauthState    = document.getElementById('unauthState');
const jobState       = document.getElementById('jobState');
const jobCard        = document.getElementById('jobCard');
const emptyState     = document.getElementById('emptyState');
const jobTitleEl     = document.getElementById('jobTitle');
const companyEl      = document.getElementById('company');
const siteEl         = document.getElementById('site');
const tailorBtn      = document.getElementById('tailorBtn');
const autofillBtn    = document.getElementById('autofillBtn');
const autofillEmptyBtn = document.getElementById('autofillEmptyBtn');
const openAppLink    = document.getElementById('openAppLink');

// ─── AUTH ────────────────────────────────────────────────────

async function checkAuth() {
  return new Promise(resolve => chrome.runtime.sendMessage({ action: 'GET_JOB_AGENT_STATUS' }, response => {
    const capabilities = response?.data?.capabilities || response?.data || {};
    resolve({ isAuthenticated: response?.success === true && capabilities.jobAgentAccess === true, tier: capabilities.tier || 'controlled-beta' });
  }));
}

// ─── INIT ────────────────────────────────────────────────────

async function init() {
  try {
    const auth = await checkAuth();

    if (!auth.isAuthenticated) {
      showUnauthState();
      return;
    }

    statusBadge.textContent = 'Agent Connected';
    statusBadge.classList.add('authenticated');

    const job = await getCurrentJob();
    if (job) {
      showJobCard(job, auth);
    } else {
      showEmptyState(auth);
    }
  } catch (err) {
    console.error('[1stStep] Init error:', err);
    showEmptyState(null);
  } finally {
    loadingState.style.display = 'none';
  }
}

// ─── STATES ──────────────────────────────────────────────────

function showUnauthState() {
  loadingState.style.display = 'none';
  unauthState.style.display  = 'block';
  jobState.style.display     = 'none';
  statusBadge.textContent    = 'Sign In';
  openAppLink.addEventListener('click', () => chrome.tabs.create({ url: `${APP_URL}/app` }));
}

function showEmptyState(auth) {
  loadingState.style.display = 'none';
  jobState.style.display     = 'block';
  jobCard.classList.remove('visible');
  emptyState.style.display   = 'flex';

  // Wire manual paste → open in app
  const manualOpenBtn = document.getElementById('manualOpenBtn');
  if (manualOpenBtn) {
    manualOpenBtn.onclick = () => {
      const jd = document.getElementById('manualJdInput')?.value?.trim();
      if (!jd) { manualOpenBtn.textContent = 'Paste a description first'; setTimeout(() => { manualOpenBtn.textContent = 'Open in 1stStep.ai'; }, 2000); return; }
      openInApp({ jobTitle: '', company: '', jobDescription: jd, applyUrl: '', site: 'manual' }, manualOpenBtn);
    };
  }

  // Auto-fill still works without a detected job
  if (autofillEmptyBtn && auth) {
    autofillEmptyBtn.onclick = () => autofillPage(auth, autofillEmptyBtn);
  } else if (autofillEmptyBtn) {
    autofillEmptyBtn.style.display = 'none';
  }
}

function showJobCard(job, auth) {
  loadingState.style.display = 'none';
  jobState.style.display     = 'block';
  jobCard.classList.add('visible');
  emptyState.style.display   = 'none';

  const titleMissing = !job.jobTitle || job.jobTitle === 'Unknown Role';

  jobTitleEl.textContent = job.jobTitle || 'Unknown Role';
  companyEl.textContent  = job.company  || '';
  siteEl.textContent     = (job.site    || 'unknown').toUpperCase();

  const jobUrlEl      = document.getElementById('jobUrl');
  const jobInfoForm   = document.getElementById('jobInfoForm');
  const jobTitleInput = document.getElementById('jobTitleInput');
  const companyInput  = document.getElementById('companyInput');
  const editJobBtn    = document.getElementById('editJobBtn');

  if (jobUrlEl && job.applyUrl) {
    jobUrlEl.textContent = job.applyUrl.replace(/^https?:\/\//, '').slice(0, 50) + (job.applyUrl.length > 55 ? '…' : '');
    jobUrlEl.title = job.applyUrl;
    jobUrlEl.style.display = 'block';
  }

  // Fit scoring is account-backed and shown in 1stStep; the extension never invents a local estimate.
  const matchPct = null;
  const matchLine = document.getElementById('matchLine');
  const matchPctEl = document.getElementById('matchPct');
  if (matchPct !== null && matchLine && matchPctEl) {
    matchPctEl.textContent = `~${matchPct}% match`;
    matchLine.style.display = 'block';
  }

  // Pre-fill inputs
  if (jobTitleInput) jobTitleInput.value = titleMissing ? '' : (job.jobTitle || '');
  if (companyInput)  companyInput.value  = job.company || '';

  // Show edit form immediately if title unknown; show edit link otherwise
  if (jobInfoForm) jobInfoForm.style.display = titleMissing ? 'block' : 'none';
  if (editJobBtn)  editJobBtn.style.display  = titleMissing ? 'none'  : 'inline';

  if (editJobBtn) {
    editJobBtn.onclick = () => {
      const open = jobInfoForm.style.display === 'none';
      jobInfoForm.style.display = open ? 'block' : 'none';
      if (open && jobTitleInput) jobTitleInput.focus();
    };
  }

  // Sync display labels when user edits inputs
  if (jobTitleInput) jobTitleInput.oninput = () => { jobTitleEl.textContent = jobTitleInput.value.trim() || 'Unknown Role'; };
  if (companyInput)  companyInput.oninput  = () => { companyEl.textContent  = companyInput.value.trim(); };

  if (autofillBtn) autofillBtn.onclick = () => autofillPage(auth, autofillBtn);

  // The authoritative tracker lives in the account-backed application workflow.
  renderTrackerStatus(job);

  function buildJob() {
    const title   = jobTitleInput?.value.trim() || job.jobTitle || '';
    const company = companyInput?.value.trim()  || job.company  || '';
    return { ...job, jobTitle: title, company };
  }

  function validateAndOpen(btn) {
    const title = jobTitleInput?.value.trim() || job.jobTitle || '';
    if (!title || title === 'Unknown Role') {
      if (jobInfoForm) jobInfoForm.style.display = 'block';
      if (jobTitleInput) {
        jobTitleInput.classList.add('required-error');
        jobTitleInput.focus();
        jobTitleInput.placeholder = 'Job Title is required';
      }
      return;
    }
    if (jobTitleInput) jobTitleInput.classList.remove('required-error');
    openInApp(buildJob(), btn);
  }

  tailorBtn.onclick = () => validateAndOpen(tailorBtn);

  const coverLetterBtn = document.getElementById('coverLetterBtn');
  if (coverLetterBtn) {
    coverLetterBtn.onclick = () => {
      const title = jobTitleInput?.value.trim() || job.jobTitle || '';
      if (!title || title === 'Unknown Role') {
        if (jobInfoForm) jobInfoForm.style.display = 'block';
        if (jobTitleInput) { jobTitleInput.classList.add('required-error'); jobTitleInput.focus(); }
        return;
      }
      if (jobTitleInput) jobTitleInput.classList.remove('required-error');
      openInApp(buildJob(), coverLetterBtn, MODES.COVER_LETTER);
    };
  }

}

// ─── TRACKER STATUS ──────────────────────────────────────────

async function renderTrackerStatus(job) {
  const strip = document.getElementById('trackerStrip');
  if (strip) strip.style.display = 'none';
}

// ─── MATCH ESTIMATE ──────────────────────────────────────────

// ─── JOB ─────────────────────────────────────────────────────

async function getCurrentJob() {
  // 1. Ask the active tab's content script directly — freshest signal.
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const result = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: 'DETECT_JOB_NOW' }, { frameId: 0 }, (r) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(r?.job || null);
        });
      });
      if (result) return result;
    }
  } catch (_) {}

  // 2. Fall back to background cache (e.g. tab without content script).
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'GET_CURRENT_JOB' }, (response) => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(response?.job || null);
    });
  });
}

// ─── OPEN IN APP ─────────────────────────────────────────────

async function openInApp(job, btn, mode = 'tailor') {
  btn = btn || tailorBtn;
  const originalLabel = btn.textContent;
  btn.disabled    = true;
  btn.textContent = 'Opening…';

  if (!job.jobDescription?.trim()) {
    btn.textContent = 'No job description found';
    setTimeout(() => { btn.textContent = originalLabel; btn.disabled = false; }, 2500);
    return;
  }

  const jobData = {
    jobTitle:        job.jobTitle        || '',
    company:         job.company         || '',
    jobDescription:  job.jobDescription,
    applyUrl:        job.applyUrl        || '',
    site:            job.site            || 'unknown'
  };

  chrome.runtime.sendMessage({ action: 'OPEN_IN_APP', jobData, mode }, (response) => {
    if (chrome.runtime.lastError) {
      btn.textContent = 'Extension error — try reloading';
      setTimeout(() => { btn.textContent = originalLabel; btn.disabled = false; }, 3000);
      return;
    }
    if (!response?.success) {
      btn.textContent = 'Could not open app — try again';
      setTimeout(() => { btn.textContent = originalLabel; btn.disabled = false; }, 3000);
      return;
    }
    // Tab is now opening — popup closes naturally
  });
}

// ─── AUTOFILL ────────────────────────────────────────────────

async function autofillPage(auth, btn) {
  // `btn` is whichever button triggered this — falls back to autofillBtn so existing callers still work
  btn = btn || autofillBtn;
  const originalLabel = btn.textContent;

  btn.disabled    = true;
  btn.textContent = 'Filling...';

  try {
    // Target the active tab (where the job application form lives)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');

    // Ask the content script to scan + fill
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { action: 'AUTOFILL' },
        (r) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(r);
          }
        }
      );
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Autofill failed.');
    }

    btn.textContent = `✓ ${response.filled}/${response.total}`;
    setTimeout(() => {
      btn.textContent = originalLabel;
      btn.disabled    = false;
    }, 3000);
  } catch (err) {
    console.error('[1stStep] Autofill error:', err);
    btn.textContent = 'Autofill failed — try again';
    setTimeout(() => { btn.textContent = originalLabel; btn.disabled = false; }, 3000);
  }
}

// ─── START ───────────────────────────────────────────────────

init();

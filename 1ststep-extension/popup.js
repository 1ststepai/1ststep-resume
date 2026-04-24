/**
 * popup.js - Self-contained, no ES module imports
 */

const APP_URL = 'https://app.1ststep.ai';

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
  return new Promise((resolve) => {
    chrome.storage.sync.get(['1ststep_profile', '1ststep_resume'], (data) => {
      const profile = data['1ststep_profile'];
      const resume  = data['1ststep_resume'];
      resolve({
        isAuthenticated: !!(profile && profile.email),
        email:    profile?.email   || '',
        tier:     profile?.tier    || 'free',
        tierToken: profile?.tierToken || '',
        resume:   resume || ''
      });
    });
  });
}

// ─── INIT ────────────────────────────────────────────────────

async function init() {
  try {
    const auth = await checkAuth();

    if (!auth.isAuthenticated) {
      showUnauthState();
      return;
    }

    statusBadge.textContent = auth.tier === 'complete' ? 'Complete' :
                              auth.tier === 'essential' ? 'Essential' : 'Free';
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
  openAppLink.addEventListener('click', () => chrome.tabs.create({ url: APP_URL }));
}

function showEmptyState(auth) {
  loadingState.style.display = 'none';
  jobState.style.display     = 'block';
  jobCard.classList.remove('visible');
  emptyState.style.display   = 'flex';

  // Auto-fill is still useful even without a detected job — any form on the page can be filled.
  if (autofillEmptyBtn && auth) {
    autofillEmptyBtn.onclick = () => autofillPage(auth, autofillEmptyBtn);
  }
}

function showJobCard(job, auth) {
  loadingState.style.display = 'none';
  jobState.style.display     = 'block';
  jobCard.classList.add('visible');
  emptyState.style.display   = 'none';

  jobTitleEl.textContent = job.jobTitle || 'Unknown Role';
  companyEl.textContent  = job.company  || 'Unknown Company';
  siteEl.textContent     = (job.site    || 'unknown').toUpperCase();

  // Show upgrade notice if free tier
  if (auth.tier === 'free') {
    tailorBtn.title = 'Tailor Resume requires an active subscription';
  }

  tailorBtn.onclick   = () => tailorResume(job, auth);
  autofillBtn.onclick = () => autofillPage(auth, autofillBtn);
}

// ─── JOB ─────────────────────────────────────────────────────

async function getCurrentJob() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'GET_CURRENT_JOB' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[1stStep] Error getting current job:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(response?.job || null);
    });
  });
}

// ─── TAILOR ──────────────────────────────────────────────────

async function tailorResume(job, auth) {
  if (!auth.resume) {
    alert('No resume found. Please add your resume at app.1ststep.ai first.');
    return;
  }

  if (auth.tier === 'free') {
    if (!confirm('Resume tailoring requires a paid subscription. Open 1stStep.ai to upgrade?')) return;
    chrome.tabs.create({ url: APP_URL });
    return;
  }

  tailorBtn.disabled    = true;
  tailorBtn.textContent = 'Tailoring...';

  try {
    // Get a fresh tier token from the backend first
    const subRes = await fetch(
      `${APP_URL}/api/subscription?email=${encodeURIComponent(auth.email)}`
    );
    if (!subRes.ok) {
      throw new Error(`Failed to fetch subscription status: ${subRes.statusText}`);
    }
    const subData = await subRes.json();
    const tierToken = subData.tierToken || auth.tierToken;

    const response = await fetch(`${APP_URL}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:     'claude-sonnet-4-6',
        callType:  'tailor',
        userEmail: auth.email,
        tierToken: tierToken,
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `Please tailor my resume for this job posting.\n\n<resume>\n${auth.resume}\n</resume>\n\n<job_description>\n${job.jobDescription}\n</job_description>`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Error ${response.status}`);
    }

    const result = await response.json();
    const text   = result.content?.[0]?.text || '';

    await navigator.clipboard.writeText(text);
    tailorBtn.textContent = '✓ Copied!';
    setTimeout(() => {
      tailorBtn.textContent = 'Tailor Resume';
      tailorBtn.disabled = false;
    }, 2000);

  } catch (err) {
    console.error('[1stStep] Tailor error:', err);
    alert('Tailoring failed: ' + err.message);
    tailorBtn.textContent = 'Tailor Resume';
    tailorBtn.disabled = false;
  }
}

// ─── AUTOFILL ────────────────────────────────────────────────

async function autofillPage(auth, btn) {
  // `btn` is whichever button triggered this — falls back to autofillBtn so existing callers still work
  btn = btn || autofillBtn;
  const originalLabel = btn.textContent;

  if (!auth.email) {
    alert('Please sign in to 1stStep.ai first.');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Filling...';

  try {
    // Refresh tierToken (free tier is allowed for autofill; we still send one for rate-limit context)
    let tierToken = auth.tierToken;
    try {
      const subRes = await fetch(
        `${APP_URL}/api/subscription?email=${encodeURIComponent(auth.email)}`
      );
      if (subRes.ok) {
        const subData = await subRes.json();
        if (subData.tierToken) tierToken = subData.tierToken;
      }
    } catch (_) { /* soft fail — autofill does not hard-require tierToken */ }

    // Target the active tab (where the job application form lives)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');

    // Ask the content script to scan + fill
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { action: 'AUTOFILL', email: auth.email, tierToken },
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
    alert('Autofill failed: ' + err.message);
    btn.textContent = originalLabel;
    btn.disabled    = false;
  }
}

// ─── START ───────────────────────────────────────────────────

init();

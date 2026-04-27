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

    statusBadge.textContent = auth.tier === 'complete' ? 'Pass Active' :
                              auth.tier === 'essential' ? 'Essential' : 'Free';
    statusBadge.classList.add('authenticated');

    const job = await getCurrentJob();
    if (job) {
      showJobCard(job, auth);
    } else {
      showEmptyState(auth);
    }
    renderStats();
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

  // Show match % if we have a resume to compare against
  const matchPct = estimateMatch(auth.resume, job.jobDescription);
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

  // Tracker strip — show pipeline status for this job
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

  // Auto-trigger only when title is already known (skip countdown if user must fill form)
  if (auth.resume && !titleMissing) {
    let countdown = 2;
    tailorBtn.textContent = `Tailoring in ${countdown}s… (click to go now)`;
    const timer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        tailorBtn.textContent = `Tailoring in ${countdown}s… (click to go now)`;
      } else {
        clearInterval(timer);
        openInApp(buildJob(), tailorBtn);
      }
    }, 1000);
    tailorBtn.onclick = () => { clearInterval(timer); validateAndOpen(tailorBtn); };
  }
}

// ─── TRACKER STATUS ──────────────────────────────────────────

const TRACKER_STAGES = [
  { key: 'not_applied',   icon: '○', label: 'Save'      },
  { key: 'applied',       icon: '●', label: 'Applied'   },
  { key: 'interviewing',  icon: '◎', label: 'Interview' },
];

const TRACKER_STATUS_ICONS = { not_applied: '○', applied: '●', interviewing: '◎', offer: '★', rejected: '✕' };

async function renderTrackerStatus(job) {
  const strip = document.getElementById('trackerStrip');
  const label = document.getElementById('trackerLabel');
  const stageBtns = document.getElementById('trackerStageBtns');
  if (!strip || !job?.applyUrl) return;

  const data = await new Promise(r => chrome.storage.local.get(['1ststep_ext_tracker'], r));
  const tracker = data['1ststep_ext_tracker'] || [];
  const entry = tracker.find(e => e.jobUrl === job.applyUrl);

  strip.style.display = 'flex';
  stageBtns.innerHTML = '';

  if (entry) {
    const icon = TRACKER_STATUS_ICONS[entry.status] || '○';
    const display = entry.status.replace('_', ' ');
    label.textContent = `${icon} ${display.charAt(0).toUpperCase() + display.slice(1)}`;
    label.classList.add('tracked');
    label.style.cursor = 'default';
    label.onclick = null;
  } else {
    label.textContent = '+ Add to Job Tracker';
    label.classList.remove('tracked');
    label.style.cursor = 'pointer';
    label.onclick = () => setTrackerStatus(job, 'not_applied');
  }

  for (const stage of TRACKER_STAGES) {
    const btn = document.createElement('button');
    btn.className = 'tracker-stage-btn' + (entry?.status === stage.key ? ' active' : '');
    btn.textContent = `${stage.icon} ${stage.label}`;
    btn.onclick = () => setTrackerStatus(job, stage.key);
    stageBtns.appendChild(btn);
  }
}

async function setTrackerStatus(job, newStatus) {
  const data = await new Promise(r => chrome.storage.local.get(['1ststep_ext_tracker'], r));
  const tracker = data['1ststep_ext_tracker'] || [];
  let entry = tracker.find(e => e.jobUrl === job.applyUrl);

  if (!entry) {
    entry = {
      id: 'ext_' + Date.now(),
      jobTitle:       job.jobTitle || '',
      company:        job.company  || '',
      jobUrl:         job.applyUrl || '',
      jobDescription: (job.jobDescription || '').slice(0, 5000),
      location: '', resume: '', coverLetter: '', matchPct: null, notes: '',
      status:    newStatus,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      appliedAt: null,
      tailoredAt: null,
      source: 'extension',
    };
    tracker.unshift(entry);
  } else {
    entry.status    = newStatus;
    entry.updatedAt = new Date().toISOString();
    if (newStatus === 'applied' && !entry.appliedAt) entry.appliedAt = new Date().toISOString();
  }

  if (tracker.length > 100) tracker.splice(100);
  await new Promise(r => chrome.storage.local.set({ '1ststep_ext_tracker': tracker }, r));
  chrome.runtime.sendMessage({ action: 'UPDATE_TRACKER_BADGE' }).catch(() => {});
  renderTrackerStatus(job);
}

// ─── MATCH ESTIMATE ──────────────────────────────────────────

function estimateMatch(resume, jd) {
  if (!resume || !jd) return null;
  const words = jd.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const unique = [...new Set(words)];
  if (unique.length === 0) return null;
  const resumeLower = resume.toLowerCase();
  const hits = unique.filter(w => resumeLower.includes(w)).length;
  const raw = Math.round((hits / unique.length) * 100);
  return Math.max(22, Math.min(58, raw));
}

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

async function openInApp(job, btn) {
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

  chrome.runtime.sendMessage({ action: 'OPEN_IN_APP', jobData }, (response) => {
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
    btn.textContent = 'Autofill failed — try again';
    setTimeout(() => { btn.textContent = originalLabel; btn.disabled = false; }, 3000);
  }
}

// ─── STATS ───────────────────────────────────────────────────

function renderStats() {
  try {
    chrome.storage.sync.get(['1ststep_stats'], (data) => {
      if (chrome.runtime.lastError) return;
      const stats = data['1ststep_stats'];
      if (!stats) return;
      const section = document.getElementById('statsSection');
      if (!section) return;
      const t = document.getElementById('statTailors');
      const w = document.getElementById('statStreak');
      const m = document.getElementById('statBestMatch');
      const a = document.getElementById('statApps');
      if (t) t.textContent = stats.tailorsThisMonth > 0 ? stats.tailorsThisMonth : '—';
      if (w) w.textContent = stats.streakCount > 0 ? stats.streakCount : '—';
      if (m) m.textContent = stats.bestMatchPct > 0 ? stats.bestMatchPct + '%' : '—';
      if (a) a.textContent = stats.applicationCount > 0 ? stats.applicationCount : '—';
      section.style.display = 'block';
    });
  } catch {}
}

// ─── START ───────────────────────────────────────────────────

init();

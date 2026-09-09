/** Controlled-beta service worker. Candidate values are never persisted here. */
const APP_URL = 'https://app.1ststep.ai';
const MODES = { TAILOR: 'tailor', COVER_LETTER: 'coverLetter', JOB_AGENT: 'jobAgent' };
const JOB_AGENT_STATUS_CACHE_KEY = 'jobAgentStatusCache';
const JOB_AGENT_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;
const CONTEXT_MENU_RESUME = 'firststep-capture-resume';
const CONTEXT_MENU_AGENT = 'firststep-capture-agent';

function compactJobAgentCapabilities(value = {}) {
  return {
    jobAgentAccess: value.jobAgentAccess === true,
    tier: typeof value.tier === 'string' ? value.tier.slice(0, 32) : 'guest',
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt.slice(0, 64) : null,
  };
}

async function cacheJobAgentStatus(value) {
  const capabilities = compactJobAgentCapabilities(value);
  await chrome.storage.session.set({
    [JOB_AGENT_STATUS_CACHE_KEY]: { capabilities, checkedAt: Date.now() },
  });
  return capabilities;
}

async function readCachedJobAgentStatus(now = Date.now()) {
  const stored = await chrome.storage.session.get([JOB_AGENT_STATUS_CACHE_KEY]);
  const entry = stored?.[JOB_AGENT_STATUS_CACHE_KEY];
  if (!entry || typeof entry.checkedAt !== 'number' || now - entry.checkedAt > JOB_AGENT_STATUS_CACHE_TTL_MS) return null;
  const expiresAt = entry.capabilities?.expiresAt ? Date.parse(entry.capabilities.expiresAt) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= now) return null;
  return compactJobAgentCapabilities(entry.capabilities);
}

function relayToTab(tabId, operation, payload) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { action: 'JOB_AGENT_APP_BRIDGE', operation, payload }, response => {
      if (chrome.runtime.lastError) resolve({ success: false, error: 'Reload the open 1stStep.ai tab, then try again.', code: 'JOB_AGENT_APP_BRIDGE_UNAVAILABLE' });
      else resolve(response || { success: false, error: 'The 1stStep.ai bridge did not respond.' });
    });
  });
}

async function relayThroughApp(operation, payload = {}) {
  const tabs = await chrome.tabs.query({ url: `${APP_URL}/*` });
  if (!tabs.length) return { success: false, error: 'Open and sign in to 1stStep.ai before continuing.', code: 'JOB_AGENT_APP_TAB_REQUIRED' };
  let lastFailure = null;
  for (const tab of tabs) {
    if (!Number.isInteger(tab?.id)) continue;
    const response = await relayToTab(tab.id, operation, payload);
    if (response?.success === true) return response;
    lastFailure = response;
  }
  return lastFailure || { success: false, error: 'Reload the open 1stStep.ai tab, then try again.', code: 'JOB_AGENT_APP_BRIDGE_UNAVAILABLE' };
}

async function getJobAgentStatus() {
  const live = await relayThroughApp('status');
  if (live?.success === true) {
    const capabilities = live.data?.capabilities || live.data || {};
    await cacheJobAgentStatus(capabilities);
    return live;
  }
  if (live?.status === 401) await cacheJobAgentStatus({ jobAgentAccess: false, tier: 'guest' });
  const cached = await readCachedJobAgentStatus();
  if (cached) return { success: true, data: cached, source: 'session-cache' };
  return live;
}

// -- pendingJobs mutation queue ----------------------------------------------
// This service worker is the only writer of pendingJobs. Every mutation runs
// through one promise chain, so an addition and an acknowledged deletion cannot
// both read the same snapshot and write back a version missing the other's
// change. The content-script bridge reads pendingJobs for delivery but never
// writes it.

const CAPTURE_TTL_MS = 24 * 60 * 60 * 1000;
let pendingJobsMutation = Promise.resolve();

function expirePendingJobs(pendingJobs, now = Date.now()) {
  for (const id of Object.keys(pendingJobs)) {
    const entry = pendingJobs[id];
    if (!entry || typeof entry.createdAt !== 'number' || now - entry.createdAt > CAPTURE_TTL_MS) {
      delete pendingJobs[id];
    }
  }
  return pendingJobs;
}

/** Serializes a read-modify-write over pendingJobs. Returns the mutator result. */
function mutatePendingJobs(mutator) {
  const run = pendingJobsMutation.then(async () => {
    const data = await chrome.storage.local.get(['pendingJobs']);
    const pendingJobs = data.pendingJobs && typeof data.pendingJobs === 'object' ? data.pendingJobs : {};
    const result = await mutator(pendingJobs);
    await chrome.storage.local.set({ pendingJobs });
    return result;
  });
  // Keep the chain alive even if one mutation throws.
  pendingJobsMutation = run.then(() => undefined, () => undefined);
  return run;
}

/** Deletes exactly the acknowledged capture. Unknown ids change nothing. */
function consumeCapture(captureId) {
  if (typeof captureId !== 'string' || !captureId) return Promise.resolve(false);
  return mutatePendingJobs(pendingJobs => {
    expirePendingJobs(pendingJobs);
    if (!Object.prototype.hasOwnProperty.call(pendingJobs, captureId)) return false;
    delete pendingJobs[captureId];
    return true;
  });
}

function captureScore(candidate) {
  const methodPriority = {
    'structured-job-posting': 5,
    'greenhouse-job-data': 4,
    'workday-visible': 3,
    'lever-visible': 3,
    'ashby-visible': 3,
    'smartrecruiters-visible': 3,
    'selected-text': 2,
    'visible-page': 1,
  };
  return (methodPriority[candidate?.captureMethod] || 0) * 100_000
    + String(candidate?.jobDescription || '').length
    + (candidate?.jobTitle ? 500 : 0)
    + (candidate?.company ? 250 : 0);
}

function normalizeCapturedCandidate(candidate, tab) {
  if (!candidate?.jobDescription) return null;
  let pageSite = candidate.site || 'job-page';
  try { pageSite = new URL(tab?.url || candidate.applyUrl).hostname.replace(/^www\./, ''); } catch (_) {}
  return {
    ...candidate,
    applyUrl: tab?.url || candidate.applyUrl || '',
    site: pageSite,
  };
}

async function captureJobFromTab(tab) {
  if (!Number.isInteger(tab?.id) || !/^https?:\/\//i.test(String(tab.url || ''))) return null;
  let injected;
  try {
    injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['generic-capture.js'],
    });
  } catch (_) {
    injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      files: ['generic-capture.js'],
    });
  }
  return (injected || [])
    .map(frame => normalizeCapturedCandidate(frame?.result, tab))
    .filter(Boolean)
    .sort((left, right) => captureScore(right) - captureScore(left))[0] || null;
}

async function setTabCapability(tabId, job = null) {
  if (!Number.isInteger(tabId)) return;
  await chrome.action.setBadgeBackgroundColor({ tabId, color: job ? '#4F46E5' : '#64748B' });
  await chrome.action.setBadgeText({ tabId, text: job ? 'JOB' : '?' });
  await chrome.action.setTitle({
    tabId,
    title: job
      ? `1stStep.ai detected ${job.jobTitle || 'a job'} — click to review`
      : '1stStep.ai could not read a job here — highlight the description and try again',
  });
}

async function openCapturedJob(jobData, mode = MODES.TAILOR) {
  const jobCaptureId = crypto.randomUUID();
  await mutatePendingJobs(pendingJobs => {
    expirePendingJobs(pendingJobs);
    pendingJobs[jobCaptureId] = { jobData, mode, createdAt: Date.now() };
  });
  const targetUrl = mode === MODES.JOB_AGENT
    ? `${APP_URL}/concierge?jobCaptureId=${jobCaptureId}&mode=${mode}`
    : `${APP_URL}/app/resume?jobCaptureId=${jobCaptureId}&mode=${mode}`;
  const tabs = await chrome.tabs.query({ url: `${APP_URL}/*` });
  if (tabs.length) await chrome.tabs.update(tabs[0].id, { active: true, url: targetUrl });
  else await chrome.tabs.create({ url: targetUrl });
  return { success: true, jobCaptureId };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === 'GET_JOB_AGENT_STATUS') return sendResponse(await getJobAgentStatus());
      if (request.action === 'SYNC_JOB_AGENT_STATUS') {
        if (!String(sender?.url || '').startsWith(`${APP_URL}/`)) {
          return sendResponse({ success: false, error: 'Unauthorized status update.' });
        }
        const capabilities = await cacheJobAgentStatus(request.capabilities || {});
        return sendResponse({ success: true, data: capabilities });
      }
      if (request.action === 'PREPARE_GREENHOUSE_HANDOFF') return sendResponse(await relayThroughApp('prepare', request.payload));
      if (request.action === 'GET_GREENHOUSE_DOCUMENT') return sendResponse(await relayThroughApp('document', request.payload));
      if (request.action === 'COMPLETE_GREENHOUSE_HANDOFF') return sendResponse(await relayThroughApp('complete', request.payload));
      if (request.action === 'JOB_DETECTED') {
        await chrome.storage.session.set({ current_job: { site: request.site, jobId: request.jobId, jobTitle: request.jobTitle, company: request.company, jobDescription: request.jobDescription, applyUrl: request.applyUrl, detectedAt: Date.now() } });
        await setTabCapability(sender?.tab?.id, request);
        return sendResponse({ success: true });
      }
      if (request.action === 'GET_CURRENT_JOB') {
        const jobs = await chrome.storage.session.get(['current_job']);
        return sendResponse({ success: true, job: jobs.current_job });
      }
      if (request.action === 'CONSUME_JOB_CAPTURE') {
        // Only the page bridge on our own app origin may retire a capture.
        if (!String(sender?.url || '').startsWith(`${APP_URL}/`)) {
          return sendResponse({ success: false, error: 'Unauthorized capture consumption.' });
        }
        const consumed = await consumeCapture(request.captureId);
        return sendResponse({ success: true, consumed });
      }
      if (request.action === 'CAPTURE_ACTIVE_TAB') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const job = await captureJobFromTab(tab);
        await setTabCapability(tab?.id, job);
        return sendResponse({ success: true, job });
      }
      if (request.action === 'OPEN_IN_APP') {
        return sendResponse(await openCapturedJob(request.jobData, request.mode || MODES.TAILOR));
      }
      sendResponse({ success: false, error: 'Unknown action' });
    } catch (error) {
      sendResponse({ success: false, error: error.message || 'Extension request failed.' });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(details => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: CONTEXT_MENU_RESUME, title: 'Use this job in 1stStep Resume Builder', contexts: ['page', 'selection'] });
    chrome.contextMenus.create({ id: CONTEXT_MENU_AGENT, title: 'Review this job with 1stStep Job Agent', contexts: ['page', 'selection'] });
  });
  if (details.reason === 'install') chrome.tabs.create({ url: `${APP_URL}/concierge?welcome=extension` });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (![CONTEXT_MENU_RESUME, CONTEXT_MENU_AGENT].includes(info.menuItemId)) return;
  (async () => {
    const job = await captureJobFromTab(tab);
    await setTabCapability(tab?.id, job);
    if (!job) return;
    await openCapturedJob(job, info.menuItemId === CONTEXT_MENU_AGENT ? MODES.JOB_AGENT : MODES.TAILOR);
  })().catch(() => setTabCapability(tab?.id, null));
});

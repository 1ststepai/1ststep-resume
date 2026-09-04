/** Controlled-beta service worker. Candidate values are never persisted here. */
const APP_URL = 'https://app.1ststep.ai';
const MODES = { TAILOR: 'tailor', COVER_LETTER: 'coverLetter' };

async function relayThroughApp(operation, payload = {}) {
  const tabs = await chrome.tabs.query({ url: `${APP_URL}/*` });
  if (!tabs.length) return { success: false, error: 'Open and sign in to 1stStep.ai before continuing.', code: 'JOB_AGENT_APP_TAB_REQUIRED' };
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'JOB_AGENT_APP_BRIDGE', operation, payload }, response => {
      if (chrome.runtime.lastError) resolve({ success: false, error: 'Reload the open 1stStep.ai tab, then try again.', code: 'JOB_AGENT_APP_BRIDGE_UNAVAILABLE' });
      else resolve(response || { success: false, error: 'The 1stStep.ai bridge did not respond.' });
    });
  });
}

// -- pendingJobs mutation queue ----------------------------------------------
// This service worker is the only writer of pendingJobs. Every mutation runs
// through one promise chain, so an addition and an acknowledged deletion cannot
// both read the same snapshot and write back a version missing the other's
// change. The content-script bridge reads pendingJobs for delivery but never
// writes it.

const CAPTURE_TTL_MS = 2 * 60 * 1000;
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === 'GET_JOB_AGENT_STATUS') return sendResponse(await relayThroughApp('status'));
      if (request.action === 'PREPARE_GREENHOUSE_HANDOFF') return sendResponse(await relayThroughApp('prepare', request.payload));
      if (request.action === 'GET_GREENHOUSE_DOCUMENT') return sendResponse(await relayThroughApp('document', request.payload));
      if (request.action === 'COMPLETE_GREENHOUSE_HANDOFF') return sendResponse(await relayThroughApp('complete', request.payload));
      if (request.action === 'JOB_DETECTED') {
        await chrome.storage.session.set({ current_job: { site: request.site, jobId: request.jobId, jobTitle: request.jobTitle, company: request.company, jobDescription: request.jobDescription, applyUrl: request.applyUrl, detectedAt: Date.now() } });
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
      if (request.action === 'OPEN_IN_APP') {
        const jobCaptureId = crypto.randomUUID();
        const mode = request.mode || MODES.TAILOR;
        await mutatePendingJobs(pendingJobs => {
          expirePendingJobs(pendingJobs);
          pendingJobs[jobCaptureId] = { jobData: request.jobData, mode, createdAt: Date.now() };
        });
        const targetUrl = mode === MODES.COVER_LETTER ? `${APP_URL}/app/resume?jobCaptureId=${jobCaptureId}&mode=${mode}` : `${APP_URL}/funnel?jobCaptureId=${jobCaptureId}`;
        const tabs = await chrome.tabs.query({ url: `${APP_URL}/*` });
        if (tabs.length) await chrome.tabs.update(tabs[0].id, { active: true, url: targetUrl });
        else await chrome.tabs.create({ url: targetUrl });
        return sendResponse({ success: true, jobCaptureId });
      }
      sendResponse({ success: false, error: 'Unknown action' });
    } catch (error) {
      sendResponse({ success: false, error: error.message || 'Extension request failed.' });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') chrome.tabs.create({ url: `${APP_URL}/concierge?welcome=extension` });
});

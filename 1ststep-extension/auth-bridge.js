/** Same-origin bridge for the controlled Job Agent extension. */

async function jobAgentApi(path, options = {}) {
  const response = await fetch(path, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `1stStep request failed (${response.status}).`);
    error.code = data.code || 'JOB_AGENT_REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  return data;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== 'JOB_AGENT_APP_BRIDGE') return false;
  (async () => {
    try {
      if (message.operation === 'status') {
        const data = await jobAgentApi('/api/session-capabilities?client=job-agent', { method: 'GET' });
        sendResponse({ success: true, data });
        return;
      }
      if (!['prepare', 'document', 'complete'].includes(message.operation)) throw new Error('Unsupported Job Agent bridge operation.');
      const data = await jobAgentApi('/api/extension-application-handoff', { method: 'POST', body: JSON.stringify({ action: message.operation, ...(message.payload || {}) }) });
      sendResponse({ success: true, data });
    } catch (error) {
      sendResponse({ success: false, error: error.message, code: error.code || 'JOB_AGENT_BRIDGE_FAILED', status: error.status || 0 });
    }
  })();
  return true;
});

// -- Job capture handoff -----------------------------------------------------
// The capture is delivered before it is deleted, and deleted only when the page
// confirms it has persisted it. Previously the entry was removed first and the
// message was fire-and-forget, so a page that never received it lost the job
// with no trace.
//
// Identity is exact. The capture id must come from the URL; there is no
// "most recent pending job" fallback, because that fallback only ever fired
// once the correct entry was already gone -- at which point it delivered a
// different job's data to the page.

const CAPTURE_TTL_MS = 2 * 60 * 1000;

function captureIdFromUrl() {
  return new URLSearchParams(window.location.search).get('jobCaptureId') || '';
}

async function readPendingJobs() {
  const data = await chrome.storage.local.get(['pendingJobs']);
  return data.pendingJobs && typeof data.pendingJobs === 'object' ? data.pendingJobs : {};
}

/** Posts the one capture named by the URL. Never deletes, never substitutes. */
async function deliverPendingJob(captureId = captureIdFromUrl()) {
  try {
    if (!captureId) return false;
    const pendingJobs = await readPendingJobs();
    const entry = pendingJobs[captureId];
    if (!entry) return false;
    if (Date.now() - entry.createdAt > CAPTURE_TTL_MS) return false;
    window.postMessage({
      type: '1STSTEP_JOB_CAPTURE',
      version: '1',
      captureId,
      jobData: entry.jobData,
      resumeText: null,
      mode: entry.mode || 'tailor',
    }, window.location.origin);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Hands the acknowledged capture to the service worker, which is the only
 * writer of pendingJobs. Writing from here would race the worker's own
 * additions and expiry sweep: both sides would read the same snapshot and the
 * later write would silently drop the other's change.
 */
async function consumeAcknowledgedCapture(captureId) {
  try {
    if (!captureId) return false;
    const response = await chrome.runtime.sendMessage({ action: 'CONSUME_JOB_CAPTURE', captureId });
    return !!(response && response.success && response.consumed);
  } catch (_) {
    return false;
  }
}

window.addEventListener('message', event => {
  // Same-document messages only. event.source must be this window, so another
  // frame cannot forge an acknowledgement for a capture it never received.
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  const captureId = typeof message.captureId === 'string' ? message.captureId : '';
  if (!captureId) return;

  if (message.type === '1STSTEP_JOB_CAPTURE_ACK') {
    // Only the capture this page was sent may be consumed.
    if (captureId !== captureIdFromUrl()) return;
    consumeAcknowledgedCapture(captureId);
    return;
  }

  if (message.type === '1STSTEP_JOB_CAPTURE_REQUEST') {
    // Retry path. The page cannot read extension storage itself, so it asks for
    // its own capture by id and gets that one or nothing.
    if (captureId !== captureIdFromUrl()) return;
    deliverPendingJob(captureId);
  }
});

deliverPendingJob();

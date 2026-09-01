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

async function deliverPendingJob() {
  try {
    const jobCaptureId = new URLSearchParams(window.location.search).get('jobCaptureId');
    const data = await chrome.storage.local.get(['pendingJobs']);
    const pendingJobs = data.pendingJobs || {};
    const now = Date.now();
    let matchedId = jobCaptureId && pendingJobs[jobCaptureId] ? jobCaptureId : null;
    if (!matchedId) matchedId = Object.keys(pendingJobs).find(id => now - pendingJobs[id].createdAt <= 2 * 60 * 1000) || null;
    const entry = matchedId ? pendingJobs[matchedId] : null;
    if (!entry || now - entry.createdAt > 2 * 60 * 1000) return;
    delete pendingJobs[matchedId];
    await chrome.storage.local.set({ pendingJobs });
    window.postMessage({ type: '1STSTEP_JOB_CAPTURE', version: '1', jobData: entry.jobData, resumeText: null, mode: entry.mode || 'tailor' }, window.location.origin);
  } catch (_) {}
}

deliverPendingJob();

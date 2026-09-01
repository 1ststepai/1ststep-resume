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

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
      if (request.action === 'OPEN_IN_APP') {
        const jobCaptureId = crypto.randomUUID();
        const now = Date.now();
        const localData = await chrome.storage.local.get(['pendingJobs']);
        const pendingJobs = localData.pendingJobs || {};
        for (const id of Object.keys(pendingJobs)) if (now - pendingJobs[id].createdAt > 2 * 60 * 1000) delete pendingJobs[id];
        const mode = request.mode || MODES.TAILOR;
        pendingJobs[jobCaptureId] = { jobData: request.jobData, mode, createdAt: now };
        await chrome.storage.local.set({ pendingJobs });
        const targetUrl = mode === MODES.COVER_LETTER ? `${APP_URL}/app?jobCaptureId=${jobCaptureId}&mode=${mode}` : `${APP_URL}/funnel?jobCaptureId=${jobCaptureId}`;
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

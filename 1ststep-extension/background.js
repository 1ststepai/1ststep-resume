/**
 * background.js - Service Worker
 * Handles authentication, message routing, and global state management
 */

const APP_URL = 'https://app.1ststep.ai';

// Auth token cache { token, expiry }
let authTokenCache = null;

/**
 * Fetch the user's tier token from 1stStep.ai backend
 * The token is HMAC-signed and valid for 20 minutes
 */
async function fetchTierToken(email) {
  try {
    const response = await fetch(`${APP_URL}/api/subscription?email=${encodeURIComponent(email)}`);
    if (!response.ok) throw new Error(`Subscription lookup failed: ${response.status}`);
    
    const data = await response.json();
    // data = { tier, status, tierToken, expiresAt }
    
    authTokenCache = {
      ...data,
      fetchedAt: Date.now()
    };
    
    return data;
  } catch (error) {
    console.error('[1stStep] Tier token fetch failed:', error);
    return null;
  }
}

/**
 * Get cached tier token if valid, otherwise fetch fresh one
 */
async function getTierToken(email) {
  // If we have a cached token and it's not expired, use it
  if (authTokenCache && authTokenCache.expiresAt) {
    const now = Date.now();
    const expiryBuffer = 60000; // 1 minute buffer before actual expiry
    if (now < authTokenCache.expiresAt - expiryBuffer) {
      return authTokenCache;
    }
  }
  
  // Fetch fresh token
  return fetchTierToken(email);
}

/**
 * Get user profile and resume from chrome.storage.sync
 * (synced from app.1ststep.ai localStorage via content script bridge)
 */
async function getUserData() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['1ststep_profile', '1ststep_resume'], (data) => {
      resolve({
        profile: data['1ststep_profile'],
        resume: data['1ststep_resume']
      });
    });
  });
}

/**
 * Save user data to chrome.storage.sync
 */
async function saveUserData(profile, resume) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({
      '1ststep_profile': profile,
      '1ststep_resume': resume
    }, resolve);
  });
}

/**
 * Listen for messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Async handler - use async IIFE
  (async () => {
    try {
      switch (request.action) {
        // ─── AUTH ──────────────────────────────────
        case 'GET_TIER_TOKEN':
          const tierData = await getTierToken(request.email);
          sendResponse({ success: !!tierData, data: tierData });
          break;

        // ─── USER DATA ──────────────────────────────
        case 'GET_USER_DATA':
          const userData = await getUserData();
          sendResponse({ success: true, data: userData });
          break;

        case 'SAVE_USER_DATA':
          await saveUserData(request.profile, request.resume);
          sendResponse({ success: true });
          break;

        // ─── JOB DETECTION ──────────────────────────
        case 'JOB_DETECTED':
          // Content script found a job page - extract JD, pass to popup/sidepanel
          await chrome.storage.session.set({
            'current_job': {
              site: request.site,
              jobId: request.jobId,
              jobTitle: request.jobTitle,
              company: request.company,
              jobDescription: request.jobDescription,
              applyUrl: request.applyUrl,
              detectedAt: Date.now()
            }
          });
          sendResponse({ success: true });
          break;

        case 'GET_CURRENT_JOB':
          const jobs = await chrome.storage.session.get(['current_job']);
          sendResponse({ success: true, job: jobs.current_job });
          break;

        // ─── TAILOR REQUEST ──────────────────────────
        case 'TAILOR_RESUME':
          // Forward to 1stStep.ai backend claude.js
          const tailorResponse = await fetch(`${APP_URL}/api/claude`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callType: 'tailor',
              resume: request.resume,
              jobDescription: request.jobDescription,
              email: request.email,
              tierToken: request.tierToken
            })
          });
          
          if (!tailorResponse.ok) {
            throw new Error(`Tailor failed: ${tailorResponse.status}`);
          }
          
          const tailored = await tailorResponse.json();
          sendResponse({ success: true, data: tailored });
          break;

        // ─── AUTOFILL REQUEST ──────────────────────
        case 'GET_AUTOFILL_MAP':
          // Call backend to generate field map for this JD + resume
          const fillResponse = await fetch(`${APP_URL}/api/claude`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callType: 'autofill',
              resume: request.resume,
              jobDescription: request.jobDescription,
              email: request.email,
              tierToken: request.tierToken
            })
          });
          
          if (!fillResponse.ok) {
            throw new Error(`Autofill mapping failed: ${fillResponse.status}`);
          }
          
          const fillMap = await fillResponse.json();
          sendResponse({ success: true, data: fillMap });
          break;

        // ─── TRACKING ──────────────────────────────
        case 'TRACK_EVENT':
          // Fire GHL tag via backend track-event.js
          await fetch(`${APP_URL}/api/track-event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: request.email,
              event: request.event // e.g. 'extension_apply', 'extension_install'
            })
          });
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('[1stStep] Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  // Return true to indicate we'll send response asynchronously
  return true;
});

/**
 * On extension install, fire tracking event
 */
chrome.runtime.onInstalled.addListener(() => {
  // Optionally open setup/welcome page
  console.log('[1stStep] Extension installed');
});

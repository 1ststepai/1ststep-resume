/**
 * auth-bridge.js
 * Content script running on app.1ststep.ai
 * 
 * Syncs user profile and resume from localStorage into chrome.storage.sync
 * so the extension can access them on any job site.
 * 
 * Manifest V3 pattern:
 * - Listens for postMessage from page context (source: 'app')
 * - Also syncs on localStorage changes and periodic checks
 * - Safely relays data to chrome.storage.sync (available in content scripts)
 */

/**
 * Core sync logic: read localStorage, fetch tier token, write to chrome.storage.sync
 */
async function syncToExtension() {
  try {
    // Guard: check if extension context is still valid
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.warn('[1stStep] Extension context invalidated - skipping sync');
      return;
    }
    // Read profile data from localStorage (try multiple key variants)
    const profileRaw = localStorage.getItem('1ststep_profile')
                    || localStorage.getItem('user')
                    || localStorage.getItem('profile');

    const resumeRaw  = localStorage.getItem('1ststep_resume')
                    || localStorage.getItem('resume');

    // Check for LinkedIn OAuth result (written by OAuth popup callback)
    const liAuthRaw  = localStorage.getItem('1ststep_li_auth');
    if (liAuthRaw) {
      try {
        const liAuth = JSON.parse(liAuthRaw);
        // Merge LinkedIn profile data if fresh (within 5 minutes)
        if (liAuth.ts && Date.now() - liAuth.ts < 5 * 60 * 1000 && liAuth.payload?.profile) {
          const p = liAuth.payload.profile;
          const existing = profileRaw ? JSON.parse(profileRaw) : {};
          const merged = { ...existing, ...p };
          localStorage.setItem('1ststep_profile', JSON.stringify(merged));
          localStorage.removeItem('1ststep_li_auth');
        }
      } catch(e) {
        console.warn('[1stStep] LinkedIn auth parse error:', e);
      }
    }

    if (!profileRaw) {
      console.log('[1stStep] No profile in localStorage yet');
      return;
    }

    let profile;
    try {
      profile = JSON.parse(profileRaw);
    } catch(e) {
      console.error('[1stStep] Profile JSON parse error:', e);
      return;
    }

    if (!profile?.email) {
      console.log('[1stStep] Profile missing email');
      return;
    }

    console.log('[1stStep] Syncing profile for email:', profile.email);

    // Check if chrome API is still available (guard against extension reload)
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.warn('[1stStep] Chrome API unavailable - extension may have been reloaded');
      return;
    }

    // Fetch fresh tier token from /api/subscription
    try {
      const response = await fetch(`/api/subscription?email=${encodeURIComponent(profile.email)}`);
      const sub = await response.json();

      const syncData = {
        '1ststep_profile': {
          email:     profile.email,
          name:      profile.name || (profile.firstName ? `${profile.firstName} ${profile.lastName || ''}`.trim() : ''),
          tier:      sub.tier     || 'free',
          tierToken: sub.tierToken || ''
        }
      };

      if (resumeRaw) {
        syncData['1ststep_resume'] = resumeRaw;
      }

      // Write to chrome.storage.sync (content script has access)
      // Guard against invalidated context
      try {
        chrome.storage.sync.set(syncData, () => {
          if (chrome.runtime.lastError) {
            console.error('[1stStep] Sync failed:', chrome.runtime.lastError);
          } else {
            console.log('[1stStep] ✓ Synced to extension:', profile.email, 'tier:', sub.tier);
          }
        });
      } catch (apiErr) {
        console.error('[1stStep] Chrome API error (extension reloaded?):', apiErr);
      }
    } catch (subErr) {
      console.warn('[1stStep] Tier token fetch failed, syncing without token:', subErr);
      // Fallback: sync without tier token
      try {
        chrome.storage.sync.set({
          '1ststep_profile': {
            email: profile.email,
            name:  profile.name || '',
            tier:  profile.tier || 'free',
            tierToken: ''
          }
        });
      } catch (apiErr) {
        console.error('[1stStep] Chrome API error:', apiErr);
      }
    }

  } catch(err) {
    console.error('[1stStep] Auth bridge sync error:', err);
  }
}

/**
 * Listen for postMessage from page context (MV3 pattern)
 * Page calls: window.postMessage({ source: 'app', action: 'SYNC_PROFILE' }, '*')
 */
let lastSyncTime = 0;
const SYNC_THROTTLE = 5000; // Throttle syncs to 5s minimum

window.addEventListener('message', async (event) => {
  // Only accept messages from this page (not other frames/extensions)
  if (event.source !== window) return;
  
  const msg = event.data;
  if (!msg || msg.source !== 'app') return;

  console.log('[1stStep] Received postMessage:', msg.action);

  if (msg.action === 'SYNC_PROFILE') {
    const now = Date.now();
    if (now - lastSyncTime > SYNC_THROTTLE) {
      lastSyncTime = now;
      await syncToExtension();
    } else {
      console.log('[1stStep] Sync throttled - too soon since last sync');
    }
  }
});

// ─── PENDING JOB DELIVERY ─────────────────────────────────────

async function deliverPendingJob() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    const jobCaptureId = new URLSearchParams(window.location.search).get('jobCaptureId');
    const now = Date.now();

    const data = await new Promise(resolve =>
      chrome.storage.session.get(['pendingJobs'], resolve)
    );
    const pendingJobs = data.pendingJobs || {};

    // Resolve which entry to deliver
    let matchedId = null;
    let entry = null;

    if (jobCaptureId && pendingJobs[jobCaptureId]) {
      // Exact match from URL param — correct job for this tab/navigation
      matchedId = jobCaptureId;
      entry = pendingJobs[jobCaptureId];
    } else {
      // Fallback: most recent non-stale job (backward compat, no param in URL)
      const candidates = Object.entries(pendingJobs)
        .filter(([, e]) => now - e.createdAt <= 2 * 60 * 1000)
        .sort((a, b) => b[1].createdAt - a[1].createdAt);
      if (candidates.length > 0) {
        [matchedId, entry] = candidates[0];
      }
    }

    if (!entry) return;

    // Stale guard
    if (now - entry.createdAt > 2 * 60 * 1000) {
      delete pendingJobs[matchedId];
      await new Promise(resolve => chrome.storage.session.set({ pendingJobs }, resolve));
      return;
    }

    // Remove only this entry before posting — other pending jobs stay intact
    delete pendingJobs[matchedId];
    await new Promise(resolve => chrome.storage.session.set({ pendingJobs }, resolve));

    const jobData = entry.jobData;
    window.postMessage({
      type: '1STSTEP_JOB_CAPTURE',
      version: '1',
      jobData: {
        jobTitle:       jobData.jobTitle,
        company:        jobData.company,
        jobDescription: jobData.jobDescription,
        applyUrl:       jobData.applyUrl,
        site:           jobData.site
      }
    }, window.location.origin);

    console.log('[1stStep] Delivered pending job:', jobData.jobTitle, '| id:', matchedId);
  } catch (err) {
    console.error('[1stStep] deliverPendingJob error:', err);
  }
}

// ─── AUTO-SYNC ON LOAD & CHANGES ──────────────────────────────

// Sync on page load
syncToExtension();
deliverPendingJob();

// Sync when localStorage changes (cross-tab sync)
window.addEventListener('storage', async (event) => {
  if (event.key === '1ststep_profile' || event.key === '1ststep_resume' || event.key === '1ststep_li_auth') {
    console.log('[1stStep] Storage changed, re-syncing:', event.key);
    await syncToExtension();
  }
});

console.log('[1stStep] Auth bridge loaded on app.1ststep.ai');

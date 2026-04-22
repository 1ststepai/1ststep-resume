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
      chrome.storage.sync.set(syncData, () => {
        if (chrome.runtime.lastError) {
          console.error('[1stStep] Sync failed:', chrome.runtime.lastError);
        } else {
          console.log('[1stStep] ✓ Synced to extension:', profile.email, 'tier:', sub.tier);
        }
      });
    } catch (subErr) {
      console.warn('[1stStep] Tier token fetch failed, syncing without token:', subErr);
      // Fallback: sync without tier token
      chrome.storage.sync.set({
        '1ststep_profile': {
          email: profile.email,
          name:  profile.name || '',
          tier:  profile.tier || 'free',
          tierToken: ''
        }
      });
    }

  } catch(err) {
    console.error('[1stStep] Auth bridge sync error:', err);
  }
}

/**
 * Listen for postMessage from page context (MV3 pattern)
 * Page calls: window.postMessage({ source: 'app', action: 'SYNC_PROFILE' }, '*')
 */
window.addEventListener('message', async (event) => {
  // Only accept messages from this page (not other frames/extensions)
  if (event.source !== window) return;
  
  const msg = event.data;
  if (!msg || msg.source !== 'app') return;

  console.log('[1stStep] Received postMessage:', msg.action);

  if (msg.action === 'SYNC_PROFILE') {
    await syncToExtension();
  }
});

// ─── AUTO-SYNC ON LOAD & CHANGES ──────────────────────────────

// Sync on page load
syncToExtension();

// Sync when localStorage changes (from same window or other tabs in same domain)
window.addEventListener('storage', async (event) => {
  if (event.key === '1ststep_profile' || event.key === '1ststep_resume' || event.key === '1ststep_li_auth') {
    console.log('[1stStep] Storage changed, re-syncing:', event.key);
    await syncToExtension();
  }
});

// Also run periodic sync in case localStorage was updated without firing storage event
// (this can happen if updates come from background scripts or workers)
setInterval(syncToExtension, 3000);

console.log('[1stStep] Auth bridge loaded on app.1ststep.ai');

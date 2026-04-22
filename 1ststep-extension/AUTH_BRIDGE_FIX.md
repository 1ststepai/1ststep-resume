# Chrome Extension Auth Bridge Fix

## The Problem

The extension was trying to access user profile and resume data from `app.1ststep.ai`, but it was encountering this error:

```
"No resume found. Please add your resume at app.1ststep.ai first."
```

This happened because:

1. **MV3 Isolation** — The webpage (page context) running on `app.1ststep.ai` **cannot** directly call `chrome.storage` APIs
2. **Content Scripts Can** — Only content scripts (and background service workers) have access to `chrome.storage`
3. **Missing Bridge** — There was no proper `postMessage` relay between the page and content script

## The Solution

Implemented the standard **Manifest V3 (MV3) postMessage pattern**:

```
Page Context (app.1ststep.ai)
       ↓
   postMessage({ source: 'app', action: 'SYNC_PROFILE' })
       ↓
Content Script (auth-bridge.js)
       ↓
   chrome.storage.sync.set()
       ↓
Other Tabs (LinkedIn, Indeed, etc.)
       ↓
   chrome.storage.sync.get() ← Extension reads it here
```

## What Changed

### 1. Enhanced `auth-bridge.js` (Content Script)

**Added `postMessage` listener:**
```javascript
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;  // Security: same-page only
  const msg = event.data;
  if (!msg || msg.source !== 'app') return;  // Guard against other sources
  
  console.log('[1stStep] Received postMessage:', msg.action);
  
  if (msg.action === 'SYNC_PROFILE') {
    await syncToExtension();  // Sync to chrome.storage.sync
  }
});
```

**Improved logging:**
- Better error messages when tier token fetch fails
- Logs when sync succeeds
- Logs when profile is missing

**Auto-sync triggers:**
1. On page load
2. When localStorage changes (cross-tab sync)
3. Periodic 3-second fallback sync
4. On `postMessage` from page

### 2. Updated `index.html` (Page Context)

**Modified `saveProfile()` to trigger sync:**
```javascript
localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
// ... other code ...

// Sync profile to Chrome extension
try {
  window.postMessage({ source: 'app', action: 'SYNC_PROFILE' }, '*');
} catch (e) { /* extension not installed */ }
```

**Modified `saveResume()` to sync:**
```javascript
function saveResume(data) {
  const resumeJson = JSON.stringify(data);
  sessionStorage.setItem(RESUME_KEY, resumeJson);
  // Sync to extension: keep temp copy in localStorage
  localStorage.setItem(RESUME_KEY, resumeJson);
  
  // Trigger extension sync
  try {
    window.postMessage({ source: 'app', action: 'SYNC_PROFILE' }, '*');
  } catch (e) { /* extension not installed */ }
}
```

## How It Works Now

### User Flow:
1. User visits `app.1ststep.ai`
2. User enters profile (name, email) → clicks Save
3. JavaScript in `saveProfile()` calls `window.postMessage({ source: 'app', action: 'SYNC_PROFILE' }, '*')`
4. `auth-bridge.js` (content script) receives the message
5. `auth-bridge.js` reads `localStorage` and calls `chrome.storage.sync.set()`
6. User opens a job board (LinkedIn, Indeed, etc.)
7. Extension popup reads `chrome.storage.sync` and displays user's tier + resume

### Resume Flow:
1. User uploads resume in `app.1ststep.ai` → `saveResume()` is called
2. Resume is stored in both `sessionStorage` (for this tab) and `localStorage` (for sync)
3. `postMessage` is sent to trigger sync
4. `auth-bridge.js` reads from `localStorage` and syncs to `chrome.storage.sync`
5. Extension can now access resume on any job site

## Security & Best Practices

✅ **MV3 Compliant** — Proper isolation between page and extension contexts
✅ **Source Guard** — Only accepts `postMessage` from same page (`event.source !== window`)
✅ **Action Guard** — Only processes messages with `source: 'app'`
✅ **Error Safe** — Gracefully handles extension not installed (`try/catch`)
✅ **Fallback Sync** — 3-second periodic sync ensures data reaches extension even if postMessage fails

## Testing the Fix

### Manual Test:
1. Load extension in Chrome (`chrome://extensions/` → Load unpacked)
2. Navigate to `app.1ststep.ai`
3. Open DevTools (F12) → Console
4. Enter profile data and click Save
5. Look for logs:
   ```
   [1stStep] Received postMessage: SYNC_PROFILE
   [1stStep] ✓ Synced to extension: your@email.com tier: free
   ```
6. Go to job posting (LinkedIn, Indeed, etc.)
7. Click extension icon
8. **Expected:** Should show your profile (not "Sign In" anymore)

### Debug Checks:
- Extension errors: `chrome://extensions/` → Details → Errors
- Content script logs: DevTools on `app.1ststep.ai` → Console
- Storage contents: DevTools → Application → chrome.storage

## Files Modified

| File | Changes |
|------|---------|
| `1ststep-extension/auth-bridge.js` | Added `postMessage` listener, improved logging |
| `index.html` | Updated `saveProfile()` and `saveResume()` to trigger sync |
| `1ststep-extension/EXTENSION_STATUS.md` | Updated status to reflect fix |

## Related Files

- `manifest.json` — Already has correct `content_scripts` config for `app.1ststep.ai`
- `background.js` — Already handles `GET_TIER_TOKEN` correctly
- `popup.js` — Reads from `chrome.storage.sync` (now populated!)

## Notes

- Resume data is intentionally stored in both `sessionStorage` (tab-only) and `localStorage` (sync-only)
- `localStorage` copy is temporary and persists only for extension sync needs
- Content script cleans up `1ststep_li_auth` after merging LinkedIn data
- Periodic 3-second sync is belt-and-suspenders — catches any missed events

## Future Improvements

- [ ] Add error handling for `chrome.storage.sync` quota exceeded
- [ ] Implement cache invalidation when tier changes
- [ ] Add sync status badge to extension UI
- [ ] Test multi-device sync behavior

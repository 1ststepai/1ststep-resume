# Local Testing Guide — 1stStep.ai Chrome Extension

## Step 1: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle **Developer mode** (top-right corner)
3. Click **Load unpacked**
4. Navigate to and select the `1ststep-extension` folder
5. The extension now appears in your extensions list

You should see:
- **Name:** 1stStep.ai - Job Application Assistant
- **Version:** 0.1.0
- **Status:** Enabled ✓

## Step 2: Pin Extension to Toolbar

1. Click the **Extensions** icon (puzzle piece) in Chrome toolbar
2. Click the 📌 icon next to "1stStep.ai" to pin it
3. The green 1stStep icon now stays visible in your toolbar

## Step 3: Test Job Detection

### LinkedIn

1. Navigate to: https://www.linkedin.com/jobs/search?keywords=product%20manager
2. Click on any job posting
3. Wait 2–3 seconds for job to load
4. Click the **1stStep.ai** icon in the toolbar
5. **Expected:** Popup shows job title, company, and "Tailor Resume" button

### Greenhouse (Example Company)

1. Navigate to: https://boards.greenhouse.io/example (or any Greenhouse job board)
2. Click on a job posting
3. Click the **1stStep.ai** icon
4. **Expected:** Job detected with auto-filled title/company

### Indeed

1. Navigate to: https://www.indeed.com/jobs?q=product%20manager
2. Click on a job posting
3. Click the **1stStep.ai** icon
4. **Expected:** Job title and description detected

## Step 4: Check Debug Logs

1. Open DevTools on a job page: **F12** or **Cmd+Option+I** (Mac)
2. Go to **Console** tab
3. Look for log messages starting with `[1stStep]`
4. **Expected logs:**
   ```
   [1stStep] Content script loaded on linkedin
   [1stStep] Loaded selectors for linkedin
   [1stStep] Job detected on linkedin: Product Manager
   ```

## Step 5: Test Authentication (No Backend Required Yet)

For now, the extension tries to read from `chrome.storage.sync` (which is empty locally).

**To simulate a logged-in user:**

1. Open the extension popup (click the icon)
2. Open DevTools: **F12**
3. In the Console, run:
   ```javascript
   chrome.storage.sync.set({
     '1ststep_profile': {
       email: 'test@1ststep.ai',
       name: 'Test User',
       title: 'Product Manager'
     },
     '1ststep_resume': 'Test Resume\n\nExperience:\n- 5 years PM at TechCorp'
   });
   ```
4. Close and reopen the popup
5. **Expected:** Status badge changes from "Sign In" to "Free"

## Step 6: Test Messages Flow

To verify the extension's message passing works:

1. Open DevTools (F12)
2. Go to **Console** tab
3. Run this to test `background.js`:
   ```javascript
   chrome.runtime.sendMessage(
     { action: 'GET_USER_DATA' },
     (response) => console.log('User data:', response)
   );
   ```
4. **Expected:** You see the response object logged

## Step 7: Reload Extension After Changes

**After editing any file:**

1. Go to `chrome://extensions/`
2. Find the 1stStep.ai extension
3. Click the **Refresh** 🔄 icon
4. The extension reloads with your changes

**If the extension breaks:**

1. You'll see a red "Errors" link on the extension card
2. Click it to see error messages
3. Fix the error and refresh again

## Step 8: Clear Extension Storage (Full Reset)

To reset all stored data:

```javascript
// In any extension page console:
chrome.storage.sync.clear(() => {
  console.log('Storage cleared');
});
```

Or in DevTools on extension pages:
1. Go to `chrome://extensions/`
2. Click **Details** on the extension
3. Go to **Storage** section
4. Click **Clear site data**

## Common Test Scenarios

### Scenario 1: Test Job Detection on Different Sites

| Site | URL | Expected Behavior |
|------|-----|-------------------|
| LinkedIn | Job posting URL | Job title + company populated |
| Greenhouse | Any Greenhouse board | Job title populated |
| Indeed | Job posting | Job description auto-extracted |
| Lever | Job posting | Company name + title extracted |

### Scenario 2: Test Popup UI States

**Empty State** (no job detected)
- Navigate to LinkedIn search page (not a posting)
- Click extension icon
- **Expected:** Shows "No Job Detected" message

**Populated State** (job detected)
- Navigate to a job posting
- Click extension icon
- **Expected:** Shows job details and buttons

**Authenticated State**
- Set profile in `chrome.storage.sync`
- **Expected:** Status badge shows "Free" or "Complete"

### Scenario 3: Verify File Structure

Check that all files are loading:

1. Open DevTools
2. Go to **Sources** tab
3. Expand **chrome-extension://[ID]/**
4. **Expected:** You see all files:
   - background.js
   - content.js
   - popup.html/js
   - sidepanel.html/js
   - sites/*.js
   - utils/*.js

## Troubleshooting

### Extension icon not appearing

**Fix:**
1. Go to `chrome://extensions/`
2. Check if extension is enabled (toggle should be ON)
3. If disabled, click toggle to enable
4. Try pinning the extension again

### "Content script not loaded" message in console

**Cause:** Content script didn't inject into page
**Fix:**
1. Refresh the job page (Cmd+R)
2. Wait 2–3 seconds
3. Open DevTools Console and look for `[1stStep]` logs

### "Job detected" logs appear but popup shows empty state

**Cause:** Job detection fired but sidepanel didn't receive the message
**Fix:**
1. Check background script logs for errors
2. In DevTools, go to **Sources** → **Service Workers** → `background.js`
3. Set a breakpoint on the `JOB_DETECTED` handler
4. Refresh the page and check if it hits the breakpoint

### Can't read storage in popup

**Cause:** `chrome.storage.sync` might not have been populated yet
**Fix:**
1. Manually set test data (see Step 5 above)
2. Or wait 5–10 seconds for sync to initialize

### Modified file not updating when I refresh

**Fix:**
1. Hard refresh: **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows)
2. Or go to `chrome://extensions/` and click the refresh 🔄 icon

## Next Steps (After MVP)

- [ ] Connect to real 1stStep.ai backend
- [ ] Test `/api/claude` endpoint with real resume tailoring
- [ ] Test auto-fill on actual application forms
- [ ] Bundle extension for Chrome Web Store submission
- [ ] Add unit tests for form filling logic
- [ ] Performance optimization (large DOM traversals)

## Questions?

If stuck:
1. Check the **Sources** tab in DevTools
2. Look for `[1stStep]` log messages in Console
3. Check for errors in `chrome://extensions/` → Details → Errors
4. Review [README.md](./README.md) architecture section

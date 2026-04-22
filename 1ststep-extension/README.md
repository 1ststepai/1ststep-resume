# 1stStep.ai Chrome Extension

A productivity extension that auto-fills job applications across LinkedIn, Indeed, Greenhouse, Lever, Workday, and more.

**Status:** 🚀 MVP Development (9 core files completed)

## What It Does

1. **Job Detection** — Automatically detects job postings on supported job boards
2. **Resume Tailoring** — Calls 1stStep.ai backend to tailor your resume for each job
3. **Auto-Fill** — Intelligently fills application form fields with your profile data
4. **Tracking** — Logs applications in your 1stStep.ai account for follow-up

## File Structure

```
1ststep-extension/
├── manifest.json          ✓ MV3 configuration
├── background.js          ✓ Service worker (auth, message routing)
├── content.js             ✓ Content script (job detection, UI injection)
├── popup.html/js          ✓ Popup UI (quick tailor & auto-fill)
├── sidepanel.html/js      ✓ Side panel (detailed tailor workflow)
├── sites/
│   ├── linkedin.js        ✓ LinkedIn Easy Apply selectors
│   ├── greenhouse.js      ✓ Greenhouse form selectors
│   ├── lever.js           ✓ Lever ATS selectors
│   ├── workday.js         ✓ Workday HCM selectors (hard — Shadow DOM)
│   ├── indeed.js          ✓ Indeed form selectors (medium — iframe)
│   └── icims.js           ✓ iCIMS legacy ATS selectors
└── utils/
    ├── auth.js            ✓ Auth token + profile management
    └── filler.js          ✓ Generic form auto-fill utility
```

## Quick Start (Local Development)

### 1. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select the `1ststep-extension/` folder
5. The extension now appears in your toolbar

### 2. Test Job Detection

1. Navigate to any supported job site:
   - LinkedIn: https://www.linkedin.com/jobs/search
   - Indeed: https://indeed.com/jobs
   - Greenhouse: Any Greenhouse job board
   - Lever: Any Lever job board
2. Open a job posting
3. Click the 1stStep.ai icon in the toolbar
4. Popup shows detected job (or empty state if not detected)

### 3. Sign In

1. Click the popup or sidepanel
2. Click the "Sign In" link → opens https://app.1ststep.ai
3. Sign in with email or LinkedIn
4. Extension auto-detects your auth token from `chrome.storage.sync`

### 4. Test Tailoring

1. Open a job posting
2. Click **Tailor Resume** in the popup
3. Extension calls `/api/claude?callType=tailor` with your resume
4. Result displays in sidepanel
5. Download or copy to clipboard

## Architecture

### Message Flow

```
Content Script (job page)
    ↓ chrome.runtime.sendMessage()
Background Service Worker
    ↓ chrome.runtime.sendMessage()
Popup / Sidepanel
    ↓ fetch() to app.1ststep.ai/api/*
1stStep.ai Backend
```

### Key Message Actions

| Action | Sender | Receiver | Purpose |
|--------|--------|----------|---------|
| `GET_TIER_TOKEN` | popup/sidepanel | background | Fetch user's authentication token |
| `GET_CURRENT_JOB` | popup/sidepanel | background | Get currently detected job |
| `JOB_DETECTED` | content script | background | Notify that a job was found |
| `TAILOR_RESUME` | popup/sidepanel | background → API | Tailor resume for job |
| `AUTOFILL_FORM` | popup | content script | Auto-fill detected form |
| `TRACK_EVENT` | popup/sidepanel | background → API | Log application in GHL |

### Data Flow

1. **User Data Sync** — `chrome.storage.sync` bridges localStorage from app.1ststep.ai:
   - `1ststep_profile` — name, email, title
   - `1ststep_resume` — resume text

2. **Auth Token** — 20-minute HMAC token fetched via `GET_TIER_TOKEN`

3. **Job Detection** — Content script polls DOM every 2s for job description

4. **Form Auto-Fill** — Backend returns field map (`{ firstName: 'input[name="first_name"]', ... }`), extension fills values

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✓ Yes | Manifest V3, Chrome 88+ |
| Edge | ✓ Yes | Same as Chrome |
| Brave | ✓ Yes | Same as Chrome |
| Firefox | ✗ No | Would need WebExtensions API port |

## Limitations & TODOs

### Current Limitations

- **File Upload** — Security policy prevents programmatic file input filling
- **Shadow DOM** — Workday requires special handling (pierceShado wRoot logic stubbed)
- **iframes** — Indeed's apply modal is in iframe (special cross-frame handling needed)
- **Selector Maintenance** — Selectors break when job sites update DOM (maintenance burden)

### MVP Blockers (Before Production)

- [ ] **Chrome Web Store submission** — Package, test, submit for review
- [ ] **Icons** — Create 16x16, 48x48, 128x128 PNG icons in `icons/` folder
- [ ] **Content Security Policy** — Verify no unsafe inline scripts
- [ ] **Permissions Review** — Minimize host_permissions, use activeTab where possible
- [ ] **E2E Testing** — Test all 6 sites in real Chrome extension environment
- [ ] **Error Handling** — Add retry logic for form auto-fill failures
- [ ] **User Onboarding** — First-run experience, tutorial overlay

### Nice-to-Have (Post-MVP)

- [ ] Support for iCIMS and Taleo (lesser-used platforms)
- [ ] Company-direct job boards (detect apply button heuristically)
- [ ] LinkedIn PDF import from extension (currently app-only)
- [ ] Application status syncing with tracker
- [ ] Shortcut key to open sidepanel (e.g., Cmd+Shift+1)
- [ ] Sync data to Supabase for multi-device access

## Development Notes

### Selector Difficulty Matrix

| Site | Difficulty | Why | Maintenance |
|------|-----------|-----|-------------|
| Greenhouse | Easy ✓ | Stable HTML, clear naming | Low |
| Lever | Easy ✓ | Clean, predictable forms | Low |
| LinkedIn | Medium ⚠️ | Obfuscated classes, dynamic modal | Medium |
| Indeed | Medium ⚠️ | iframe-based, requires cross-frame | Medium |
| Workday | Hard ✗ | Shadow DOM, SPA, frequent changes | High |
| iCIMS | Medium ⚠️ | Legacy, inconsistent per customer | Medium |

### Testing Sites for Each Platform

- **LinkedIn**: https://www.linkedin.com/jobs/search?keywords=product+manager
- **Indeed**: https://www.indeed.com/jobs?q=product+manager
- **Greenhouse**: https://boards.greenhouse.io/example (example company board)
- **Lever**: https://jobs.lever.co/example (example company board)
- **Workday**: https://jobs.company.com (company using Workday)

### Common Debugging

**Problem:** "No job detected"
- Open DevTools (F12) → Console
- Search for `[1stStep]` log messages
- Check if `jobDescriptionSelector` matches any elements

**Problem:** "Auto-fill fills wrong field"
- Inspect form element in DevTools
- Check selector in `sites/{site}.js`
- Test selector with `document.querySelector(selector)`

**Problem:** Extension not loading
- Check manifest.json for syntax errors
- Verify all `import` statements have correct paths
- Ensure no circular imports between modules

## API Integration

### Backend Endpoints Used

```
POST /api/claude
├── callType: 'tailor'          → Tailored resume
├── callType: 'cover_letter'    → Cover letter (Complete tier only)
├── callType: 'interview'       → Interview prep (Complete tier only)
├── callType: 'autofill'        → Field map for form auto-fill
└── callType: 'utility'         → Generic utility calls

POST /api/track-event
└── event: 'extension_apply'    → Log application in GHL

GET /api/subscription?email=x@y.com
└── Returns: { tier, tierToken, status }
```

### Tier-Based Features

| Feature | Free | Complete |
|---------|------|----------|
| Resume tailor | 3x | Unlimited |
| Auto-fill | ✓ | ✓ |
| Cover letter | ✗ | ✓ |
| Interview prep | ✗ | ✓ |

## Contributing

### Adding Support for a New Job Site

1. Create `sites/newsite.js` with selectors:
   ```javascript
   export default {
     jobDescriptionSelector: '...',
     jobTitleSelector: '...',
     companySelector: '...',
     applyButtonSelector: '...',
     formFields: { firstName: '...', ... }
   };
   ```

2. Add to `manifest.json` host_permissions:
   ```json
   "https://www.newsite.com/*"
   ```

3. Add to `content.js` site detection:
   ```javascript
   if (hostname.includes('newsite.com')) return 'newsite';
   ```

4. Test with real job posting

### Debugging Content Script

Content scripts execute in the page context. To debug:

1. Open DevTools on the job page (F12)
2. Content script logs appear in **Console** tab
3. Use `[1stStep]` prefix to find logs

### Testing Storage

```javascript
// In popup/sidepanel console:
chrome.storage.sync.get(null, (data) => console.log(data));

// Clear storage:
chrome.storage.sync.clear();
```

## Deployment

### Chrome Web Store

1. Create account at https://chrome.google.com/webstore/developer/dashboard
2. Package extension: `zip -r 1ststep-extension-v0.1.0.zip 1ststep-extension/`
3. Upload ZIP, fill metadata, submit for review
4. Review takes ~3-5 days

### Update Checklist Before Store Submission

- [ ] Version bumped in `manifest.json`
- [ ] All console errors resolved (`chrome://extensions` → Details → Errors)
- [ ] Icons added to `icons/` folder
- [ ] Privacy policy URL set (must exist at 1ststep.ai)
- [ ] Permissions minimized (no overly broad permissions)
- [ ] Tested on all supported job sites

## Questions?

See [1ststep-architecture.html](../1ststep-architecture.html) → **Extension** tab for full technical spec.

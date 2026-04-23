# CLAUDE.md — 1stStep.ai Job Application Extension

This file tells Claude Code everything it needs to know about this project's
structure, conventions, and rules. Read this before creating or editing any file.

---

## ⚡ SESSION START — DO THIS FIRST, EVERY SINGLE TIME

Before touching ANY file or writing ANY code, run all four of these commands
and show the user the output. No exceptions.

```bash
# 1. See what has already been built and committed — never redo this work
git log --oneline -20

# 2. See any uncommitted changes sitting in the project right now
git status

# 3. See the full file tree so you know exactly where everything lives
find . -not -path '*/node_modules/*' -not -path '*/.git/*' | sort

# 4. Confirm which branch you are on
git branch
```

After running these four commands, summarize:
- What was the last thing worked on (from git log)
- What files are changed but not committed (from git status)
- What the current folder structure looks like (from find)
- Only THEN ask what the user wants to do next

**Why this matters:** Multiple AI tools (Aider, Copilot, Claude Code) work on
this project. Git is the source of truth. Never assume you know what exists —
always check first or you will duplicate work that is already done.

---

## ⚡ BEFORE EVERY TASK CHECKLIST

Before starting any task the user gives you:
1. Have you read this CLAUDE.md fully? If not, read it now.
2. Have you run the four session start commands above? If not, run them now.
3. Does the file you are about to create already exist? Check the find output.
4. Has this task already been done in a recent commit? Check git log.
5. Do you know exactly which folder the file belongs in? Check the folder structure table below.

If the answer to any of these is NO — stop and do that step before proceeding.

---

## ⚡ BEHAVIOR RULES

- Never ask the user for information you can get by reading the project yourself
- Never create a file without checking if it already exists first
- Never repeat work that git log shows is already committed
- Never put a file in the wrong folder — check the placement table every time
- Always make changes directly without asking Y/N confirmation unless it is a destructive action like deleting files
- If a task is unclear, make your best guess based on CLAUDE.md context and show the user what you did

---

## Project Overview

A Chrome MV3 extension that auto-fills job application forms on sites like
Workday, Greenhouse, and Lever. The companion web app lives at app.1ststep.ai
and handles resume building, AI tailoring, and subscription management.

The extension reads the user's resume from `chrome.storage.local` and uses
site-specific detector scripts to map form fields and fill them automatically.

---

## Folder Structure

```
1ststep-extension/
├── CLAUDE.md                     ← you are here
├── manifest.json                 ← MV3 manifest (do not auto-edit)
├── background.js                 ← service worker: storage, messaging hub
├── content.js                    ← injected on app.1ststep.ai: postMessage relay
│                                    between the web app and chrome.storage
├── filler.js                     ← shared autofill engine consumed by all site scripts
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── sites/                        ← ONE file per job board — all site-specific logic lives here
│   ├── workday.js                ← Workday SPA detector (Shadow DOM walker)
│   ├── greenhouse.js
│   ├── lever.js
│   ├── ashby.js
│   └── icims.js
└── app/                          ← files that run on app.1ststep.ai
    └── resume-builder.js         ← 5-step resume wizard + AI bullet enhancer
```

---

## Absolute File Placement Rules

These rules are non-negotiable. Follow them on every file create or edit.

| File type | Correct location | Never place in |
|---|---|---|
| Site-specific detectors | `sites/<sitename>.js` | root, `app/`, `popup/` |
| App-side UI / wizards | `app/<name>.js` | root, `sites/` |
| Shared autofill logic | `filler.js` (root) | `sites/`, `app/` |
| Background / service worker | `background.js` (root) | anywhere else |
| Content script relay | `content.js` (root) | anywhere else |
| Popup UI | `popup/popup.html`, `popup/popup.js`, `popup/popup.css` | root |
| New job board support | `sites/<boardname>.js` | anywhere else |

**If you are unsure where a file belongs, ask before creating it.**

---

## Architecture & Data Flow

```
app.1ststep.ai (resume-builder.js)
        │
        │  window.postMessage({ type: '1ststep_save_resume', ... })
        ▼
content.js  (injected on app.1ststep.ai)
        │
        │  chrome.storage.local.set({ '1ststep_resume': { text, builderData, savedAt } })
        ▼
chrome.storage.local
        │
        │  chrome.storage.local.get('1ststep_resume')
        ▼
background.js  (service worker)
        │
        │  chrome.tabs.sendMessage / chrome.scripting.executeScript
        ▼
sites/workday.js  (or greenhouse.js, lever.js, etc.)
        │
        │  detectFields() → fieldMap
        │  applyValues(fieldMap, resume)
        ▼
filler.js  (shared fill engine — fillField, dispatchReactEvents)
```

### Why postMessage instead of direct chrome.storage from the app page?
`chrome.storage` is only available in extension contexts (background, content
scripts, popup). The web app at app.1ststep.ai is a normal web page — it cannot
call `chrome.storage` directly. `content.js` is injected into that page and acts
as the relay: it listens for `window.postMessage` and forwards the data into
`chrome.storage.local`.

---

## Key Files — What Each One Does

### `background.js`
- Service worker (MV3 — no persistent state, event-driven only)
- Owns the `chrome.storage` read/write API for all other scripts
- Handles `chrome.runtime.onMessage` from content scripts and popup
- Routes autofill triggers to the correct site script via `chrome.scripting.executeScript`

### `content.js`
- Injected on `https://app.1ststep.ai/*`
- Sole purpose: relay `window.postMessage({ type: '1ststep_save_resume' })`
  from the web page into `chrome.storage.local`
- Must validate `event.source === window` and `event.data.source === 'app'`
  before writing to prevent spoofing

### `filler.js`
- Shared library — do NOT add site-specific logic here
- Exports: `fillField(el, value)`, `dispatchReactEvents(el)`
- Uses native input value setter + bubbling events so React/Angular/Vue
  all acknowledge the change (Workday requires this — `.value =` alone fails)

### `sites/workday.js`
- Workday is a deeply nested SPA with multiple layers of Shadow DOM
- Uses `deepQueryAll()` to pierce shadow roots recursively
- `detectWorkdayFields(contextRoot)` → returns `{ fields, isReady, formStep }`
- `observeWorkdaySteps(onStepChange)` → MutationObserver with debounce + retry
- `applyWorkdayValues(fieldMap, values)` → calls `filler.js fillField` per field
- Exports attached to `window.__1stStep.workday` (no ES module system in MV3 content scripts)

### `app/resume-builder.js`
- 5-step wizard modal injected into app.1ststep.ai
- Step 1: Profile, Step 2: Experience, Step 3: Education, Step 4: Skills, Step 5: Review
- AI features: `enhanceBullets()` (Haiku), `inferResponsibilities()` (Haiku)
- Truth-check panel: flags AI-invented metrics with `[VERIFY: X]` before saving
- `resumeToPlainText(r)` converts structured JSON → plain text for ATS + tailoring engine
- On "Use with Resume Tailor": calls `saveResume()` AND `_rbSyncToExtension()`
  to write into both app localStorage and chrome.storage via postMessage relay

---

## Storage Keys

| Key | Storage | Written by | Read by |
|---|---|---|---|
| `1ststep_resume` | `chrome.storage.local` | `content.js` (relayed from app) | `background.js`, `sites/*.js` |
| `1ststep_sub_cache` | `localStorage` (app origin) | subscription API response handler | `resume-builder.js`, API call headers |
| `1ststep_li_auth` | `localStorage` (app origin) | LinkedIn OAuth callback | `resume-builder.js` (polled, then deleted) |

---

## Messaging Protocol

### App page → Extension (resume save)
```js
// Sent by: app/resume-builder.js _rbSyncToExtension()
window.postMessage({
  type:   '1ststep_save_resume',
  source: 'app',               // required — content.js checks this
  resume: {
    text:        '<plain text string>',
    builderData: { /* MASTER_RESUME_SCHEMA object */ },
    savedAt:     '<ISO timestamp>',
  },
}, window.location.origin);
```

### Content script → Background (generic relay)
```js
chrome.runtime.sendMessage({ type: '...', payload: { ... } });
```

### Background → Site script (trigger autofill)
```js
chrome.scripting.executeScript({
  target: { tabId },
  files:  ['sites/workday.js'],
});
```

---

## Workday Shadow DOM Rules

Workday renders inside multiple nested Shadow roots. Standard `querySelector`
does not pierce them. Always use the helpers in `sites/workday.js`:

```js
// WRONG — won't find anything inside Shadow DOM
document.querySelector('input[data-automation-id]')

// RIGHT — pierces all shadow roots recursively
deepQueryAll(document, ['input[data-automation-id]'])
```

React-managed inputs require native setter + events — `.value =` alone is ignored:
```js
// WRONG
el.value = 'John';

// RIGHT (see fillField in filler.js)
nativeInputValueSetter.call(el, 'John');
el.dispatchEvent(new Event('input',  { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
```

---

## Adding a New Job Board

1. Create `sites/<boardname>.js` — never in root or app/
2. Follow the same export pattern as `workday.js`:
   ```js
   window.__1stStep = window.__1stStep ?? {};
   window.__1stStep.<boardname> = { detectFields, applyValues };
   ```
3. Add the site's URL match pattern to `manifest.json` content_scripts
4. If the site uses React/Angular/Vue, use `filler.js fillField` — do not set `.value` directly
5. Update the manifest `content_scripts` array — do not use `all_urls`

---

## manifest.json Content Scripts (current)

```json
"content_scripts": [
  {
    "matches": ["https://app.1ststep.ai/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  },
  {
    "matches": [
      "https://*.myworkday.com/*",
      "https://*.wd1.myworkdayjobs.com/*",
      "https://*.wd3.myworkdayjobs.com/*",
      "https://*.wd5.myworkdayjobs.com/*"
    ],
    "js": ["filler.js", "sites/workday.js"],
    "run_at": "document_idle"
  }
]
```

---

## AI API Calls

- All Claude API calls go through `/api/claude` (internal proxy) — never call
  `api.anthropic.com` directly from client-side code
- Always use `claude-haiku-4-5-20251001` for utility calls (bullet enhance,
  infer responsibilities) — fast and cheap
- Always pass `callType`, `userEmail`, and `tierToken` in the request body
- Always strip markdown fences before `JSON.parse()` on AI responses:
  ```js
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  ```

---

## Things Claude Code Must Never Do

- **Never** create a new `sites/` file in the project root
- **Never** use `document.querySelector` inside `sites/workday.js` without
  going through `deepQueryAll` / `deepQuery`
- **Never** set `el.value = x` directly for React-managed inputs — use `fillField`
- **Never** call `chrome.storage` from `app/resume-builder.js` — use postMessage relay
- **Never** add persistent state to `background.js` — it is a MV3 service worker
  and will be terminated; use `chrome.storage` for anything that must persist
- **Never** use ES module `import`/`export` syntax in content scripts or site
  scripts — MV3 content scripts do not support modules; use `window.__1stStep` namespace
- **Never** edit `manifest.json` without being explicitly asked to

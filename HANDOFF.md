# 1stStep.ai — Developer Handoff
_Last updated: 2026-04-24_

## What this repo is

Single-page vanilla HTML/JS/CSS app deployed on Vercel static hosting.  
Live URL: **https://app.1ststep.ai**  
GitHub: **https://github.com/1ststepai/1ststep-resume**

Three core files:

| File | Purpose |
|---|---|
| `index.html` | All markup — ~2,000 lines (was 12,000 before refactor) |
| `app.js` | All application logic — ~5,950 lines |
| `style.css` | All styles — extracted from inline blocks |

Additional JS loaded at bottom of `index.html`:
- `resume-builder.js` — step-by-step wizard modal, defines `openResumeBuilder()`
- `workday.js` — Workday ATS auto-filler

---

## Recent work completed (April 2026)

### 1. Full SaaS UI redesign (merged PR #2)
- Dark mode by default, light/dark toggle (`#themeToggle`)
- All colors in CSS variables (`:root`), light mode via `[data-theme="light"]`
- 2-column CSS grid (`#resumeGrid`) for desktop layout
- `#quickSidebar` moved from `position:fixed` to `position:sticky`
- Tailwind CDN added with `preflight: false`

### 2. Code quality refactor (same PR)
- Extracted all `<style>` blocks → `style.css`
- Extracted all `<script>` blocks → `app.js`
- Converted all static inline `onclick`/`ondrop`/`ondragover`/`ondragleave` → `addEventListener` inside a single `DOMContentLoaded` callback (lines 9–422 of `app.js`)
- `index.html` went from ~12,042 lines to ~1,998 lines
- Zero inline `onclick` on static elements

Remaining allowlisted inline handlers (intentional):
- `onkeydown` Enter shortcuts on 3 inputs
- `onchange="handleJsFileSelect(event)"` on `jsFileInput` (dynamic clone pattern)
- `onfocus`/`onblur` border-color styling (11 each)
- `onmouseover`/`onmouseout` footer link color swaps (6 each)

### 3. Beta/paywall access system overhaul
**File:** `app.js` — `checkBetaAccess()` function

Priority order (Rules 1–5):

```
Rule 1: Owner email (evan@1ststep.ai) → always Complete, skip all gates
Rule 2: Paid Stripe subscriber → their tier, skip gates
Rule 3: Expired beta user with grantedAt → Complete (grace period)
Rule 4: Active beta token (not expired) → Complete + badge timer
Rule 5: New user → betaGate (beta mode) or paywallGate (live mode)
```

Key constants:
```js
const DEV_EMAIL = 'evan@1ststep.ai';       // owner bypass
const BETA_GRACE_PERIOD = true;             // set false to enforce token expiry
```

`verifySubscription()` has an early-return guard for DEV_EMAIL to prevent Stripe from overwriting the Complete tier.

`getAppConfig()` (network call to `/api/app-config`) is deferred to Rule 5 only — Rules 1–4 are synchronous.

**To end the grace period:** set `BETA_GRACE_PERIOD = false`. Expired users will see `#betaExpired` overlay instead of getting Complete access.

### 4. Bug fix: welcome buttons were unclickable
**Root cause:** `addEventListener('click', downloadResume)` on line 228 of `app.js`. `downloadResume` was never defined — throwing `ReferenceError` that crashed the entire `DOMContentLoaded` callback before the welcome button listeners (lines 372–374) were attached.

**Fix:** changed `downloadResume` → `downloadDocx` on line 228.

**Impact:** affected ALL users on first visit — "Build Resume" and "Use Existing Resume" buttons did nothing. `1ststep_welcomed` was never set so users were stuck in the welcome loop on every visit.

### 5. QA / safety system
**New files:**
- `scripts/smoke-test.cjs` — run with `node scripts/smoke-test.cjs`
- `.github/workflows/qa.yml` — runs smoke test on every push/PR to main

**What the smoke test checks:**
1. Required files exist (`index.html`, `app.js`, `style.css`)
2. HTML structure (`style.css`/`app.js` linked, one `</body>`/`</html>`, no orphaned content)
3. No duplicate `id=` attributes
4. 34 required DOM element IDs present
5. 23 required global functions declared in `app.js`
6. **All bare function references in `addEventListener` calls resolve to declared functions** ← catches the welcome button bug class
7. No unexpected inline `<script>`/`<style>` blocks

**Build fails on:** missing required elements/functions, duplicate IDs, `onclick`/`ondrop`/`ondragover`/`ondragleave` inline handlers, or an `addEventListener(type, undeclaredFn)` call.

**Rollback tag:** `v0.9.0-stable-ui` — the state before QA system was added.

---

## Architecture notes

### State
```js
let currentTier = localStorage.getItem('1ststep_tier') || 'free';
// Modified only by: checkBetaAccess(), verifySubscription(), setTier()
```

### localStorage keys
| Key | Contents |
|---|---|
| `1ststep_beta` | `{ email, expiresAt, grantedAt }` — beta token |
| `1ststep_sub_cache` | `{ email, tier, ts, tierToken }` — Stripe sub cache |
| `1ststep_tier` | `'free'` / `'essential'` / `'complete'` |
| `1ststep_profile` | `{ email, firstName, lastName }` |
| `1ststep_welcomed` | `'1'` when user has clicked through welcome overlay |
| `1ststep_theme` | `'dark'` / `'light'` |

### Access check sequence (on every page load)
1. Main `DOMContentLoaded` (line 9) fires — wires all event listeners, shows welcome overlay if `!1ststep_welcomed`
2. Beta check `DOMContentLoaded` (line 4590) fires — creates `accessCheckCover` (z-index 99998), calls `checkBetaAccess()`
3. `checkBetaAccess()` resolves → cover fades and removes after 220ms
4. If Rule 5: gate overlay shown; user submits code → `submitBetaCode()` → gate hidden, welcome shown

### Z-index stack
```
99999  resumeBuilderModal (dynamically created)
99998  accessCheckCover (transient — removed after 220ms)
10000  paywallVerify
 9999  betaGate / betaExpired / paywallGate
 9998  welcomeOverlay
 1300  linkedInPdfModal
 1200  interviewModal / diffModal / templatePickerOverlay
 1000  upgradeModal / profileModal
```

### Event delegation
Two delegated patterns (not direct element binding):
- `.radius-options` → radius buttons via `data-r` attribute
- `.jtype-options` → job type buttons via `data-type`, calls `toggleJobType(btn, type)`

### API endpoints (Vercel serverless functions in `/api/`)
- `/api/app-config` — returns `{ betaMode: boolean }`
- `/api/beta` — validates invite code, returns `{ valid, expiresAt, tierToken }`
- `/api/claude` — proxies Claude API calls
- `/api/stripe-verify` — verifies Stripe subscription

---

## How to run locally

**Static (no API):**
```bash
npx serve -p 4200 -s .
# Visit http://localhost:4200
# API calls will fail — beta/paywall logic falls back safely
```

**With API (full stack):**
```bash
npx vercel dev --listen 3000 --yes
# Requires .env with ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, etc.
```

**QA check:**
```bash
node scripts/smoke-test.cjs
```

---

## Known future work (not started)

- Convert dynamic job card / tracker row inline handlers using event delegation
- Convert remaining `onkeydown`/`onfocus`/`onblur`/`onmouseover` handlers
- Set `BETA_GRACE_PERIOD = false` when pricing is stabilized
- Add `#jobSearchBtn` to the HTML (referenced in `app.js` but not in `index.html` — currently a no-op)
- `heroSection`, `profilePct`, `profileProgressFill`, `autofillBtn`, `autofillBanner`, `toastUndoBtn`, `tailorUpgradeNudge`, `profileBadgeText`, `_restoreFileInput` — IDs referenced in `app.js` but not currently in `index.html` (dead code paths or removed elements)

# BUGS.md — 1stStep.ai
> Source of truth for all known issues. Update this file every time a bug is fixed or discovered.
> Aider: read this before touching any file. Never re-introduce a fixed bug. Never fix what isn't listed here unless told to.

---

## Severity Key
- 🔴 **CRITICAL** — blocks users or deployment
- 🟡 **HIGH** — degrades experience significantly
- 🔵 **MEDIUM** — polish / revenue risk
- ✅ **FIXED** — resolved, kept for reference

---

## 🔴 CRITICAL

### BUG-001 — Vercel at 12/12 function hard limit
**File:** `vercel.json` + any new `/api/*.js`
**Status:** IN PROGRESS
**Root cause:** Vercel Hobby plan caps at 12 serverless functions. All 12 slots are used. Any new `/api/*.js` file (without `_` prefix) will break the entire deployment silently.
**Fix:**
- NEVER create a new `/api/*.js` file without checking this first
- Add new features via `?action=` query params on existing endpoints
- OR retire `jobs.js` first (see BUG-002) to free one slot
- OR upgrade to Vercel Pro for unlimited functions
**Test:** `vercel ls` — count files in `/api/` without `_` prefix. Must stay ≤ 12.

---

### BUG-002 — jobs.js (job search) is fragile and should be retired
**File:** `api/jobs.js`
**Status:** OPEN — scheduled for retirement
**Root cause:** Indeed scraper (unofficial) breaks silently when Indeed changes their DOM. No fallback when both Adzuna + Indeed fail. Feature is also being cut from the product.
**Fix:**
- Remove job search tab from UI entirely
- Replace with URL/paste JD input field
- Delete `api/jobs.js` — this frees 1 Vercel function slot
- Remove `ADZUNA_API_KEY` from env vars after confirming no other code references it
**Note:** Do NOT add any fallback. This feature is being removed, not fixed.

---

### BUG-003 — localStorage data loss: no cloud backup
**File:** `index.html` (all localStorage reads/writes)
**Status:** OPEN
**Root cause:** All user data (resume, tailor history, applications, profile) lives only in `localStorage`. Browser clear, private mode, or device switch permanently destroys the user's work.
**Keys affected:**
- `1ststep_profile`
- `1ststep_resume`
- `1ststep_tailor_history`
- `1ststep_applications`
- `1ststep_jobs_cache` (retiring with jobs.js)
**Fix:** Add optional Supabase cloud backup, email-keyed. localStorage remains primary (offline-first), Supabase is the sync layer.
**Prerequisite for:** Chrome Extension profile sync (EXT-BUG-001).

---

### BUG-004 — Essential tier still in codebase (must be collapsed)
**Files:** `api/subscription.js`, `api/claude.js`, `index.html` (UI tier checks)
**Status:** OPEN
**Root cause:** Product now has only two tiers: Free and Complete. The `essential` tier branch still exists in subscription.js tier checks, claude.js callType guards, and the UI.
**Fix:**
- In `subscription.js`: remove `essential` branch — treat any non-`complete` paid user as `complete`
- In `claude.js`: simplify tier guard to `if tier === 'free'` else complete behavior
- In UI: remove any Essential pricing cards, CTAs, or copy
- In Stripe: archive the Essential product (do not delete — preserves existing subscriber history)
**Note:** Do not break existing Essential subscribers. Map them to Complete automatically.

---

## 🟡 HIGH

### BUG-005 — No rate limiting on claude.js
**File:** `api/claude.js`
**Status:** OPEN
**Root cause:** Any user (even free) can hammer `/api/claude` without throttling. No Upstash or in-memory rate limiter in place.
**Fix:** Add Upstash Redis sliding window rate limit. Suggested limits:
- Free: 3 lifetime tailors (enforced already via tierToken, but add IP-level guard)
- Complete: 50 calls/hour soft cap, 200/day hard cap
**Risk if not fixed:** A single bad actor can drain Anthropic API credits.

---

### BUG-006 — Vercel cold start causes ~2s delay on first AI call
**File:** `api/claude.js`
**Status:** OPEN (known, low-priority workaround exists)
**Root cause:** Vercel Hobby serverless functions cold-start after ~5 min idle. Users on free trial hit this on their first tailor attempt — looks like a hang.
**Fix (UX, no infra change):** Add a "warming up…" message for the first 3 seconds of any AI call. Frontend change only.
**Long-term fix:** Vercel Pro removes cold start concerns.

---

### BUG-007 — No error boundary for failed AI calls
**File:** `index.html` (all `fetch('/api/claude')` calls)
**Status:** OPEN
**Root cause:** If `claude.js` returns 500, times out, or Anthropic API is down, the UI shows a silent failure or a raw error object. No retry state.
**Fix:**
1. Wrap every `fetch('/api/claude')` in try/catch with explicit error state
2. On failure: "Something went wrong — your inputs are saved. Try again →" with a retry button
3. Differentiate: 429/503 = "Our AI is busy — try in 30s" / 500 = "Something went wrong" / 401 = "Session expired — refresh"
4. Log failures to `_alert.js` (Resend alert) when error rate spikes

---

### BUG-008 — Bulk Apply still exists in nav/codebase
**File:** `index.html` (nav), `api/claude.js` (bulk_apply callType)
**Status:** OPEN — scheduled for removal
**Root cause:** Bulk Apply is being cut from the product. Still appears in nav and claude.js callType list.
**Fix:**
- Remove from nav entirely
- Delete `bulk_apply` callType branch in `claude.js`
- Remove any UI components tied to bulk apply flow
**Note:** Do not build any replacement. This feature is gone.

---

### BUG-009 — Landing page pricing shows wrong tiers and wrong prices
**File:** `resume.1ststep.ai` (GHL landing page)
**Status:** OPEN
**Root cause:** Landing page still shows Essential ($49/mo) and Complete ($99/mo) with job search counts (40/mo, 80/mo). Product has changed to Free ($0) + Complete ($19/mo).
**Fix — full checklist:**
- [ ] Replace both Stripe buy links (old $49 link → new Complete product link)
- [ ] Update hero CTA: "Start for $49/mo →" → "Tailor your first resume free →"
- [ ] Replace pricing cards: Essential + Complete → Free + Complete
- [ ] Remove job search counts (40/mo, 80/mo) from all pricing copy
- [ ] Remove "Bulk apply mode" and "LinkedIn optimizer" from feature lists
- [ ] Add Interview Cheat Sheet + Application Tracker + AI Career Chat (coming soon) to Complete card
- [ ] Fix FAQ: "3 tailored resumes per month on Starter" → "3 lifetime on Free plan, no card required"
- [ ] Add FAQ: "Do you search for jobs?" → "No — paste the JD from any board"
- [ ] Update meta title from "AI Resume Tailoring SaaS" → "Your AI co-pilot for the job search"

---

### BUG-010 — No SEO / OG meta tags on landing page
**File:** `resume.1ststep.ai` (GHL landing page `<head>`)
**Status:** OPEN
**Root cause:** No Open Graph tags, no Twitter card, no meta description, no schema markup. Social shares preview as blank cards.
**Fix (add to `<head>`):**
- `<meta name="description" content="...">` — core description
- OG tags: `og:title`, `og:description`, `og:image` (1200×630 card), `og:url`
- Twitter card: `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`
- Schema: `Organization` + `Product` + `FAQPage` JSON-LD
- Use GHL's built-in SEO settings panel rather than raw HTML edits

---

## 🔵 MEDIUM

### BUG-011 — Stripe checkout: no trial or money-back framing
**Status:** OPEN
**Root cause:** Current Stripe checkout goes straight to charge with no risk reversal. Low conversion on cold traffic.
**Fix (pick one):**
- Option A: 7-day free trial via `trial_period_days` in Stripe Checkout config. Send day-5 reminder via GHL/Resend.
- Option B: Add "7-day money-back guarantee" copy below every CTA (no code change needed)
- Option C (with new Free tier): Upgrade prompt fires after tailor #2 (not #3 — catch while momentum is high)

---

### BUG-012 — index.html is 8,000+ lines — unmaintainable
**File:** `index.html`
**Status:** OPEN — long-term refactor
**Root cause:** Single-file SPA has grown to 8,000+ lines. Tracker, auth, resume builder, AI calls all mixed in one file.
**Fix (incremental — do not do all at once):**
1. Extract `tracker.js` (application tracker logic)
2. Extract `auth.js` (LinkedIn OAuth + session handling)
3. Remaining: keep index.html as shell + UI, logic in JS modules
**Note:** Do not attempt a full rewrite in one pass. Extract one module at a time.

---

### BUG-013 — GHL API slow — fire-and-forget not consistently applied
**File:** `api/track-event.js`, `api/notify-signup.js`, `api/ghl-stage.js`
**Status:** OPEN (partial — upsert and tag filter bugs already fixed ✅)
**Root cause:** GHL API can be slow (2–4s). Some calls are awaited unnecessarily, blocking the user response.
**Fix:** Ensure all GHL calls use fire-and-forget pattern (don't `await`, return 200 to frontend immediately).

---

## ✅ FIXED (keep for reference — do not re-introduce)

### FIXED-001 — GHL upsert used PUT instead of POST
**File:** `api/notify-signup.js`
**Fix:** Changed to `POST /contacts/upsert`. GHL requires POST for upsert — PUT returns 405.

### FIXED-002 — GHL tag filter returned 422
**File:** `api/ghl-stage.js`
**Fix:** Tag filter via query param not supported. Switched to: fetch all contacts, filter client-side.

---

## Extension-Specific Bugs

### EXT-BUG-001 — Extension cannot read app.1ststep.ai localStorage (origin block)
**Status:** OPEN — BLOCKING for extension launch
**Root cause:** Chrome extensions cannot access localStorage from a different origin. Extension has no access to the user's resume without a sync bridge.
**Fix (phased):**
- Phase 1 (now): Add "Copy to Extension" button in web app that writes profile to `chrome.storage` via deep link
- Phase 2 (with Supabase work): Extension reads profile from Supabase by email+token — the permanent fix

### EXT-BUG-002 — Workday uses Shadow DOM — standard querySelector won't work
**File:** `1ststep-extension/sites/workday.js`
**Status:** OPEN
**Fix:** Use `MutationObserver` + retry loop + `shadowRoot` traversal. Start with Greenhouse/Lever instead — stable selectors, high ROI.

### EXT-BUG-003 — React/Vue inputs need synthetic events, not just .value=
**File:** `1ststep-extension/utils/filler.js`
**Status:** OPEN
**Fix:** After setting `.value`, dispatch: `element.dispatchEvent(new Event('input', { bubbles: true }))` and `new Event('change', { bubbles: true })`.

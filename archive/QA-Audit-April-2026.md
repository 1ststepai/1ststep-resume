# 1stStep.ai — Full QA Audit
**Date:** April 13, 2026  
**Audited by:** Claude (static code + API analysis — live network blocked in sandbox)  
**Files audited:** `resume-app/index.html`, `api/claude.js`, `api/jobs.js`, `api/subscription.js`, `api/stripe-webhook.js`

---

## ⚠️ Top 10 Fixes (Priority Order)

| # | Issue | Severity | File |
|---|-------|----------|------|
| 1 | **Essential/Complete users hit server-side rate limits before plan limits** | 🔴 CRITICAL | `api/claude.js` |
| 2 | **CORS: `app.1ststep.ai` missing from `jobs.js` allowed origins — job search may be CORS-blocked** | 🔴 CRITICAL | `api/jobs.js` |
| 3 | **FormSubmit not confirmed — signup alert emails may never reach you** | 🔴 CRITICAL | `index.html` |
| 4 | **Subscription cancelled / payment failed → no GHL update, no email alert** | 🔴 HIGH | `api/stripe-webhook.js` |
| 5 | **GHL free signup identification is client-side and unreliable** | 🟠 HIGH | `index.html` |
| 6 | **No real auth system — account = localStorage only; no login, no password, no verification** | 🟠 HIGH | `index.html` |
| 7 | **Google Review button links to mailto, not Google Business Profile** | 🟡 MEDIUM | `index.html` |
| 8 | **`var(--fg)` CSS variable used in Bulk Apply — not defined in redesign, falls back to default** | 🟡 MEDIUM | `index.html` |
| 9 | **Footer uses `var(--dark2)` / `var(--dark3)` — dark-mode vars that now map to light colors** | 🟡 MEDIUM | `index.html` |
| 10 | **LinkedIn optimizer has no explicit tier gate — accessible to free users** | 🟡 MEDIUM | `index.html` |

---

## Full Pass/Fail Table

| Feature | Status | Notes |
|---------|--------|-------|
| Signup (account creation) | ⚠️ PARTIAL | Name + email saved to localStorage only. No real account, no email sent to user, admin alert may not work (FormSubmit unconfirmed). |
| Login | ❌ FAIL | Doesn't exist. No login screen, no session, no password. User re-enters email manually each time. |
| Password reset | ❌ FAIL | Doesn't exist. No auth backend. |
| Email verification | ❌ FAIL | Doesn't exist. Email is accepted with no verification. |
| Resume upload (PDF/DOCX/TXT) | ✅ PASS | `mammoth` + `pdf.js` + `FileReader`. All 3 types handled. |
| Resume tailoring | ✅ PASS | Core flow works. Progress steps, streaming output, score rings. |
| Cover letter generation | ⚠️ PARTIAL | Gated to Complete only. Gate logic works client-side. |
| Saved resumes (tailor history) | ✅ PASS | localStorage history preserved, viewable in Tailored tab. |
| LinkedIn optimizer | ⚠️ PARTIAL | No tier gate — free users can access. Server-side monthly limit exists (8/mo) but no upgrade prompt on limit hit. |
| Job search | ⚠️ PARTIAL | `app.1ststep.ai` likely CORS-blocked from `api/jobs`. Needs verification. |
| Bulk apply | ✅ PASS | Properly gated to Complete. Upgrade gate shown for other tiers. |
| Job tracker | ✅ PASS | Add, edit, delete, status tracking all work client-side. |
| Pricing page | ✅ PASS | `pricing.html` exists with correct Stripe links. |
| Upgrade / checkout | ✅ PASS | Modal renders, Stripe links correct for both plans and annual/monthly. |
| Plan enforcement — Free limits | ✅ PASS | 3 tailors / 3 searches / 3 cover letters client-side. |
| Plan enforcement — Essential limits | ⚠️ PARTIAL | Client says 25 tailors / 40 searches. Server blocks at 15 / 30. Essential users will hit 429 before plan limits. |
| Plan enforcement — Complete limits | 🔴 FAIL | Client says 999 tailors / 80 searches. Server blocks at 15 tailors / 30 searches. Complete users are severely over-blocked. |
| Support / bug report | ✅ PASS | Footer `mailto:` link. Opens mail client. Works but isn't automatic — depends on user actually sending. |
| Review prompt | ⚠️ PARTIAL | Triggers correctly at 1st / 5th / every 10th apply. But Google Review button goes to `mailto:` not real Google review link. |
| Mobile UX | ⚠️ PARTIAL | Single-column layout is responsive. Nav tabs scroll horizontally. Score rings may overflow on small screens. |
| Empty states | ✅ PASS | Tailored resumes, tracker, job search all have empty state UI. |
| Admin new signup alert | ⚠️ PARTIAL | FormSubmit.co used — REQUIRES one-time activation email to be confirmed. If not done, 0 signup emails arrive. |
| Admin new paid subscriber alert | ✅ PASS | Stripe webhook → GHL contact upsert fires on `checkout.session.completed`. |
| Admin cancellation alert | ❌ FAIL | `customer.subscription.deleted` handler does `console.log` only. No email, no GHL update. |
| Admin payment failure alert | ❌ FAIL | `invoice.payment_failed` handler does `console.log` only. No email, no GHL update. |
| GHL — free signup contact | ⚠️ PARTIAL | Uses `LeadConnector.setCustomerData()` — client-side, fires only if GHL widget has loaded. Unreliable, silent fail. |
| GHL — paid signup contact | ✅ PASS | Server-side upsert via `/contacts/upsert`. Fires on Stripe checkout. |
| GHL — cancellation tag update | ❌ FAIL | No GHL call on cancellation. Tags remain `['paid', tier]` forever. |
| All emails to user | ❌ FAIL | No transactional emails to user exist — no welcome, no receipt confirmation beyond Stripe's default, no renewal reminder from your system. |

---

## Detailed Findings

### 🔴 BUG 1 — Server-side limits block paying users (CRITICAL)

**Root cause:** Monthly IP limits in `api/claude.js` were designed for free-tier abuse prevention but apply to ALL users including paid.

**Current limits:**
```
Server:   tailor: 15,  coverLetter: 15,  search: 30,  linkedin: 8
Client:   Essential: 25 tailors / 40 searches / 25 cover letters
          Complete: 999 tailors / 80 searches / 999 cover letters
```

An Essential user ($49/mo) is promised 25 tailors but the server cuts them off at 15.  
A Complete user ($99/mo) is promised effectively unlimited tailors but gets cut off at 15.

**Fix — `api/claude.js`:** Raise server limits to safely above the highest plan limits, keeping them as abuse-only backstop:

```javascript
const MONTHLY_IP_LIMITS = {
  tailor:      200,   // Complete plan = "unlimited" — 200 is backstop only
  coverLetter: 200,
  search:      150,   // Complete plan = 80 — 150 is backstop
  linkedin:    50,
};
```

---

### 🔴 BUG 2 — Job search CORS-blocked from app.1ststep.ai

**Root cause:** `api/jobs.js` ALLOWED_ORIGINS:
```javascript
const ALLOWED_ORIGINS = [
  'https://1ststep.ai',
  'https://www.1ststep.ai',   // ← app.1ststep.ai is MISSING
];
```
When browser sends `Origin: https://app.1ststep.ai`, the CORS check fails and no `Access-Control-Allow-Origin` header is returned. Browser blocks the response. All job searches from the app subdomain may silently fail.

**Fix — `api/jobs.js`:**
```javascript
const ALLOWED_ORIGINS = [
  'https://1ststep.ai',
  'https://www.1ststep.ai',
  'https://app.1ststep.ai',   // ← ADD THIS
];
```

---

### 🔴 BUG 3 — FormSubmit signup emails may not be working

**Root cause:** FormSubmit.co requires a one-time confirmation email to be clicked before it will forward submissions. If you haven't received and clicked a confirmation email from FormSubmit for `evan@1ststep.ai`, every new signup notification is silently dropped.

**How to verify:** Go to formsubmit.co and look for a confirmation link, or create a test account, trigger a new signup in the app, and check if you receive the email. If not, check your spam for a FormSubmit confirmation email.

**Fix options:**
- Option A: Check your email for the FormSubmit activation email and confirm it.
- Option B (more reliable): Replace FormSubmit with a proper `/api/notify` serverless endpoint that sends via Resend or Sendgrid, so you're not dependent on a third-party form service.

---

### 🔴 BUG 4 — Cancelled/failed subscriptions do nothing in GHL

**Root cause:** These webhook handlers in `api/stripe-webhook.js` only `console.log`:
```javascript
case 'customer.subscription.deleted': {
  console.log(`❌ Subscription cancelled — id: ${sub.id}`);
  break;  // ← That's it. No GHL, no email.
}
case 'invoice.payment_failed': {
  console.log(`⚠️  Payment failed — customer: ...`);
  break;  // ← Same. Nothing.
}
```

**Impact:** You have no visibility into churn. GHL contacts keep the `['paid', tier]` tags forever. You can't trigger win-back automations.

**Fix — `api/stripe-webhook.js`:** Add GHL tag updates and admin email to both events:
```javascript
case 'customer.subscription.deleted': {
  const sub = event.data.object;
  const email = sub.customer_email || '';
  // Update GHL — remove paid tag, add churned
  await updateGHLOnCancel({ customerId: sub.customer, status: 'cancelled' });
  // Email Evan
  await sendAdminAlert(`Subscription cancelled`, `Customer: ${sub.customer}`);
  break;
}
```

---

### 🟠 BUG 5 — Free-user GHL identification is client-side and unreliable

**Root cause:**
```javascript
if (typeof window.LeadConnector !== 'undefined' && window.LeadConnector.setCustomerData) {
  window.LeadConnector.setCustomerData({ email: p.email, name: fullName });
}
```
This depends on the GHL chat widget having loaded and exposed `LeadConnector.setCustomerData`. If the widget loads slowly, is blocked by an ad blocker, or hasn't fully initialized, the call silently fails. No retry beyond one 3-second timeout.

**Fix:** Add a proper `/api/notify-signup` serverless endpoint that directly calls the GHL contacts API, same as the Stripe webhook does. This way signup identification is reliable and server-side.

---

### 🟠 BUG 6 — No real auth system

**Current state:** "Account" = `{ firstName, lastName, email }` in `localStorage['1ststep_profile']`. There is no:
- Login screen / session
- Password or password reset
- Email verification
- Server-side session
- Way to recover account if localStorage is cleared

**Impact:** Any user who clears their browser data loses their "account." Paid users who upgrade are linked to their email via Stripe, but the app has no way to verify identity — anyone can type any email to claim any subscription.

**Note:** For your current stage this is likely intentional (frictionless onboarding). The main risk is subscription spoofing — typing a paying user's email to get their tier. The `verifySubscription()` call does check Stripe server-side, which mitigates this somewhat.

**Fix:** For now, add a note to your roadmap. Immediate partial fix: verify the email format server-side in `/api/subscription` before returning tier data.

---

### 🟡 BUG 7 — Google Review button goes to mailto instead of Google Business

**Root cause:** The `googleReviewBtn` was never updated with a real Google Business Profile URL:
```javascript
// ⚙ Replace the PLACEHOLDER in the Google review link with your actual
//   Google Business Profile short URL once you've claimed your listing.
//   e.g.  https://g.page/r/YOUR_PLACE_ID/review
```

**Current value:**
```html
href="mailto:evan@1ststep.ai?subject=1stStep.ai Feedback..."
```

**Fix:** Claim your Google Business Profile at business.google.com, get the short review link, then update:
```html
id="googleReviewBtn" href="https://g.page/r/YOUR_ACTUAL_ID/review"
```

---

### 🟡 BUG 8 — `var(--fg)` undefined in Bulk Apply

**Root cause:** The Bulk Apply panel HTML uses `color:var(--fg)` in several inline styles, but `--fg` is not defined in the new CSS variable system (was removed when switching from dark mode). Falls back to browser default (black text on likely-black input background).

**Fix — `index.html`:** Replace `var(--fg)` with `var(--text)` in the Bulk Apply inline styles:
```javascript
// In addBulkJob() function, replace:
color:var(--fg)
// With:
color:var(--text)
```

---

### 🟡 BUG 9 — Footer uses dark-mode CSS variables

**Root cause:** The footer HTML was not updated during the redesign:
```html
background:var(--dark2)  → now resolves to --surface (#FFFFFF) — white footer ✓
color:var(--dark3)       → now resolves to --border2 (#CBD5E1) — light gray text ✓
```
Actually the alias mapping means this might be fine visually. Verify the footer looks correct at app.1ststep.ai.

---

### 🟡 BUG 10 — LinkedIn Optimizer has no tier gate

**Root cause:** The Bulk Apply panel has an explicit gate (`initBulkApplyPanel()` shows upgrade wall for non-Complete users). LinkedIn Optimizer calls `initLinkedInPanel()` which has no tier check — it just auto-loads the resume. The server-side monthly limit (`linkedin: 8`) will eventually stop free users, but:
1. There's no upgrade prompt when they hit it in LinkedIn (only raw 429 error handling)
2. Free users shouldn't be able to use this at all if it's meant to be a paid feature

**Fix — `index.html`:** In `initLinkedInPanel()` or `switchMode('linkedin')`, add:
```javascript
if (currentTier === 'free') {
  openUpgradeModal();
  return;
}
```

---

## Expected Email Triggers — Current State

| Trigger | Method | To | Status |
|---------|--------|-----|--------|
| New free signup | FormSubmit.co (client-side POST) | evan@1ststep.ai | ⚠️ May not work — needs FormSubmit activation |
| New paid subscriber | ❌ NONE — only GHL contact upsert | — | ❌ No email alert |
| Subscription cancelled | ❌ NONE | — | ❌ No email alert |
| Payment failed | ❌ NONE | — | ❌ No email alert |
| Welcome email to user | ❌ NONE | — | ❌ Never implemented |
| Upgrade confirmation to user | Stripe default receipt | user | ✅ Stripe sends automatically |
| Bug report from user | `mailto:` link in footer | user's mail client → evan@1ststep.ai | ⚠️ Depends on user completing send |
| Feedback/review from user | `mailto:` link in modal | user's mail client → evan@1ststep.ai | ⚠️ Same |

---

## Expected GHL Triggers — Current State

| Trigger | Method | Status |
|---------|--------|--------|
| Free user creates account | `LeadConnector.setCustomerData()` client-side | ⚠️ Unreliable — widget-dependent |
| Paid checkout completes | Server-side GHL contacts upsert + opportunity | ✅ Works (if env vars set) |
| Subscription plan upgrade | ❌ Not handled | ❌ Missing |
| Subscription cancelled | ❌ Not handled | ❌ Missing — tags never cleaned |
| Payment failed | ❌ Not handled | ❌ Missing |

---

## Missing Admin Alerts

You have **zero automated admin alerts** for the following events that you need visibility on:
1. New paid subscriber (you get a GHL contact, no email)
2. Subscription cancelled — **you won't know users are churning**
3. Payment failed — **you won't know users are about to churn**
4. High usage (users nearing plan limits — upgrade opportunity)
5. Server-side rate limit hit — could indicate abuse or a paying user being wrongly blocked

---

## Full QA Checklist

### Auth & Account
- [ ] Verify FormSubmit is activated (send a test signup, confirm email arrives)
- [ ] Confirm subscription spoofing is acceptable risk at current stage
- [ ] Add roadmap item: real auth (Clerk/Supabase) for v2

### Email Alerts (Admin)
- [ ] Confirm FormSubmit activation for signup alerts
- [ ] Add admin email alert on `customer.subscription.deleted`
- [ ] Add admin email alert on `invoice.payment_failed`
- [ ] Add admin email alert on new paid subscriber (currently only GHL)

### Transactional Emails (User)
- [ ] Add welcome email on first signup (via Resend/SendGrid in `/api/notify-signup`)
- [ ] Confirm Stripe sends upgrade receipt automatically (it does by default)
- [ ] Add renewal reminder 3 days before billing (set up in Stripe billing settings)

### GHL Automations
- [ ] Verify `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_PIPELINE_ID` are set in Vercel env vars
- [ ] Test: complete a Stripe checkout → confirm contact appears in GHL
- [ ] Add GHL tag update on cancellation (remove `paid`, add `churned`)
- [ ] Add GHL tag update on payment failure (add `payment_failed`)
- [ ] Replace client-side `setCustomerData()` free signup with server-side `/api/notify-signup`

### API / Backend
- [ ] Fix CORS in `api/jobs.js` — add `app.1ststep.ai` to ALLOWED_ORIGINS
- [ ] Fix monthly server limits in `api/claude.js` — raise to above plan ceilings
- [ ] Confirm `STRIPE_WEBHOOK_SECRET` is set in Vercel env vars
- [ ] Confirm `RAPIDAPI_KEY` is set in Vercel env vars
- [ ] Test Stripe webhook delivery in Stripe Dashboard → Webhooks → recent events

### Feature Gating
- [ ] Add tier gate to LinkedIn Optimizer (free users should see upgrade wall)
- [ ] Verify Essential users can actually do 25 tailors without server 429 (after BUG 1 fix)
- [ ] Verify Complete users can do 80+ searches without server 429 (after BUG 1 fix)

### UI / UX
- [ ] Replace `var(--fg)` with `var(--text)` in Bulk Apply panel inline styles
- [ ] Set real Google Business Profile URL in `googleReviewBtn` href
- [ ] Test score rings on iPhone SE (320px) — may overflow
- [ ] Confirm footer renders correctly (dark-mode var aliases)
- [ ] Verify toast no longer shows as permanent black oval (fix was applied this session)

### Content / Legal
- [ ] Terms and Privacy updated for NJ (done this session)
- [ ] Push terms.html + privacy.html to GitHub (pending push)
- [ ] Confirm Terms and Privacy are accessible at app.1ststep.ai/terms and /privacy

### Mobile
- [ ] Test all 5 nav tabs on iPhone 12 (375px)
- [ ] Confirm nav tab horizontal scroll works without clipping
- [ ] Verify modal overlays don't scroll behind on iOS Safari
- [ ] Test resume upload via mobile camera/files app

---

## Env Vars to Verify in Vercel

Go to Vercel → Project → Settings → Environment Variables and confirm all of these are set:

| Variable | Required By | Status |
|----------|------------|--------|
| `ANTHROPIC_API_KEY` | `api/claude.js` | Must be set |
| `STRIPE_SECRET_KEY` | `api/subscription.js`, `api/stripe-webhook.js` | Must be set |
| `STRIPE_WEBHOOK_SECRET` | `api/stripe-webhook.js` | Must be set |
| `RAPIDAPI_KEY` | `api/jobs.js` | Must be set |
| `GHL_API_KEY` | `api/stripe-webhook.js` | Must be set |
| `GHL_LOCATION_ID` | `api/stripe-webhook.js` | Must be set |
| `GHL_PIPELINE_ID` | `api/stripe-webhook.js` | Optional but recommended |

---

*This audit was conducted via static code analysis. Live HTTP testing was not possible due to sandbox network restrictions. All findings are based on reading the actual source code. Severity ratings assume a live production service with real paying users.*

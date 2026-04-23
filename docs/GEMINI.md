# GEMINI.md — 1stStep.ai (app.1ststep.ai)

This file gives Gemini instant context on the project so any session can pick up without re-explaining the codebase.

---

## What This Is

**1stStep.ai** is an AI-powered job search platform. Users paste their resume + a job description and get a tailored resume, keyword analysis, and cover letter. The app also finds real job listings near them, tracks applications, and preps them for interviews.

- **Live URL:** https://app.1ststep.ai
- **GitHub:** https://github.com/1ststepai/1ststep-resume
- **Deployed on:** Vercel (Hobby plan — **hard limit of 12 serverless functions**)
- **Owner:** Evan (evan@1ststep.ai)

---

## Tech Stack

| Layer | What |
|---|---|
| Frontend | Single-page app — `index.html` (~8,000+ lines) + `resume-builder.js` (wizard) |
| AI | Anthropic Claude API — Sonnet for paid features, Haiku for utility/free |
| Backend | Vercel serverless functions in `/api/` (Node 20, ESM) |
| Payments | Stripe subscriptions |
| CRM | GoHighLevel (GHL) — contacts, tags, pipeline stages |
| Email | Resend transactional email |
| Auth | No database — localStorage only. LinkedIn OpenID Connect for profile import |
| PDF parsing | PDF.js (CDN) — client-side |

---

## File Map

```
index.html            — Main SPA. All UI, state, and client logic lives here.
resume-builder.js     — Resume builder wizard modal (5 steps: profile, experience, education, skills, summary)
admin.html            — Internal admin dashboard

api/
  claude.js           — Main AI proxy. Handles resume tailoring, cover letters, interview prep, LinkedIn optimization, LinkedIn PDF import. maxDuration: 60s
  jobs.js             — Job search (Adzuna API + Indeed scraper). maxDuration: 30s
  subscription.js     — Stripe subscription lookup + LinkedIn OAuth (init + callback). maxDuration: 15s
  health.js           — Admin/cron endpoint. Also handles email blasts (?action=blast) and GHL backfill (?action=backfill). Runs daily at 12:00 UTC.
  notify-signup.js    — Called on new user signup — upserts GHL contact, sends welcome email via Resend
  track-event.js      — Fires GHL tags on product milestones (first_tailor, first_search, application_saved, tracker_viewed, etc.)
  ghl-stage.js        — Moves GHL contact through pipeline stages (active_user, power_user)
  stripe-webhook.js   — Handles Stripe subscription events (checkout, cancel, etc.)
  tally-webhook.js    — Handles Tally form submissions (beta signups)
  beta.js             — Beta access management
  beta-expiry-check.js — Daily cron (10:00 UTC) — expires beta users
  app-config.js       — Returns public config (feature flags, tier limits) to frontend
  _alert.js           — Shared Resend alert helper (NOT a Vercel route — underscore prefix exempts it from the function count)
```

---

## Critical Constraints

### Vercel 12-function limit (Hobby plan)
The repo currently has 13 files in `/api/` but `_alert.js` starts with `_` so Vercel doesn't count it as a function. **We are at exactly the limit.** Do not add new files to `/api/` without deleting one first, or upgrading to Vercel Pro. Consolidate new features into existing endpoints using `?action=` query params (see `health.js` for the pattern).

### No database
All user data lives in `localStorage`. Keys used:
- `1ststep_profile` — user profile (name, email, title, etc.)
- `1ststep_resume` — resume builder data (JSON)
- `1ststep_tailor_history` — array of tailored resume entries
- `1ststep_applications` — application tracker entries
- `1ststep_jobs_cache` — job search cache

### Tier system
Tiers: `free`, `essential`, `complete`. Verified via Stripe → `/api/subscription?email=...` returns `{ tier, status, tierToken }`. The `tierToken` is a short-lived HMAC (20 min TTL) that `claude.js` verifies without re-hitting Stripe on every AI call.

---

## Subscription Tiers

| Feature | Free | Essential | Complete |
|---|---|---|---|
| Resume tailors | 2 | Unlimited | Unlimited |
| Cover letter | No | No | Yes |
| Interview prep | No | Yes | Yes |
| Job search | Yes | Yes | Yes |
| Application tracker | Yes | Yes | Yes |

---

## GHL (GoHighLevel) Integration

- **API base:** `https://services.leadconnectorhq.com`
- **Auth header:** `Authorization: Bearer ${GHL_API_KEY}` + `Version: 2021-07-28`
- **Upsert contacts:** `POST /contacts/upsert` — **must be POST, not PUT** (PUT causes a 400 "Contact with id upsert not found" error — this burned us before)
- **Tag filtering:** The GHL tag query param on the contacts list endpoint is broken (returns 422). Fetch all contacts, filter client-side by checking `contact.tags.includes(tag)`.
- **Tags** drive automation sequences. Key tags in use:
  - `beta_user` — beta access users
  - `first_tailor`, `first_search`, `first_cover_letter` — product milestones
  - `used_tracker`, `application_saved`, `application_status_changed` — CRM engagement
  - `active_user`, `power_user` — pipeline stages
- **Env vars:** `GHL_API_KEY`, `GHL_LOCATION_ID`

---

## LinkedIn OAuth

- **Flow:** Popup window → `/api/subscription?action=linkedin-init` → LinkedIn consent → `/api/subscription?action=linkedin-callback` → `window.postMessage` back to parent → popup closes
- **Scopes:** `openid profile email`
- **Registered redirect URI:** `https://app.1ststep.ai/api/subscription?action=linkedin-callback`
- **Returns:** `{ firstName, lastName, name, email, picture, linkedinUrl }`
- **Env vars:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- **Note:** Full profile data (work history, education) is not available via the LinkedIn API. Use LinkedIn PDF export + PDF.js for full resume import.

---

## LinkedIn PDF Import Flow

1. User connects LinkedIn (OAuth) in resume builder Step 1
2. Banner appears offering to import from LinkedIn PDF
3. User downloads their LinkedIn PDF from `linkedin.com/mypreferences/d/download-my-data`
4. Uploads in the LinkedIn PDF modal (`#linkedInPdfModal` in index.html)
5. PDF.js extracts text client-side
6. Calls Claude Haiku via `/api/claude` (`callType: 'utility'`) to format as a clean resume
7. Loads result into the main `resumeText` textarea

---

## Email (Resend)

- **Env var:** `RESEND_API_KEY`
- **From address:** `1stStep.ai <noreply@1ststep.ai>`
- Transactional emails: welcome (notify-signup), beta expiry warning, product update blasts (health.js)
- Blast flow: `GET /api/health?action=blast&tag=beta&dryRun=true` (always dry run first), then `dryRun=false`
- Single test send: add `&testTo=evan@1ststep.ai` to the blast URL

---

## Env Vars Reference

```
ANTHROPIC_API_KEY       — Claude API key (Messages permission only)
STRIPE_SECRET_KEY       — sk_live_... Stripe secret
TIER_SECRET             — 32+ char random string for HMAC tier tokens
GHL_API_KEY             — GoHighLevel Private Integration Token (pit-...)
GHL_LOCATION_ID         — GHL Location ID
RESEND_API_KEY          — Resend API key
LINKEDIN_CLIENT_ID      — LinkedIn OAuth app client ID
LINKEDIN_CLIENT_SECRET  — LinkedIn OAuth app client secret
ADMIN_SECRET            — Password for /api/health admin actions
```

All env vars are set in Vercel → Project → Settings → Environment Variables. Never commit a `.env` file. See `.env.example` for documentation.

---

## Key Patterns

### AI calls (client → claude.js)
```javascript
fetch('/api/claude', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    callType: 'tailor' | 'cover_letter' | 'interview' | 'linkedin' | 'utility',
    resume: '...',
    jobDescription: '...',
    email: '...',
    tierToken: '...',  // from subscription check
  })
})
```

### GHL event tracking (client → track-event.js)
```javascript
fetch('/api/track-event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, event: 'application_saved' })
})
```

### Adding a new tracked event
1. Add to `EVENT_TAGS` map in `api/track-event.js`
2. Call `_pingTracker('your_event_name')` from `index.html`

### Adding a new admin action
Add a new `?action=your_action` block inside the handler in `api/health.js`. Protect with `ADMIN_SECRET` check.

---

## Deployment

- Push to `main` branch on GitHub → Vercel auto-deploys
- No build step — static files served directly, `/api/*.js` become serverless functions
- Crons run automatically via `vercel.json`:
  - `/api/health` — daily at 12:00 UTC
  - `/api/beta-expiry-check` — daily at 10:00 UTC

---

## Roadmap (as of April 2026)

### Shipped
- Resume tailoring (ATS + styled DOCX download)
- Cover letter generation
- Job search (Adzuna + Indeed)
- Application tracker (log, status dropdown, follow-up dates, resume source chip)
- Interview Cheat Sheet v2 (Likely Questions, Ask Them, Watch Out For)
- LinkedIn OAuth sign-in (auto-fills name + email in resume builder)
- LinkedIn PDF resume import (PDF.js + Claude Haiku cleanup)
- GHL CRM integration (contacts, tags, pipeline stages)
- Beta user email blast infrastructure
- Application tracker GHL event tracking

### Next candidates
- **Notification engine** — follow-up nudges ("You applied to X 7 days ago — follow up?"), resume decay alerts
- **Market Relevancy Score** — score how well the user's base resume matches current job market demand
- **Kanban pipeline** — full drag-and-drop board view for the application tracker (build only if `used_tracker` GHL tag data shows real engagement)

---

## Common Gotchas

- **GHL upsert must be POST not PUT** — using PUT causes `"Contact with id upsert not found"` 400 error across every file that calls it
- **GHL tag query param is broken** — `?tags=beta_user` on the contacts list endpoint returns 422. Fetch all contacts, filter client-side.
- **Vercel function count** — `_alert.js` is exempt because of `_` prefix. Every other `/api/*.js` file counts toward the 12-function limit.
- **PDF.js** loaded from CDN: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`
- **tierToken expires in 20 min** — frontend re-fetches from `/api/subscription` if expired before sending to claude.js
- **localStorage only** — no user accounts, no SQL DB. Multi-device sync is not supported by design.
- **index.html is large** (~8,000+ lines) — when editing, always grep for the exact string first before making changes to avoid duplicate edits

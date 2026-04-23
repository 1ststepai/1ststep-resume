# 1stStep.ai — Task Tracker

**Last updated:** 2026-04-12

---

## ✅ Completed

- [x] Resume Tailor app built (index.html — full featured, multi-mode)
- [x] Landing page built (formsubmit.co intake + pricing)
- [x] Fulfillment workflow documented
- [x] Backend proxy built (`resume-app/api/claude.js` — Vercel serverless function)
- [x] Frontend updated — `callClaude()` now calls `/api/claude`, not Anthropic directly
- [x] API key guards removed from frontend — customers get a clean UX
- [x] Error messages updated to be customer-friendly
- [x] `vercel.json` created with 60-second function timeout
- [x] `.env.example` created with setup instructions
- [x] `HOW_TO_DEPLOY.md` written with step-by-step Vercel deploy guide

---

## 🔲 Pending (Evan's action required)

### LAUNCH BLOCKERS

**[HIGH] Deploy to Vercel**
- Go to vercel.com → Add New Project
- Drag `resume-app/` folder
- Add environment variable: `ANTHROPIC_API_KEY` = your Anthropic key
- Click Deploy
- Reference: `resume-app/HOW_TO_DEPLOY.md`

**[HIGH] Activate Crisp live chat**
- Sign up free at https://crisp.chat
- Create a Website → copy your Website ID (looks like: `abc12345-1234-...`)
- In `resume-app/index.html` near the bottom (line ~3810), replace:
  `"YOUR_CRISP_WEBSITE_ID"` with your real ID
- Re-deploy to Vercel

**[HIGH] End-to-end test**
- After deploy: paste a real resume + job description into the live URL
- Confirm it works without any API key prompt
- Confirm the result looks good

---

### PRE-LAUNCH (not blocking but needed before marketing)

**[MED] Set up Stripe payment links**
- Go to dashboard.stripe.com → Products → Create two products:
  1. "Essential Resume Tailoring" — $49
  2. "Complete Resume Package" — $99
- Create Payment Links for each
- Update the pricing buttons in `resume-tailor-landing/index.html` with your link URLs

**[MED] Activate formsubmit.co**
- Deploy landing page to Vercel (or Netlify)
- Fill out and submit the contact form on the live URL
- Check evan@1ststep.ai for a confirmation email from formsubmit.co
- Click the confirmation link — done, all future submissions go directly to your email

**[MED] Deploy landing page**
- Go to vercel.com → Add New Project
- Drag `resume-tailor-landing/` folder
- Deploy → get URL
- (Optional) Connect `resume.1ststep.ai` subdomain

---

### FIRST CUSTOMER ACQUISITION

**[MED] Reddit launch posts**
- r/resumes, r/jobs, r/GetEmployed, r/cscareerquestions
- Offer first 5 people $25 intro price for testimonials
- Template in `resume-tailor-landing/DEPLOY_INSTRUCTIONS.md`

**[MED] LinkedIn announcement**
- Personal story about why you built it
- Call-to-action: "First 10 orders at intro pricing"

**[LOW] Facebook job-seeker groups**
- Search: "job search support", "laid off [city]", "career change 2026"

---

## 🚧 Improve (future backlog)

- Rate limiting on `/api/claude` to prevent API cost abuse
- Usage logging — know which features customers use most
- `/api/health` endpoint for monitoring
- Automated email delivery (n8n or Make) — removes manual step
- Error reporting (Sentry)
- Simple admin dashboard: orders, revenue, API spend
- Stripe webhook → trigger automated fulfillment

---

## Metrics to track

| Metric | Target (30 days) | Actual |
|--------|-----------------|--------|
| Paid orders | 10 | 0 |
| Revenue | $490–$990 | $0 |
| Landing page conversion | >5% | — |
| Avg turnaround time | <24 hrs | — |
| Revision rate | <20% | — |

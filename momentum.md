# 1stStep.ai — Momentum Queues

**Last updated:** 2026-04-12

---

## NOW (active)

Deploy the backend proxy to Vercel so the app works for non-technical customers.

**What's built:**
- `resume-app/api/claude.js` — Vercel serverless function proxying Claude API
- `resume-app/vercel.json` — 60-second timeout configured
- `resume-app/index.html` — Updated to call `/api/claude` (not Anthropic directly)
- API key guards removed — customers land on a working app immediately

**Evan's next action:** Drag `resume-app/` folder to Vercel, add ANTHROPIC_API_KEY.

---

## NEXT (ready to start after NOW)

1. **Test the deployed app** — full end-to-end run with a real resume + JD
2. **Crisp live chat** — get Website ID from crisp.chat dashboard, update index.html in landing page
3. **Stripe payment links** — Essential $49, Complete $99
4. **formsubmit.co activation** — submit test form from live landing page URL
5. **Deploy landing page** — second Vercel project for `resume-tailor-landing/`
6. **First Reddit post** — r/resumes or r/jobs with intro offer

---

## BLOCKED

- Vercel deployment: waiting on Evan to deploy (requires his Vercel account + Anthropic key)
- Crisp: waiting on Evan to get Crisp Website ID from crisp.chat

---

## IMPROVE (self-improvement work for the system)

- Add rate limiting to `/api/claude` to prevent API cost abuse (low priority pre-launch)
- Add basic usage logging to know which features customers use most
- Consider a `/api/health` endpoint that returns `{ok: true}` for monitoring
- Explore automated email delivery via n8n/Make to remove manual fulfillment step
- Add error reporting (Sentry or similar) so errors surface before customers complain
- Build a simple admin dashboard: orders received, revenue, API spend

---

## RECURRING (ongoing loops)

- Weekly: Check Anthropic console for API usage and cost
- Weekly: Review formsubmit.co email for new orders; respond within 1 hour
- Weekly: Deliver completed orders within 24 hours (Essential) / 12 hours (Complete)
- Monthly: Review Vercel usage — free tier allows 100GB bandwidth, 100 function invocations/day (hobby plan)
- Monthly: Update pricing or offers based on conversion data
- Monthly: Post fresh content on Reddit/LinkedIn for organic acquisition

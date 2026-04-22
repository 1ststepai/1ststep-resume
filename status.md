# 1stStep.ai — Live Status

**Last updated:** 2026-04-12

---

## Current Phase: Launch Prep

| Item | Status | Notes |
|------|--------|-------|
| Backend proxy (api/claude.js) | ✅ Built | Needs Vercel deploy + env var |
| Frontend updated | ✅ Done | callClaude() now hits /api/claude |
| vercel.json | ✅ Created | 60s function timeout configured |
| Vercel deployment | ⏳ Pending | Evan needs to drag folder to Vercel |
| ANTHROPIC_API_KEY set in Vercel | ⏳ Pending | Add in Vercel env vars |
| End-to-end test | ⏳ Pending | After deploy |
| Crisp live chat | ⏳ Pending | Replace placeholder ID in landing page |
| Stripe payment links | ⏳ Pending | Create Essential ($49) + Complete ($99) |
| formsubmit.co activation | ⏳ Pending | Submit test form, confirm email |
| First customer | ⏳ Pending | |

---

## Blockers

None currently blocking Evan — next action is Vercel deployment (2 minutes).

---

## Next Actions (in order)

1. **Deploy to Vercel** — drag `resume-app/` folder to vercel.com, set ANTHROPIC_API_KEY env var
2. **Test the app** — paste a resume + JD, confirm it works without API key prompt
3. **Set up Crisp** — get Website ID from crisp.chat, update landing page
4. **Set up Stripe** — create payment links for $49 and $99 packages
5. **Activate formsubmit.co** — submit the landing page form once to trigger confirmation
6. **Deploy landing page** — drag `resume-tailor-landing/` to Vercel
7. **Post to Reddit / LinkedIn** — first customer outreach

# 1stStep.ai — Project Charter

**Owner:** Evan Pancis (evan@1ststep.ai)  
**Last updated:** 2026-04-12  
**Status:** Pre-launch → active buildout

---

## Mission

Build and operate 1stStep.ai: a done-for-you AI resume tailoring service that helps job seekers get more callbacks by matching their resume to each specific job description.

## Products

| Product | Description | Status |
|---------|-------------|--------|
| Resume Tailor App | Web app powered by Claude AI | Built — needs backend proxy |
| Landing Page | Marketing page + order intake form | Built — ready to deploy |
| Fulfillment Workflow | Manual SOP for processing orders | Documented |

## Revenue Model

- Essential Tailoring: $49 (resume only, 24-hr turnaround)
- Complete Package: $99 (resume + cover letter, 12-hr turnaround)
- Rush Add-on: +$29 (4-hr turnaround)
- Cost of goods: ~$0.06–0.18 per order (API credits)
- Target: 10 orders/week → $490–$990/week at ~6 hours work

## Current Blockers (as of 2026-04-12)

1. **Backend proxy** — App currently requires users to enter their own Claude API key. Must proxy API calls server-side before selling to non-technical customers.
2. **Crisp live chat** — Widget embedded but placeholder Website ID not yet replaced.

## Tech Stack

- Frontend: Single-file HTML/JS (vanilla) — no build step
- AI: Anthropic Claude API (Haiku for fast steps, Sonnet for quality rewrites)
- Hosting: Vercel (static + serverless functions)
- Forms: formsubmit.co (no backend needed)
- Payments: Stripe (payment links — to be set up)
- Job Search API: JSearch/RapidAPI (optional, user-facing feature)

## Success Metrics (30-day targets)

- 10 paid orders
- $490–$990 revenue
- <24hr turnaround maintained
- ≤1 revision request per 5 orders
- Landing page conversion rate tracked

## Key Files

| File | Purpose |
|------|---------|
| `resume-app/index.html` | Main app |
| `resume-tailor-landing/index.html` | Landing page |
| `resume-app/api/claude.js` | Backend proxy (Vercel function) |
| `resume-tailor-landing/FULFILLMENT_WORKFLOW.md` | Order processing SOP |
| `plan.md` | Current sprint plan |
| `tasks.md` | Active task list |
| `status.md` | Live status |

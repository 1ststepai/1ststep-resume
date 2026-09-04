# AGENTS.md - 1stStep Resume

## Project purpose
1stStep Resume is a complex static/Vercel app for job seekers. It helps users tailor resumes, create cover letters, manage job-search workflow, restore paid access, and connect with a Chrome extension that captures job data from job boards.

## Production URLs
- Main app: `https://app.1ststep.ai`
- Public resume landing page may also route users into this app. Confirm current Vercel aliases before changing production links.

## Tech stack
- Static frontend: `index.html`, `app.js`, `style.css`.
- Vercel serverless API routes in `api/`.
- Stripe for Job Hunt Pass subscription/payment flows.
- Anthropic/Claude generation via `api/claude.js`.
- Resend for passwordless restore/signup notification email where configured.
- GoHighLevel signup capture via `api/notify-signup.js` when present.
- Chrome extension under `1ststep-extension/` when present.

## Important files/directories
- `index.html` - app shell and required DOM IDs.
- `app.js` - main client workflow, access tiers, profile/localStorage, generation calls.
- `style.css` - app layout and responsive behavior.
- `api/subscription.js` - Stripe, tier token, owner access, restore flow.
- `api/claude.js` - Claude generation endpoint and tier enforcement.
- `api/notify-signup.js` - signup capture, GHL tags, admin email, referral handling.
- `scripts/smoke-test.cjs` - broad static app regression smoke test.
- `1ststep-extension/` - Chrome extension job-capture and auth bridge contract.
- `docs/AI_MEMORY.md` - shared Claude/Codex operating memory and duplicate-prevention contract.
- `docs/JOB_AGENT_RUNTIME.md` - detailed durable Job Agent architecture and safety gates.
- `.env.example` - env var names only.

## Do not touch without explicit approval
- Paid/free/owner access logic.
- Stripe checkout, webhook, tier token, or passwordless restore flows.
- Chrome extension message/job-capture contract.
- Existing localStorage keys used by the app or extension.
- Referral capture behavior and GHL tags.
- Public pricing or payout terms.
- CSP/auth/security headers.

## Safe-change rules
- Avoid large rewrites. This app is intentionally static and highly interconnected.
- Preserve required DOM IDs; `scripts/smoke-test.cjs` checks many of them.
- Preserve paid/free/owner access logic and Stripe restore flow.
- Preserve the Chrome extension job-capture contract and supported job-board host permissions.
- Never expose secrets in frontend code, localStorage, generated HTML, logs, or docs.
- Keep API changes backward compatible with existing client calls.
- Never create a second job or application record until the tenant-scoped canonical identity and idempotency checks in `docs/AI_MEMORY.md` have completed. An ambiguous submission outcome is not permission to retry.

## Required commands before completion
```bash
npm run smoke
```

If API/payment/generation code changes, also run a focused manual browser smoke test on the affected workflow.

## Environment variable rules
- Do not rename existing env vars.
- Real values live only in Vercel or local `.env`; never commit them.
- Server-only secrets include `ANTHROPIC_API_KEY`, Stripe secrets, `TIER_SECRET`, owner secrets, Resend, LinkedIn secret, and GHL API key.
- Public tracker config may be returned by app config only if intended.

## Safety/security rules
- Treat resumes, job descriptions, emails, and generated outputs as private user data.
- Do not log full resumes, secrets, tokens, or payment data.
- Do not bypass tier enforcement in client or API code.
- Do not add scraping, auto-apply, or automated messaging behavior.

## Handoff format
```text
Summary:
- What changed and why.

Files changed:
- path: short note

Validation:
- npm run smoke: pass/fail/not run
- Manual app/API check: pass/fail/not run

Risks / follow-ups:
- Note access, Stripe, extension, env, or production-routing concerns.
```

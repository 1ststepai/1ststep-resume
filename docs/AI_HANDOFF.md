# AI Handoff

## Future task start
Before making changes, read `AGENTS.md` first, then `docs/AI_HANDOFF.md`, then only the files directly relevant to the task. Do not scan the whole repo unless those docs are missing or the task genuinely requires broader investigation.

## Current project summary
1stStep Resume is a static/Vercel job-search app. The browser app handles resume/job workflow and calls serverless API routes for Claude generation, subscription restore, Stripe access, GHL signup capture, and related server-only work.

## Architecture overview
- Static shell: `index.html`, `app.js`, `style.css`.
- Serverless routes: `api/subscription.js`, `api/claude.js`, `api/notify-signup.js` when present.
- Smoke tests are in `scripts/smoke-test.cjs` and protect DOM IDs, access flows, layout, analytics, and extension contracts.
- Chrome extension files live in `1ststep-extension/` and communicate with the app through stable auth/job-capture contracts.

## Common tasks
- UI copy/layout: inspect `index.html`, `style.css`, and the matching renderer/event code in `app.js`.
- Access/payment bug: inspect `api/subscription.js`, tier token handling, and restore UI in `app.js`.
- Generation bug: inspect `api/claude.js` and the request assembly in `app.js`.
- Signup/referral bug: inspect `api/notify-signup.js` and referral localStorage plumbing.
- Extension issue: inspect `1ststep-extension/manifest.json`, content scripts, and app bridge code.

## Common commands
```bash
npm run smoke
```

## QA checklist
- Smoke test passes.
- Free limits still apply.
- Paid users can restore access through the email-code flow.
- Owner restore path still requires configured server secrets.
- Chrome extension still captures supported job-board data.
- No secrets appear client-side.

## Deployment checklist
- Vercel env vars are set for Stripe, Claude, restore email, and optional GHL/analytics.
- Stripe live/test modes are not mixed.
- Webhook endpoint and success/cancel URLs match the production domain.
- Static files and API routes deploy from the existing repo structure.

## What not to change
- Paid/free/owner access logic.
- Stripe restore/payment contract.
- Chrome extension job-capture contract.
- Env var names, localStorage keys, referral/GHL tagging, or public pricing without approval.

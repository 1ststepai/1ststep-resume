# 2026-09-18 — Landing conversion + demand capture

## Changed
- Public landing now converts: Job Agent workload headline, Try Job Agent → `/concierge`, Get Early Access → `#waitlist`, product loop visuals, first-party waitlist, privacy-conscious funnel events.
- Waitlist is demand capture only. It never grants beta or writes the invited-tenant list.

## Files Touched
- `index.html`, `home-funnel.js`, hashed `home-motion-*`, `concierge.js`
- `api/public-waitlist.js`, `api/public-funnel-event.js`, `lib/public-waitlist-store.js`
- `resume-tailor-landing/ghl-cro-custom-code.html` (CTA compatibility only)
- tests, `vercel.json`, `build-public-web.mjs`, `docs/UX_LANDING_CONVERSION_2026-09-17.md`

## Verification
- `npm run test:homepage` PASS
- Sherlock PASS
- Playwright landing + beta-request PASS (desktop/mobile)
- `npm run smoke` PASS

## Risks / Follow-Up
- Landing conversion is part of the action-first UX successor. NOT MERGED onto the controlled-beta baseline.
- Funnel analytics PARTIAL until login/onboarding events can be wired without touching PR #86.
- R3 security remediation remains authoritative; Release Validation integrates UX after R3 independently passes.

## Suggested Next Prompt

Paste this next:

```txt
Read AGENTS.md, docs/agents/HANDOFF.md, docs/agents/CURRENT-STATE.md, docs/UX_ACTION_FIRST_2026-09-18.md, and docs/UX_LANDING_CONVERSION_2026-09-17.md. Inspect the action-first UX successor SHA. It includes polish 8d3ac08. Do not merge onto the controlled-beta baseline. R3 remains authoritative. Do not deploy. Do not set JOB_AGENT_COUNSEL_APPROVED.
```

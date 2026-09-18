# Landing page conversion — launch UX report

Date: 2026-09-18
Branch: `cursor/job-agent-ui-ux-polish-20260917`
Worktree: `C:/Users/evanp/Documents/Claude/Projects/1ststep.ai/.worktrees/job-agent-ui-ux-polish-20260917`
Parent SHA: `a0d8c1498304161a38becd027173a02bcf1a6765` (handoff snapshot)
Landing conversion is included in the action-first UX successor on `cursor/job-agent-ui-ux-polish-20260917`. NOT MERGED. NOT DEPLOYED. NOT HOSTED VERIFIED. Do not merge onto the controlled-beta baseline; R3 remains authoritative.

Product/runtime semantics were not redesigned. Waitlist capture cannot write `JOB_AGENT_PILOT_ALLOWED_TENANTS`.

## Scorecard

| Gate | Result |
|---|---|
| LANDING PAGE CONVERSION | PASS |
| VALUE PROP CLEAR | PASS |
| PRIMARY CTA | PASS — email lead first, then `/concierge` |
| REAL PRODUCT SHOWN | YES |
| LEAD CAPTURE | PASS — required before signup |
| DUPLICATE LEAD PREVENTION | PASS |
| BETA ACCESS SEPARATE FROM LEADS | PASS |
| MOBILE LANDING | PASS |
| FUNNEL ANALYTICS | PARTIAL |
| RESUME.1STSTEP.AI FUNNEL COMPATIBILITY | PARTIAL |

### P0 CONVERSION BLOCKERS

None remaining in this working tree.

Fixed before this report:

- Generic first-viewport claim replaced with a concrete Job Agent workload headline.
- Mailto-only waitlist dead-end replaced with first-party `/api/public-waitlist` plus a visible `sales@1ststep.ai` fallback.
- Product tour/journey now uses My Jobs, Needs You, Saved Info, Prepared for Review. Copy does not claim employer submission.
- Duplicate normalized-email upserts return a success state and do not create a second record.
- Waitlist responses always include `grantsBetaAccess: false`. Pilot-allowlist fields are rejected.
- Unsigned visitors cannot start signup until an email lead is saved in the hero. Sign in stays available for existing accounts.

### P1 CONVERSION IMPROVEMENTS

- Funnel events `signup_completed`, `onboarding_started`, and `onboarding_completed` are allowlisted in `/api/public-funnel-event` but are not wired in frozen login/PR #86 (`bbb6ee3`). Landing fires `landing_viewed`, `primary_cta`, `product_demo_interaction`, `waitlist_submitted`, and `signup_started` after a lead is saved.
- `resume.1ststep.ai` CRO landing now has Try Job Agent → `https://app.1ststep.ai/#lead` and Get Early Access → `https://app.1ststep.ai/#waitlist`. The standalone resume page still uses Start Free → app signup. No full redesign in this mission.
- Hero still includes one verified LogicSource interview example, labeled as not a promised outcome. Do not turn that into a performance claim.
- Production waitlist needs `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and a ≥32-character `RATE_LIMIT_HASH_SECRET` or `TIER_SECRET`. Missing store returns 503 plus mailto, not a dead end.

### P2 (backlog, cosmetic)

- Full vault redesign, Learning Center, `/app/resume` residual admin jargon.
- GHL default landing rewrite beyond the CRO CTA compatibility patch.

## UX SUCCESSOR SHA

Not assigned. Landing conversion remains uncommitted on `a0d8c14`. Do not treat this working tree as a successor SHA.

## SAFE FOR RELEASE-LANE REVIEW

YES for release-lane review of presentation/UX candidate `8d3ac08` and this landing-conversion working tree as a separate later commit.

NO for Preview/Production deploy, tenant enablement, or `JOB_AGENT_COUNSEL_APPROVED`.

Landing work must not delay controlled-beta review of `8d3ac08`.

## Evidence

- `npm run test:homepage` PASS (includes `public-waitlist-test` and homepage motion/CSP pins).
- `node scripts/sherlock-security-review.mjs` PASS (47 reviewed routes, including `public-waitlist.js` and `public-funnel-event.js`).
- `npx playwright test scripts/landing-conversion-browser.spec.mjs scripts/beta-request-browser.spec.mjs --workers=1` PASS (desktop 1440 and mobile 390; invalid email; new lead; duplicate; 503 fallback; signed-in Sign in + Try Job Agent).
- `npm run smoke` PASS.
- Cursor browser: signed-out landing H1/CTAs, `#waitlist` invalid-email status, primary CTA `/concierge` onboarding, mobile 390px `scrollWidth === 390`.

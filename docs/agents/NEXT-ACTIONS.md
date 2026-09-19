# NEXT-ACTIONS — Job Agent product family

Executor-neutral. Do not "continue the chat". Every item names its gate. Nothing below authorizes Production.

Integrated RC: branch `claude/job-agent-integrated-rc-20260918` (base R3 `cfa483c77d22b2b6150255744865aee5583235f3`, UX lineage includes `8d3ac083e4906c7d2940e7e4501191b8f4c923d3` → `cdab3c9` → `e1f6362`).

### P0-1 — Independent security re-review of the RC deltas over R3

| Field | Value |
|---|---|
| JOB ID | `JA-RC-SECURITY-DELTA` |
| OBJECTIVE | Confirm the RC does not weaken the R3 ceiling. Review `git diff cfa483c claude/job-agent-integrated-rc-20260918`. |
| FOCUS | `concierge.js` package gate (`if (automatic) return null` restored, no `skipSourceDialog`), `ensureSelectedBaseResume` (only after explicit résumé save, never replaces a selection), `api/public-waitlist.js`, `api/public-funnel-event.js`, `lib/public-waitlist-store.js`, `client/referral-attribution.js`, `login.js` copy. |
| FORBIDDEN | Deploy, tenant enablement, `JOB_AGENT_COUNSEL_APPROVED`, PR #86. |
| ACCEPTANCE | Written PASS/FAIL with SHA. |
| NEXT ROUTE | P0-2. |

### P0-2 — Director accept/reject of the RC and of auto-prepare

| Field | Value |
|---|---|
| JOB ID | `JA-RC-DIRECTOR` |
| OBJECTIVE | Accept the RC, and decide separately whether the tester-requested auto-prepare (UX `cdab3c9`) should exist. The RC removed it because it self-attested the per-package human source review. Re-adding it requires an explicit owner policy change plus P0-1 re-run. |
| ALSO | Decide whether launch-access `afcd973` joins the RC (then re-run P0-1). |
| NEXT ROUTE | P0-3. |

### P0-3 — Release tests on the accepted RC SHA

Run and record: `npm run pretest:concierge && npm run test:concierge && npm run test:browser:vault` plus `npm run test:application-candidate`, `npm run test:homepage`, `npm run smoke`, `npm run test:extension-release`, `npm run test:extension-unpacked`, `node --experimental-test-module-mocks scripts/job-agent-owner-reviewed-browser-ceiling-test.mjs`, and the Playwright set listed in the reconciliation report. If port 4175 is busy on the machine, set `PORT=<free port>`; all specs now honor `CONCIERGE_TEST_URL`.
Known pre-existing failures (also fail on pure R3): `dialog-keyboard` guided-launch ×2 and `discovery-retry` — they open setup while signed out, which R3 correctly refuses. Fix the fixtures (backlog P2-1), do not loosen the gate.

### P0-4 — Owner gate: zero-user Preview

Deploy the accepted RC SHA to Preview with `JOB_AGENT_PILOT_ALLOWED_TENANTS` empty. Verify the hosted SHA equals the RC SHA. Browser-check `/`, `/concierge`, `/partner`, `/login.html` at 1440 and 390. Owner action.

### P1-1 — Owner gate: one invited user E2E, then controlled beta up to 5

Per `docs/JOB_AGENT_BETA_RUNBOOK.md`. Submission and employer transmission remain disabled. Beta currently 0/5.

### P1-2 — Redeploy `partners.1ststep.ai` from the RC

Live partners site is `7ec3acc` and still shows the old anonymous "Create my partner link" generator. The RC's `partners-landing/` routes partners into the approval-only `/partner` application. Owner deploy (CLI, project `1ststep-growth-finder`).

### P1-3 — Redeploy `resume.1ststep.ai` from the RC

Adds the single "Start Job Agent — free" path to `/concierge` and carries `ref`/UTM into the app. Owner deploy (CLI, project `1ststep-resume-landing`). No email capture exists on this subdomain; the waitlist lives on `app.1ststep.ai/#waitlist` (see D-2026-09-18-resume-email-capture).

### P1-4 — Make Production deploy from `main`

Production app/resume were CLI-deployed from a feature branch. After the RC is accepted, merge it to `main` and deploy from `main` so `origin/main` equals Production again.

### P1-5 — Waitlist Production configuration

`/api/public-waitlist` needs `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and a ≥32-char `RATE_LIMIT_HASH_SECRET` (prefer a dedicated secret over the `TIER_SECRET` fallback). Missing config returns 503 + mailto (not a dead end).

## Backlog (P2)

- P2-1 Signed-in fixtures for `dialog-keyboard` guided launch and `discovery-retry`.
- P2-2 `trust-remediation` sector test and vault guided-launch test are order-dependent flakes under a full run (pass alone).
- P2-3 Waitlist records have no TTL/retention policy; add one with the privacy policy.
- P2-4 Server-side attribution has no 60-day window check (client enforces it); add `capturedAt` window to `recordPartnerAttribution` when commissions go live.
- P2-5 Bump extension version (1.6.0 → 1.6.1) before any store upload; popup changed.
- P2-6 `jobAgentStatus()` says "try a different type of job" for a partially completed run with 0 matches; make it partial-aware like `discoveryNextStep`.
- P2-7 `resume.1ststep.ai` SEO title/meta still say "Resume Builder" (kept deliberately for keyword risk; owner copy decision).
- P2-8 ~40 SSO-protected Preview deployments were created by the 2026-09-18 `preserve/*` pushes; delete when convenient.
- P2-9 Partners page "partner tools" links to LinkedIn `#OpenToWork` searches; review for tone/privacy.

## Explicit non-actions

Do not deploy Production. Do not set `JOB_AGENT_COUNSEL_APPROVED`. Do not write `JOB_AGENT_PILOT_ALLOWED_TENANTS` from the waitlist. Do not modify PR #86. Do not merge `preserve/*` branches — they are archives. Do not switch into another agent's dirty worktree.

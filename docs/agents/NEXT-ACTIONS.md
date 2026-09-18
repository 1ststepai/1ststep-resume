# NEXT-ACTIONS — Job Agent controlled-beta

Executor-neutral. Do not “continue the Cursor chat.” Do not mix consultancy/resume/partners application authority.

## P0-1 — JA-WORKTREE-HYGIENE

| Field | Value |
|---|---|
| JOB ID | `JA-WORKTREE-HYGIENE` |
| OBJECTIVE | Preserve intentional dirty Job Agent files in Git without merging UX into R3. |
| TARGET SHA | R3 remains `cfa483c77d22b2b6150255744865aee5583235f3`. |
| ALLOWED SCOPE | Isolated UX/access/docs commits and pushes. |
| FORBIDDEN SCOPE | Merge into R3. Preview. Production. Counsel flag. PR #86. Tenant enablement. |
| ACCEPTANCE CRITERIA | UX SHA and release handoff SHA exist on GitHub. Secrets not committed. Fresh Codex can fetch both. |
| TESTS | `git fetch` + new worktree + read HANDOFF. |
| EXPECTED RESULT | Codex-portable. |
| NEXT ROUTE | P0-2. Status: completed by the portability preserve once pushed. |

## P0-2 — JA-UX-INTEGRATE (Director only)

| Field | Value |
|---|---|
| JOB ID | `JA-UX-INTEGRATE` |
| OBJECTIVE | Director-authorized integrate of final UX candidate `cdab3c98af2cde461150adf5e59b5483758d2b35` onto a **new** worktree of R3 `cfa483c77d22b2b6150255744865aee5583235f3`. |
| TARGET SHA | Integrate onto R3 TESTED. Candidate includes polish `8d3ac08`, action-first `6aa7b50`, and one-action/auto-prepare overlay. |
| ALLOWED SCOPE | Presentation, copy, a11y, action-first journey, search-first/one-action/auto-prepare review loop. Confirm `git diff 7ed4e18 cdab3c9` and the overlay vs R3. |
| FORBIDDEN SCOPE | PR #86. `JOB_AGENT_COUNSEL_APPROVED`. `JOB_AGENT_PILOT_ALLOWED_TENANTS`. Preview. Production. Employer submission/transmission. Post-beta. Absorbing launch-access `afcd973` without Director review. |
| ACCEPTANCE CRITERIA | Director accept/reject recorded. If accepted: tests in P0-3 PASS on the integrate SHA. |
| TESTS | See P0-3. |
| EXPECTED RESULT | UX either integrated on clean R3 or explicitly rejected. Beta still 0/5 until owner gates. |
| NEXT ROUTE | P0-3 if integrated; else stop for Director. |

## P0-3 — JA-RELEASE-TESTS

| Field | Value |
|---|---|
| JOB ID | `JA-RELEASE-TESTS` |
| OBJECTIVE | Release-lane tests on the clean integrated SHA. |
| TARGET SHA | The integrate SHA from P0-2 (record it). |
| ALLOWED SCOPE | Test commands below. |
| FORBIDDEN SCOPE | Preview/Production/tenants. |
| ACCEPTANCE CRITERIA | `npm run pretest:concierge && npm run test:concierge && npm run test:browser:vault` plus Playwright `scripts/concierge-job-capture-browser.spec.mjs` and `scripts/ui-handoff-browser.spec.mjs`. |
| TESTS | Those commands. |
| EXPECTED RESULT | Evidence in repo/dispatcher. Still not Preview. |
| NEXT ROUTE | P0-4. |

## P0-4 — JA-EXTENSION-RC

| Field | Value |
|---|---|
| JOB ID | `JA-EXTENSION-RC` |
| OBJECTIVE | Chrome extension exact-RC verification for the Greenhouse-only controlled release. |
| TARGET SHA | Integrate SHA from P0-2. |
| FORBIDDEN SCOPE | New ATS hosts. Store publish. Production. |
| NEXT ROUTE | Owner gate P1. |

## P1 — gates (owner)

| JOB ID | OBJECTIVE | TARGET SHA | FORBIDDEN |
|---|---|---|---|
| `JA-ZERO-USER-PREVIEW` | Preview with zero tenants | HOSTED Preview SHA ≠ assumed HEAD | tenants, Production, counsel flag |
| `JA-ONE-USER-E2E` | One invited test user E2E | Preview SHA | 5-user enablement |
| `JA-FIVE-USER-BETA` | Controlled beta up to 5 | After E2E PASS | automatic employer submission |

## Explicit non-actions

- Do not merge post-beta into release.
- Do not treat waitlist as invited-tenant list.
- Do not modify PR #86.
- Do not deploy Preview or Production during portability.
- Do not set `JOB_AGENT_COUNSEL_APPROVED`.
- Do not use `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai` as a git root (it is not).

# NEXT-ACTIONS — Job Agent controlled-beta

Executor-neutral. Do not “continue the Cursor chat.” Do not mix consultancy/resume/partners application authority.

## P0-1 — JA-WORKTREE-HYGIENE

| Field | Value |
|---|---|
| JOB ID | `JA-WORKTREE-HYGIENE` |
| OBJECTIVE | Preserve uncommitted files on owner-reviewed (`b391a3f`) and UX (`a0d8c14`) worktrees so Codex/Cursor/Hermes do not clobber them. |
| TARGET SHA | Do not reset. Record dirty paths with `git status`. |
| ALLOWED SCOPE | Commit **only** if owner asks; otherwise stash/copy/leave in place. `docs/agents/*` handoff files may be committed separately. |
| FORBIDDEN SCOPE | `git checkout` of either dirty worktree by a second executor. Discard. Preview deploy. Tenant enablement. |
| ACCEPTANCE CRITERIA | Dirty paths listed; second executor uses a **new** worktree of a committed SHA. |
| TESTS | `git status` in both worktrees. |
| EXPECTED RESULT | SAFE TO SWITCH can become YES. |
| NEXT ROUTE | P0-2. |

## P0-2 — JA-UX-CANDIDATE

| Field | Value |
|---|---|
| JOB ID | `JA-UX-CANDIDATE` |
| OBJECTIVE | Director-authorized review/integrate of UI/UX candidate `8d3ac083e4906c7d2940e7e4501191b8f4c923d3` onto clean R3 lineage. Presentation/layout/copy/a11y only. |
| TARGET SHA | Candidate `8d3ac08`. Integrate onto R3 TESTED `cfa483c77d22b2b6150255744865aee5583235f3` (or committed successor of `b391a3f` **after** it is clean). |
| ALLOWED SCOPE | Presentation files. `git diff 7ed4e18 8d3ac08` must show no auth/consent/Vault/package/submission/policy changes. |
| FORBIDDEN SCOPE | PR #86. `JOB_AGENT_COUNSEL_APPROVED`. `JOB_AGENT_PILOT_ALLOWED_TENANTS`. Preview. Production. Action-first dirty tree. Post-beta. |
| ACCEPTANCE CRITERIA | Director accept/reject recorded. If accepted: tests in P0-3 PASS on the integrate SHA. |
| TESTS | See P0-3. |
| EXPECTED RESULT | UX either integrated on clean R3 or explicitly rejected. Beta still 0/5. |
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
| NEXT ROUTE | Zero-user Preview is an **owner/Director** gate — not this job. |

## P1 — gates (owner)

| JOB ID | OBJECTIVE | TARGET SHA | FORBIDDEN |
|---|---|---|---|
| `JA-ZERO-USER-PREVIEW` | Preview with zero tenants | HOSTED Preview SHA ≠ assumed HEAD | tenants, Production, counsel flag |
| `JA-ONE-USER-E2E` | One invited test user E2E | Preview SHA | 5-user enablement |
| `JA-FIVE-USER-BETA` | Controlled beta 5/5 | After E2E PASS | automatic employer submission |

## P2 — commit action-first/landing only if owner asks

Working tree after `a0d8c14`. Reports `docs/UX_ACTION_FIRST_2026-09-18.md`, `docs/UX_LANDING_CONVERSION_2026-09-17.md`. Waitlist must not grant beta.

## Explicit non-actions

- Do not merge post-beta into release.
- Do not treat waitlist as invited-tenant list.
- Do not modify PR #86.
- Do not use `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai` as a git root (it is not).

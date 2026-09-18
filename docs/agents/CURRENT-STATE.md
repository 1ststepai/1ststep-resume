# CURRENT-STATE — Job Agent controlled-beta (`app.1ststep.ai`)

Operational snapshot for Job Agent only. Not 1ststep.ai consultancy, not `resume.1ststep.ai` acquisition, not `partners.1ststep.ai`.
Chat is not authority. Recency of commits is not authority.

Captured: 2026-09-18 (portability preserve)

## Canonical remote

`https://github.com/1ststepai/1ststep-resume.git`

## Deployment / source layers

| Layer | SHA | Notes |
|---|---|---|
| PRODUCTION integrated SOURCE | `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29` on `origin/main` | Untouched. Do not assume host equals this until HOSTED VERIFIED. |
| Owner-reviewed policy baseline | `7ed4e183d445baf2d1129b90e38fcffe3cfec59a` | R2: H1/H2/M2 PASS, M1 FAIL (capability ceiling). |
| R3 TESTED | `cfa483c77d22b2b6150255744865aee5583235f3` | Independent audit **PASS**. Capability ceiling. **Authoritative security/release SHA.** |
| Release lane SOURCE | `codex/owner-reviewed-controlled-beta-20260917` contains R3 + presentation polish `b391a3f` + this handoff docs | Application authority for security remains R3. Do not treat later docs commits as a new R3. |
| Existing UX polish | `8d3ac083e4906c7d2940e7e4501191b8f4c923d3` | Ancestor of the final UX candidate. Presentation only vs `7ed4e18`. |
| Action-first + landing | `6aa7b50a8121929d26d7aa852d4a5b37b49609e5` | Inspect-only successor on the UX branch. |
| FINAL UX CANDIDATE | `cdab3c98af2cde461150adf5e59b5483758d2b35` on `cursor/job-agent-ui-ux-polish-20260917` | Action-first + landing + tester-accepted one-action/auto-prepare overlay. **Not merged into R3.** |
| Launch-access preservation | `afcd97351fd23f03b768e0ff5a7befc2aa42987a` on `cursor/owner-reviewed-launch-access-20260918` | Page-owner admin + invited-tester access. Isolated. Not R3. |
| Engineering PR #86 | `bbb6ee31bffdd6c84729639c29d1d94c5ddb320e` | **FROZEN.** |
| DEPLOYED Production `https://app.1ststep.ai` | **NOT VERIFIED** as R3/UX SHAs | Do not infer from local commits. |

## Worktrees

- Release: `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\.worktrees\owner-reviewed-controlled-beta-20260917` — may still hold local copies of already-preserved files. Do not switch a second executor onto it.
- UX: `...\job-agent-ui-ux-polish-20260917` — final UX candidate committed and pushed.
- Launch-access: `...\owner-reviewed-launch-access-20260918` — isolated preservation.
- Chrome extension / store policy, partners, post-beta: **ACTIVE ISOLATED**, not this release lane.

## Gates

| Gate | State |
|---|---|
| Independent R2 | FAIL M1 (historical) |
| R3 implementation + independent audit | PASS on `cfa483c` |
| UX integrate | held — **Director only**; do not auto-integrate |
| Zero-user Preview | pending / owner gate |
| One invited test user E2E | pending |
| Complete human E2E | pending |
| Controlled 5-user beta | **0/5** in this handoff (do not enable tenants in the portability job) |
| Counsel / Production signedBeta | blocked; `JOB_AGENT_COUNSEL_APPROVED` unset / false |

## Current blocker

Director-only integrate of `cdab3c9` onto a **new** worktree of `cfa483c`. Then tests, Chrome extension exact-RC, zero-user Preview, one-user E2E, controlled beta up to 5.

## Active job

`JA-UX-INTEGRATE` (Director). Portability preserve is complete once this handoff is PUSHED.

## Next executor

Fresh Codex: `git fetch` + new worktree of the release handoff branch. Identify R3 `cfa483c` and UX `cdab3c9`. Do not deploy. Do not set counsel. Do not modify PR #86.

## Chrome extension / landing

- Extension: Greenhouse-only controlled-release (decision D-2026-09-04). Store-policy worktrees remain isolated — exact-RC verification is a later job.
- Landing waitlist ≠ beta tenants (`grantsBetaAccess: false`).

## Branch classes

| Ref | Class |
|---|---|
| `origin/main` `d64e174` | AUTHORITATIVE production integration |
| `codex/owner-reviewed-controlled-beta-20260917` | ACTIVE ISOLATED release handoff |
| `cursor/job-agent-ui-ux-polish-20260917` | ACTIVE ISOLATED UX candidate |
| `cursor/owner-reviewed-launch-access-20260918` | ACTIVE ISOLATED access preservation |
| PR #86 `bbb6ee3` | FROZEN |
| Chrome-store / partners / post-beta | ACTIVE ISOLATED — not Job Agent beta authority |

# CURRENT-STATE — Job Agent controlled-beta (`app.1ststep.ai`)

Operational snapshot for Job Agent only. Not 1ststep.ai consultancy, not `resume.1ststep.ai` acquisition, not `partners.1ststep.ai`.
Chat is not authority. Recency of commits is not authority.

Captured: 2026-09-18

## Canonical remote

`https://github.com/1ststepai/1ststep-resume.git`

## Deployment / source layers

| Layer | SHA | Notes |
|---|---|---|
| PRODUCTION integrated SOURCE | `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29` on `origin/main` | Verified listings #84. Do not assume host equals this until HOSTED VERIFIED. |
| Owner-reviewed policy baseline | `7ed4e183d445baf2d1129b90e38fcffe3cfec59a` | R2: H1/H2/M2 PASS, M1 FAIL (capability ceiling). |
| R3 TESTED | `cfa483c77d22b2b6150255744865aee5583235f3` | Independent audit **PASS**. M1 ceiling. |
| Release lane SOURCE HEAD | local `codex/owner-reviewed-controlled-beta-20260917` **`b391a3f`** (R3 + polish) | COMMITTED locally. **DIRTY.** NOT proven PUSHED / MERGED / DEPLOYED / HOSTED VERIFIED. |
| UX candidate | `8d3ac083e4906c7d2940e7e4501191b8f4c923d3` | Held. Presentation only. Base was `7ed4e18`. |
| UX worktree HEAD | `a0d8c1498304161a38becd027173a02bcf1a6765` | **DIRTY** action-first + landing conversion uncommitted. |
| Engineering PR #86 | `bbb6ee31bffdd6c84729639c29d1d94c5ddb320e` | **FROZEN.** |
| DEPLOYED Production `https://app.1ststep.ai` | **NOT VERIFIED** as R3/UX SHAs | Do not infer from local commits. |

## Worktrees

- Release: `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\.worktrees\owner-reviewed-controlled-beta-20260917` — DIRTY (concierge/entitlement/session files). **SAFE TO SWITCH: NO.**
- UX: `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\.worktrees\job-agent-ui-ux-polish-20260917` — DIRTY. **SAFE TO SWITCH: NO.**
- Chrome extension / store policy `7a57fd7` and partners affiliate branches: **ACTIVE ISOLATED**, not this release lane.
- Post-beta streams: isolated; must not enter controlled-beta.

## Gates

| Gate | State |
|---|---|
| Independent R2 | FAIL M1 (historical) |
| R3 implementation + independent audit | PASS on `cfa483c` |
| UX integrate | held — Director only; do not auto-integrate |
| Zero-user Preview | pending / blocked |
| One invited test user E2E | pending |
| Complete human E2E | pending |
| Controlled 5-user beta | **0/5** |
| Counsel / Production signedBeta | blocked; `JOB_AGENT_COUNSEL_APPROVED` unset |

## Current blocker

Dirty release + UX worktrees. After hygiene: Director may integrate `8d3ac08` onto clean R3 lineage and run release tests. **No Preview, no tenant enablement, no Production.**

## Active job

Dispatcher: `JA-UX-CANDIDATE` BLOCKED (held). R3 audit PASS. Post-beta isolated.

## Next executor

Not Codex on these dirty worktrees. Preserve dirty files first. Then Director/implementation on a **clean** copy of `cfa483c`/`b391a3f` if the owner commits polish separately.

## Chrome extension / landing

- Extension: Greenhouse-only controlled-release (decision D-2026-09-04). Store-policy worktree dirty — not beta gate.
- Landing conversion + action-first: IMPLEMENTED in UX dirty tree, not COMMITTED. Waitlist ≠ beta tenants.

## Branch classes

| Ref | Class |
|---|---|
| `origin/main` `d64e174` | AUTHORITATIVE production integration |
| `codex/owner-reviewed-controlled-beta-20260917` | ACTIVE ISOLATED release |
| `cursor/job-agent-ui-ux-polish-20260917` | ACTIVE ISOLATED UX |
| PR #86 `bbb6ee3` | FROZEN / HISTORICAL for this lane |
| Chrome-store / partners / learning R&D worktrees | ACTIVE ISOLATED or UNKNOWN — not Job Agent beta authority |

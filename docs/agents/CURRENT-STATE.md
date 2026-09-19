# CURRENT-STATE — 1stStep Job Agent product family

Covers the three Job Agent surfaces: `app.1ststep.ai` (product), `resume.1ststep.ai` (acquisition), `partners.1ststep.ai` (affiliates).
Not `1ststep.ai` consultancy, not `/admin` Studio, not DaySetGo, not Universal Relocations.
Chat is not authority. Recency of commits is not authority. Git + `docs/agents/*` are.

Captured: 2026-09-18 (product-family reconciliation, Claude Code). Full evidence: `docs/agents/PRODUCT-FAMILY-RECONCILIATION-2026-09-18.md`.

State words used below: IMPLEMENTED → COMMITTED → PUSHED → MERGED → DEPLOYED → HOSTED VERIFIED. Nothing here is HOSTED VERIFIED unless it says so.

## One repository, three Vercel projects

| Surface | Vercel project | Source in repo | Deploy method |
|---|---|---|---|
| `app.1ststep.ai` | `1ststep-resume` (Git-linked, prod branch `main`, Preview on every push, Previews behind Vercel SSO) | repo root (`build-public-web.mjs` → `.public-web`) | Production has been **CLI-deployed**, not from `main` |
| `resume.1ststep.ai` | `1ststep-resume-landing` (not Git-linked, 0 env vars) | `resume-tailor-landing/standalone/` | CLI only |
| `partners.1ststep.ai` | `1ststep-growth-finder` (not Git-linked, 0 env vars) | `partners-landing/` | CLI only |

Remote: `https://github.com/1ststepai/1ststep-resume.git` (**PUBLIC** repository).
Local common git dir: `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\1ststep-resume-deploy\.git`. The parent `1ststep.ai` folder is not a git root.

## Source / deployment layers

| Layer | SHA | State |
|---|---|---|
| `origin/main` | `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29` | MERGED. **Behind** Production app/resume. |
| DEPLOYED Production `app.1ststep.ai` | `7412af1bb9704092cb729d8fcb78306e186ef055` (`codex/first-real-user-integration-20260914`), `dpl_229cmvzCQvh3hvcXZuKBPf9EwCyy`, CLI, 2026-09-15 | DEPLOYED. Clean-tree at deploy time not provable (CLI records only HEAD). |
| DEPLOYED Production `resume.1ststep.ai` | `7412af1bb9704092cb729d8fcb78306e186ef055`, `dpl_6pb5ERtApySGNdQapLcqRHforj2o`, CLI, 2026-09-15 | DEPLOYED. |
| DEPLOYED Production `partners.1ststep.ai` | `7ec3acc4968fb70339f343798f06f91405bec2e5` (main #77), `dpl_3qctMKn1Cm7jT77gLGSGZwe9oZQr`, CLI, 2026-09-10 | DEPLOYED. **Stale**: predates approval-only partner onboarding `b7eba4e`. |
| Owner-reviewed policy baseline | `7ed4e183d445baf2d1129b90e38fcffe3cfec59a` | R2 H1/H2/M2 PASS, M1 FAIL (historical). |
| R3 security successor | `cfa483c77d22b2b6150255744865aee5583235f3` | Independent audit **PASS**. Capability ceiling. Unmodified. |
| UX polish ancestor | `8d3ac083e4906c7d2940e7e4501191b8f4c923d3` | On `cursor/job-agent-ui-ux-polish-20260917`. |
| Final UX candidate | `cdab3c98af2cde461150adf5e59b5483758d2b35` (+ docs `e1f63621a47fa426d146eb78d16725384a5cbcbf`) | PUSHED. **Not green on its own tests** (13 browser + 1 unit + extension digest). **Contains a P0 consent bypass** (see Findings). Do not deploy this branch. |
| Launch-access preservation | `afcd97351fd23f03b768e0ff5a7befc2aa42987a` | PUSHED. Isolated, not integrated (Director review pending). |
| **Integrated RC** | branch `claude/job-agent-integrated-rc-20260918`; code tip `50473c67e24da6e6acb11bd65ceded93b9b6a463` (docs commit follows) | COMMITTED, PUSHED. Not MERGED, not DEPLOYED, NOT HOSTED VERIFIED. |
| Engineering PR #86 | `bbb6ee31bffdd6c84729639c29d1d94c5ddb320e` | FROZEN. |

Lineage is linear: `d64e174` (main) → `7412af1` (Prod) → … → `7ed4e18` → { `cfa483c` R3, `e1f6362` UX } → RC.

## What the RC contains

1. R3 `cfa483c` unchanged as base.
2. UX `e1f6362` merged (only `package.json` overlapped).
3. P0 fix: restored the R3 per-package human source review; removed UX auto-prepare that self-attested it.
4. Partial-search truthfulness, two dark-mode WCAG fixes, referral attribution (homepage/Job Agent capture → submit once after sign-in), `resume.1ststep.ai` single Job Agent CTA + referral carry, extension digest re-pin, test-harness fixes.

## Gates

| Gate | State |
|---|---|
| R3 independent security audit | PASS on `cfa483c` |
| Security re-review of RC deltas vs R3 | **PENDING** — required before Preview (RC adds UX client code, two public endpoints, referral module) |
| Director accept of RC | PENDING |
| Chrome extension exact-RC | PASS locally on RC (release suite 23/23, unpacked MV3 smoke, controlled build) |
| Zero-user Preview | PENDING owner gate (the automatic SSO Preview of a push is **not** this gate) |
| One invited user E2E | PENDING |
| Controlled beta | **0/5** |
| Counsel / Production signedBeta | blocked; `JOB_AGENT_COUNSEL_APPROVED` unset |

## Worktrees (dirty work is preserved, do not switch into them)

All dirty-tree contents and all 33 local-only branches were preserved on 2026-09-18 under `origin/preserve/*` (see reconciliation report). The worktrees themselves were not modified. Cursor/Codex worktrees under `.worktrees/` remain their owners'.

<!-- git-state:start -->
- Captured by hand at RC write; regenerate with `npm run agent:handoff-status`.
- Active branch: `claude/job-agent-integrated-rc-20260918`
- HEAD SHA (code): `50473c67e24da6e6acb11bd65ceded93b9b6a463`
- origin/main: `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29`
<!-- git-state:end -->

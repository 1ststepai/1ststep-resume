# CURRENT-STATE

**LIVE 2026-09-18 (portability):** Production `origin/main` = `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29`. R3 TESTED `cfa483c77d22b2b6150255744865aee5583235f3` independent-audit PASS. Owner-reviewed worktree HEAD is **`b391a3f` DIRTY** (not still `7ed4e18`). UX candidate `8d3ac08` held. This UX HEAD `a0d8c14` DIRTY (action-first + landing). SAFE TO SWITCH **NO**. Zero-user Preview / one-user E2E / 5-user beta all pending (0/5). Do not mix consultancy / resume / partners into this product. Lean packets also on the owner-reviewed worktree `docs/agents/*`.

Operational snapshot for app.1ststep.ai / `1ststep-resume`.
Chat history is not authority. Recency of commits is not authority.
Use the release ladder instead of a vague completion word: IMPLEMENTED → COMMITTED → PUSHED → MERGED → DEPLOYED → HOSTED VERIFIED.

Stale files that are **not** live authority: `docs/status.md`, `docs/tasks.md`, `docs/project_handoff_notes.md`.

## Canonical remote

- `origin` `https://github.com/1ststepai/1ststep-resume.git`

## Canonical branch

- Production integration branch: `main`
- Current integrated SHA: `origin/main` = `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29` (`Add verified Job Agent listings (#84)`)
- Do not treat sibling worktrees (Chrome store, affiliates, learning R&D, etc.) as production or Job Agent policy authority merely because they contain later-looking commits.

## Current integrated SHA

- Production: `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29` on `origin/main`
- Job Agent owner-reviewed policy baseline: `7ed4e183d445baf2d1129b90e38fcffe3cfec59a` (R2). R3 TESTED `cfa483c77d22b2b6150255744865aee5583235f3` PASS. Local branch `codex/owner-reviewed-controlled-beta-20260917` HEAD **`b391a3f` DIRTY**. COMMITTED locally through R3+polish. NOT proven PUSHED, MERGED to `main`, DEPLOYED, or HOSTED VERIFIED.

## Active release candidate(s)

### JA-UX-20260917 — Job Agent UI/UX polish

| Field | Value |
|---|---|
| Branch | `cursor/job-agent-ui-ux-polish-20260917` |
| Candidate SHA | `8d3ac083e4906c7d2940e7e4501191b8f4c923d3` |
| Base | `7ed4e18` (`codex/owner-reviewed-controlled-beta-20260917`) |
| Worktree | `C:/Users/evanp/Documents/Claude/Projects/1ststep.ai/.worktrees/job-agent-ui-ux-polish-20260917` |
| IMPLEMENTED | yes (presentation/layout/copy/a11y only) |
| COMMITTED | yes, local commit `8d3ac08` |
| PUSHED | no |
| MERGED | no |
| DEPLOYED | no |
| HOSTED VERIFIED | no |
| Review | UX candidate ready for release-lane review |
| Mobile QA | PASS |
| Accessibility QA | PASS |
| Security/consent behavior | unchanged |
| Beta scope | unchanged |

This candidate is **not** merged, deployed, or hosted-verified. Landing conversion must not delay its review.

### HANDOFF-PROTOCOL-20260917 — Cursor ↔ Codex continuity layer

- Status: COMMITTED locally at `616e450` plus snapshot `a0d8c14` on `cursor/job-agent-ui-ux-polish-20260917`. NOT PUSHED / NOT MERGED / NOT DEPLOYED / NOT HOSTED VERIFIED.

### LANDING-CONVERSION-20260917 — public acquisition funnel

| Field | Value |
|---|---|
| Branch | `cursor/job-agent-ui-ux-polish-20260917` |
| SHA | none (working tree after `a0d8c14`) |
| IMPLEMENTED | yes |
| COMMITTED | no |
| PUSHED / MERGED / DEPLOYED / HOSTED VERIFIED | no |
| Report | `docs/UX_LANDING_CONVERSION_2026-09-17.md` |
| Beta semantics | unchanged; waitlist ≠ invited-tenant list |

### ACTION-FIRST-UX-20260918 — remove unnecessary choice

| Field | Value |
|---|---|
| Branch | `cursor/job-agent-ui-ux-polish-20260917` |
| SHA | none (working tree after `a0d8c14`) |
| IMPLEMENTED | yes (presentation/copy/current-flow only) |
| COMMITTED | no |
| PUSHED / MERGED / DEPLOYED / HOSTED VERIFIED | no |
| Report | `docs/UX_ACTION_FIRST_2026-09-18.md` |
| Security/consent | unchanged |
| Safe for release-lane review | no; `8d3ac08` review must not wait on this dirty tree |

This candidate includes the earlier landing-conversion working tree. It is **not** merged, deployed, or hosted-verified.

## Active worktree(s)

This candidate's worktree is listed above. Many other worktrees exist on this machine. They are **not** this task's authority.

Owner-reviewed baseline worktree:

- `C:/Users/evanp/Documents/Claude/Projects/1ststep.ai/.worktrees/owner-reviewed-controlled-beta-20260917` at `b391a3f` DIRTY `[codex/owner-reviewed-controlled-beta-20260917]` (R3 tested `cfa483c`)

## Dirty worktrees

Material conflict for Job Agent integration:

- `owner-reviewed-controlled-beta-20260917` at `b391a3f` is dirty (concierge/entitlement/session files, including historically `lib/employer-browser-session-provider.js`). Do not merge/checkout that worktree until dirty files are committed, stashed, or explicitly preserved.

This worktree is dirty with action-first and landing-conversion files. Never overwrite another agent's uncommitted files.

## Active task

- TASK ID: `ACTION-FIRST-UX-20260918`
- Action-first UX and landing conversion are IMPLEMENTED, not COMMITTED.
- Remaining P0 for launch: release-lane review of `8d3ac08`.

## Completed work

- Owner-reviewed controlled-beta fail-closed policy at `7ed4e18` (COMMITTED locally; not a production release).
- UI/UX polish at `8d3ac08`.
- Handoff protocol at `616e450` / `a0d8c14`.
- Landing conversion IMPLEMENTED: first-party waitlist, conversion copy, product-loop demo, funnel events on the public homepage.
- Action-first UX IMPLEMENTED: one Start Job Agent landing CTA, setup Step X of Y, Saved Info / My Jobs / Needs You / extension journey CTAs. Not COMMITTED.

## Open P0 / P1 / P2

### P0

- Release-lane review of `8d3ac08` against owner-reviewed invariants. Do not wait on landing commit.
- Do not Preview-deploy, enable tenants, set counsel approval, or Production-deploy.

### P1

- Commit action-first + landing conversion only if the owner asks.
- Independent re-audit of owner-reviewed SHA `7ed4e18` before Preview enablement.

### P2

- Full vault redesign, Learning Center, `/app/resume` jargon, GHL default landing rewrite, login/onboarding funnel events after PR #86 unfreeze.

## Release blockers

- No legal/counsel production approval. Owner-reviewed is Preview-only.
- UX candidate not reviewed for integration, not pushed, not merged.
- `JOB_AGENT_COUNSEL_APPROVED` must remain unset.
- PR #86 remains frozen at `bbb6ee3`.

## Deployment state

- Production host `https://app.1ststep.ai` is **not** verified to serve `8d3ac08`, `7ed4e18`, `cfa483c`, `b391a3f`, or the uncommitted landing conversion.
- Do not infer deployment from local commits.

## Hosted verification state

- NOT HOSTED VERIFIED.

## Product currently does

1stStep is a full job-application workflow at `https://app.1ststep.ai/`. Job Agent controlled-beta (owner-reviewed) is autonomous-by-default / supervised-by-exception, receipt-only submission, tenant-scoped, consent-gated. The public landing now asks visitors to Start Job Agent or Join Early Access; the waitlist does not grant beta access.

## Machine-captured Git snapshot

<!-- git-state:start -->
- Captured at: `2026-09-18T16:33:27.773Z`
- This worktree: `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\.worktrees\job-agent-ui-ux-polish-20260917`
- Active branch: `cursor/job-agent-ui-ux-polish-20260917`
- HEAD SHA: `a0d8c1498304161a38becd027173a02bcf1a6765`
- Upstream: `(none)`
- Ahead/behind upstream: `n/a`/`n/a`
- origin/main: `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29`
- Dirty files in this worktree: `M 1ststep-extension/popup.html;  M 1ststep-extension/popup.js;  M build-public-web.mjs;  M client/concierge-router.js;  M client/subscriber-ui-model.js;  M concierge.html;  M concierge.js;  M docs/agents/CURRENT-STATE.md;  M docs/agents/DECISIONS.md;  M docs/agents/GIT-STATE.md;  M docs/agents/HANDOFF.md;  M docs/agents/NEXT-ACTIONS.md;  D home-motion-1f7df326a312.css;  D home-motion-4e0eecde7df1.js;  M index.html;  M package.json;  M persistent-concierge.css;  M resume-tailor-landing/ghl-cro-custom-code.html;  M scripts/beta-request-browser.spec.mjs;  M scripts/concierge-test.mjs;  M scripts/concierge-vault-browser.spec.mjs;  M scripts/extension-popup-browser.spec.mjs;  M scripts/homepage-motion-test.mjs;  M scripts/sherlock-security-review.mjs;  M scripts/vercel-output-boundary-test.mjs;  M vercel.json;  M where-to-find-1ststep-ai/index.html; ?? api/public-funnel-event.js; ?? api/public-waitlist.js; ?? docs/SESSION_RETROS/2026-09-18-action-first-ux.md; ?? docs/SESSION_RETROS/2026-09-18-landing-conversion.md; ?? docs/UX_ACTION_FIRST_2026-09-18.md; ?? docs/UX_LANDING_CONVERSION_2026-09-17.md; ?? home-funnel.js; ?? home-motion-cb30a966e447.css; ?? home-motion-e322125499c6.js; ?? lib/public-waitlist-store.js; ?? scripts/landing-conversion-browser.spec.mjs; ?? scripts/public-waitlist-test.mjs`
- Worktree count: `69`
- Dirty worktrees: `codex/chrome-store-policy-update@7a57fd7 (139 dirty); detached@9add18a (2 dirty); detached@d686aa5 (2 dirty); detached@9add18a (2 dirty); codex/aud029-login-headers-20260916@89acfc1 (9 dirty); detached@bbb6ee3 (25 dirty); codex/job-agent-engineering-os-20260912@345bc9b (5 dirty); cursor/job-agent-ui-ux-polish-20260917@a0d8c14 (39 dirty); codex/owner-reviewed-controlled-beta-20260917@b391a3f (28 dirty); release/consolidated-job-agent-v1.6-20260910@89cbd01 (6 dirty); detached@d64e174 (2 dirty); codex/background-continuation-20260910@8a6ba82 (5 dirty); feature/partners-affiliate-redesign@800bcae (1 dirty); detached@deeb03e (8 dirty); detached@f7c9067 (1 dirty); detached@7a57fd7 (124 dirty); detached@0c590a4 (1 dirty); detached@924cd75 (18 dirty); detached@924cd75 (26 dirty)`
<!-- git-state:end -->

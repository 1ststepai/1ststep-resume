# CURRENT-STATE

**LIVE 2026-09-18 (portability):** Production `origin/main` = `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29`. R3 TESTED `cfa483c77d22b2b6150255744865aee5583235f3` independent-audit PASS. Owner-reviewed worktree HEAD is **`b391a3f` DIRTY**. Combined UX inspect candidate **`6aa7b50a8121929d26d7aa852d4a5b37b49609e5`** (includes polish `8d3ac08`). SAFE TO SWITCH **NO**. Zero-user Preview / one-user E2E / 5-user beta all pending (0/5). Do not merge UX onto the controlled-beta baseline. Lean packets also on the owner-reviewed worktree `docs/agents/*`.

Operational snapshot for app.1ststep.ai / `1ststep-resume`.
Chat history is not authority. Recency of commits is not authority.
Use the release ladder instead of a vague completion word: IMPLEMENTED → COMMITTED → PUSHED → MERGED → DEPLOYED → HOSTED VERIFIED.

Stale files that are **not** live authority: `docs/status.md`, `docs/tasks.md`, `docs/project_handoff_notes.md`.

## Canonical remote

- `origin` `https://github.com/1ststepai/1ststep-resume.git`

## Canonical branch

- Production integration branch: `main`
- Current integrated SHA: `origin/main` = `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29` (`Add verified Job Agent listings (#84)`)
- Do not treat sibling worktrees as production or Job Agent policy authority merely because they contain later-looking commits.

## Current integrated SHA

- Production: `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29` on `origin/main`
- Job Agent owner-reviewed policy baseline: `7ed4e183d445baf2d1129b90e38fcffe3cfec59a` (R2). R3 TESTED `cfa483c77d22b2b6150255744865aee5583235f3` PASS. Local branch `codex/owner-reviewed-controlled-beta-20260917` HEAD **`b391a3f` DIRTY**. NOT proven PUSHED, MERGED to `main`, DEPLOYED, or HOSTED VERIFIED.

## Active release candidate(s)

### JA-UX-20260918 — action-first + landing successor (inspect only)

| Field | Value |
|---|---|
| Branch | `cursor/job-agent-ui-ux-polish-20260917` |
| Candidate SHA | `6aa7b50a8121929d26d7aa852d4a5b37b49609e5` |
| Includes polish | `8d3ac083e4906c7d2940e7e4501191b8f4c923d3` (ancestor; reconciled) |
| Base | `7ed4e18` owner-reviewed; action-first stacked after `a0d8c14` / `05f411f` |
| Worktree | `C:/Users/evanp/Documents/Claude/Projects/1ststep.ai/.worktrees/job-agent-ui-ux-polish-20260917` |
| IMPLEMENTED | yes (presentation/layout/copy/a11y/current-flow only) |
| COMMITTED | yes, local commit `6aa7b50` |
| PUSHED | pending this cycle |
| MERGED | no — must not merge onto owner-reviewed by the UX agent |
| DEPLOYED | no |
| HOSTED VERIFIED | no |
| Review | Isolated UX inspect candidate. R3 remains security authority |
| Report | `docs/UX_ACTION_FIRST_2026-09-18.md` |
| Security/consent behavior | unchanged |
| Beta scope | unchanged; waitlist ≠ invited-tenant list |

### HANDOFF-PROTOCOL-20260917 — Cursor ↔ Codex continuity layer

- Status: COMMITTED locally at `616e450` plus snapshots `a0d8c14` / `05f411f` on this branch. NOT MERGED / NOT DEPLOYED / NOT HOSTED VERIFIED.

## Active worktree(s)

Owner-reviewed baseline worktree:

- `C:/Users/evanp/Documents/Claude/Projects/1ststep.ai/.worktrees/owner-reviewed-controlled-beta-20260917` at `b391a3f` DIRTY `[codex/owner-reviewed-controlled-beta-20260917]` (R3 tested `cfa483c`)

## Dirty worktrees

- `owner-reviewed-controlled-beta-20260917` at `b391a3f` is dirty. Do not merge/checkout that worktree until dirty files are committed, stashed, or explicitly preserved.

## Active task

- TASK ID: `UX-POLISH-20260917`
- Combined UX successor `6aa7b50` is COMMITTED for inspect. Remaining P0: Codex inspect; do not merge onto R3 lineage.

## Completed work

- Owner-reviewed controlled-beta fail-closed policy at `7ed4e18`.
- UI/UX polish at `8d3ac08`.
- Handoff protocol at `616e450` / `a0d8c14` / `05f411f`.
- Action-first + landing conversion COMMITTED at `6aa7b50`.

## Open P0 / P1 / P2

### P0

- Codex inspect of `6aa7b50` (includes `8d3ac08`). Do not merge onto owner-reviewed. R3 remains authoritative.
- Do not Preview-deploy, enable tenants, set counsel approval, or Production-deploy.

### P1

- Independent re-audit of owner-reviewed SHA after hygiene (`cfa483c` already PASS).
- Refresh Git snapshot after every meaningful cycle.

### P2

- Full vault redesign, Learning Center, `/app/resume` jargon, GHL default landing rewrite, login/onboarding funnel events after PR #86 unfreeze.

## Release blockers

- No legal/counsel production approval. Owner-reviewed is Preview-only.
- UX candidate not merged; must wait for R3 independent pass then Release Validation.
- `JOB_AGENT_COUNSEL_APPROVED` must remain unset.
- PR #86 remains frozen at `bbb6ee3`.

## Deployment state

- Production host `https://app.1ststep.ai` is **not** verified to serve `6aa7b50`, `8d3ac08`, `7ed4e18`, `cfa483c`, or `b391a3f`.

## Hosted verification state

- NOT HOSTED VERIFIED.

## Product currently does

1stStep is a full job-application workflow at `https://app.1ststep.ai/`. Job Agent controlled-beta (owner-reviewed) is autonomous-by-default / supervised-by-exception, receipt-only submission, tenant-scoped, consent-gated. The public landing asks visitors to Start Job Agent (email first) or Join Early Access; the waitlist does not grant beta access.

## Machine-captured Git snapshot

<!-- git-state:start -->
- Captured at: `2026-09-18T17:09:22.796Z`
- This worktree: `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\.worktrees\job-agent-ui-ux-polish-20260917`
- Active branch: `cursor/job-agent-ui-ux-polish-20260917`
- HEAD SHA: `6aa7b50a8121929d26d7aa852d4a5b37b49609e5`
- Upstream: `(none)`
- Ahead/behind upstream: `n/a`/`n/a`
- origin/main: `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29`
- Dirty files in this worktree: `M docs/UX_ACTION_FIRST_2026-09-18.md;  M docs/agents/CURRENT-STATE.md;  M docs/agents/GIT-STATE.md;  M docs/agents/HANDOFF.md;  M docs/agents/NEXT-ACTIONS.md`
- Worktree count: `69`
- Dirty worktrees: `codex/chrome-store-policy-update@7a57fd7 (139 dirty); detached@9add18a (2 dirty); detached@d686aa5 (2 dirty); detached@9add18a (2 dirty); codex/aud029-login-headers-20260916@89acfc1 (9 dirty); detached@bbb6ee3 (25 dirty); codex/job-agent-engineering-os-20260912@345bc9b (5 dirty); cursor/job-agent-ui-ux-polish-20260917@6aa7b50 (5 dirty); codex/owner-reviewed-controlled-beta-20260917@f0a15d5 (28 dirty); release/consolidated-job-agent-v1.6-20260910@89cbd01 (6 dirty); detached@d64e174 (2 dirty); codex/background-continuation-20260910@8a6ba82 (5 dirty); feature/partners-affiliate-redesign@800bcae (1 dirty); detached@deeb03e (8 dirty); detached@f7c9067 (1 dirty); detached@7a57fd7 (124 dirty); detached@0c590a4 (1 dirty); detached@924cd75 (18 dirty); detached@924cd75 (26 dirty)`
<!-- git-state:end -->

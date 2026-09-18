# CURRENT-STATE

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
- Job Agent owner-reviewed policy baseline: `7ed4e183d445baf2d1129b90e38fcffe3cfec59a` on local branch `codex/owner-reviewed-controlled-beta-20260917`. This SHA is COMMITTED locally. It is NOT proven PUSHED, MERGED to `main`, DEPLOYED, or HOSTED VERIFIED.

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
| PUSHED | no (no `origin/cursor/job-agent-ui-ux-polish-20260917`) |
| MERGED | no |
| DEPLOYED | no |
| HOSTED VERIFIED | no |
| Review | UX candidate ready for release-lane review |
| Mobile QA | PASS |
| Accessibility QA | PASS |
| Security/consent behavior | unchanged |
| Beta scope | unchanged |

This candidate is **not** merged, deployed, or hosted-verified.

### HANDOFF-PROTOCOL-20260917 — Cursor ↔ Codex continuity layer

- Files: `AGENTS.md`, `docs/agents/*`, `scripts/agent-handoff-status.mjs`, `scripts/agent-handoff-status-test.mjs`
- Status: IMPLEMENTED in this worktree; COMMITTED only after the protocol commit lands. NOT PUSHED / NOT MERGED / NOT DEPLOYED / NOT HOSTED VERIFIED.

## Active worktree(s)

This candidate's worktree is listed above. Many other worktrees exist on this machine (owner-reviewed beta, PR #86 freeze, learning evidence, Chrome store, etc.). They are **not** this task's authority. Inspect `git worktree list` and `docs/agents/GIT-STATE.md` before editing.

Owner-reviewed baseline worktree:

- `C:/Users/evanp/Documents/Claude/Projects/1ststep.ai/.worktrees/owner-reviewed-controlled-beta-20260917` at `7ed4e18` `[codex/owner-reviewed-controlled-beta-20260917]`

## Dirty worktrees

Machine snapshot lists 19 dirty worktrees on this machine. They are not this candidate's authority.

Material conflict for Job Agent integration:

- `owner-reviewed-controlled-beta-20260917` at `7ed4e18` is dirty: `lib/employer-browser-session-provider.js`. Do not merge/checkout that worktree until that file is committed, stashed, or explicitly discarded.

This worktree's dirty files should only be the handoff-protocol docs/scripts until they are committed. See `docs/agents/GIT-STATE.md`.

Never overwrite another agent's uncommitted files.

## Active task

- TASK ID: `UX-POLISH-20260917`
- Presentation-only Job Agent polish is COMMITTED at `8d3ac08`.
- Remaining: release-lane review and possible integration of `8d3ac08` onto `7ed4e18`. Handoff protocol must be committed so a fresh agent can resume from Git alone.

## Completed work

- Owner-reviewed controlled-beta fail-closed policy at `7ed4e18` (COMMITTED locally; not a production release).
- UI/UX polish at `8d3ac08`: user-facing status labels, Needs You as first-class UX, vault trust chips, readable type, fail-closed daily-search checkbox, login `returnTo` heading guard.
- Targeted concierge/UI tests PASS on that SHA.

## Open P0 / P1 / P2

### P0

- Release-lane review of `8d3ac08` (presentation-only) against owner-reviewed invariants.
- Do not Preview-deploy, enable tenants, set counsel approval, or Production-deploy the owner-reviewed or UX SHAs.

### P1

- Commit and keep `docs/agents/*` current whenever an agent stops work.
- Independent re-audit of owner-reviewed successor SHA still required before any Preview enablement (`docs/SESSION_RETROS/2026-09-17-owner-reviewed-r2.md`).

### P2

- Left from UX audit, presentation-only and out of scope for this candidate: full vault redesign, Learning Center, `/app/resume` residual admin jargon.

## Release blockers

- No legal/counsel production approval. Owner-reviewed is Preview-only.
- UX candidate not reviewed for integration, not pushed, not merged.
- `JOB_AGENT_COUNSEL_APPROVED` must remain unset.
- PR #86 remains frozen at `bbb6ee3`.

## Deployment state

- Production host `https://app.1ststep.ai` is **not** verified to serve `8d3ac08` or `7ed4e18`.
- Do not infer deployment from local commits.

## Hosted verification state

- NOT HOSTED VERIFIED for the UX candidate or the owner-reviewed SHA.

## Product currently does

1stStep is a full job-application workflow at `https://app.1ststep.ai/`: upload résumé, capture/paste jobs, tailor materials, match score, track jobs, Chrome extension capture, interview prep. Job Agent controlled-beta (owner-reviewed) is autonomous-by-default / supervised-by-exception, receipt-only submission, tenant-scoped, consent-gated. The UX candidate only changes how that existing loop is presented.

## Machine-captured Git snapshot

<!-- git-state:start -->
- Captured at: `2026-09-18T03:02:20.953Z`
- This worktree: `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\.worktrees\job-agent-ui-ux-polish-20260917`
- Active branch: `cursor/job-agent-ui-ux-polish-20260917`
- HEAD SHA: `8d3ac083e4906c7d2940e7e4501191b8f4c923d3`
- Upstream: `(none)`
- Ahead/behind upstream: `n/a`/`n/a`
- origin/main: `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29`
- Dirty files in this worktree: `M AGENTS.md;  M CLAUDE.md;  M docs/AI_HANDOFF.md;  M docs/SESSION_RETROS/README.md;  M package.json; ?? docs/SESSION_RETROS/2026-09-17-cursor-codex-handoff-protocol.md; ?? docs/agents/; ?? scripts/agent-handoff-status-test.mjs; ?? scripts/agent-handoff-status.mjs`
- Worktree count: `69`
- Dirty worktrees: `cursor/job-agent-ui-ux-polish-20260917@8d3ac08 (9 dirty)`
<!-- git-state:end -->

# NEXT-ACTIONS

Prioritized executable queue. Every item must be runnable by a fresh Cursor or Codex session with no chat history.

If work stops, rewrite the top item into a concrete command or review step. Vague "keep going" language is not an action.

## P0

### P0-1 — Commit the handoff layer if it is still untracked

- Skip if `git ls-files docs/agents/HANDOFF.md` already prints a path.
- If `git status --porcelain` still shows `?? docs/agents/` or modified `AGENTS.md` / `scripts/agent-handoff-status.mjs`, commit only the protocol files: `AGENTS.md`, `CLAUDE.md`, `package.json`, `docs/agents/**`, `docs/AI_HANDOFF.md`, `docs/SESSION_RETROS/README.md`, `docs/SESSION_RETROS/2026-09-17-cursor-codex-handoff-protocol.md`, `scripts/agent-handoff-status.mjs`, `scripts/agent-handoff-status-test.mjs`.
- Do not include Job Agent product refactors; the UX candidate is already `8d3ac08`.
- Verify: `npm run test:agent-handoff` then `npm run agent:handoff-status`.
- Then continue with P0-2.

### P0-2 — Release-lane review of UI/UX candidate `8d3ac08`

- Candidate: `8d3ac083e4906c7d2940e7e4501191b8f4c923d3`
- Base: `7ed4e18` on `codex/owner-reviewed-controlled-beta-20260917`
- Diff scope: presentation, layout, copy, a11y, current-flow interaction only.
- Check: `git diff 7ed4e18 8d3ac083e4906c7d2940e7e4501191b8f4c923d3 --stat` and confirm no auth/consent/Vault/package/submission/policy changes.
- Invariants: `docs/OWNER_REVIEWED_CONTROLLED_BETA.md`, `docs/AI_MEMORY.md`, `docs/agents/DECISIONS.md`.
- If accepted: integrate `8d3ac08` into the owner-reviewed release lane without unrelated worktree commits. Do not check out `C:/Users/evanp/Documents/Claude/Projects/1ststep.ai/.worktrees/owner-reviewed-controlled-beta-20260917` until its uncommitted `lib/employer-browser-session-provider.js` is resolved. Cherry-pick or merge `8d3ac08` onto `7ed4e18` on a clean tree, keeping later docs-only protocol commits if they should travel with the candidate.
- After integrate: run `npm run pretest:concierge && npm run test:concierge && npm run test:browser:vault` and Playwright `scripts/concierge-job-capture-browser.spec.mjs` `scripts/ui-handoff-browser.spec.mjs`.
- Record the resulting integration SHA in `CURRENT-STATE.md` and `HANDOFF.md`.
- Do not: push, merge to `main`, deploy, enable tenants, or set `JOB_AGENT_COUNSEL_APPROVED`.
- Resulting states to record: IMPLEMENTED (already), COMMITTED (already for `8d3ac08`), PUSHED/MERGED/DEPLOYED/HOSTED VERIFIED remain no unless evidence appears.

## P1

### P1-1 — Independent re-audit of owner-reviewed SHA `7ed4e18`

- Read `docs/SESSION_RETROS/2026-09-17-owner-reviewed-r2.md`.
- Do not modify PR #86 (`bbb6ee3`), do not set `JOB_AGENT_COUNSEL_APPROVED`, do not enable beta users, do not deploy.

### P1-2 — Refresh Git snapshot after every meaningful cycle

- Command: `npm run agent:handoff-status`
- Then reconcile `HANDOFF.md` TASK/NEXT ACTION by hand. The script must not be used to invent next actions.

## P2

### P2-1 — Deferred presentation work (not this candidate)

- Full vault redesign, Learning Center, `/app/resume` residual admin jargon.
- Do not start these while P0-2 is open unless the owner explicitly re-prioritizes.

## Explicit non-actions

- Do not redesign Job Agent runtime, consent, or submission for this queue.
- Do not treat `docs/status.md` / `docs/tasks.md` as the queue.
- Do not assume a dirty or newer-looking sibling worktree is the release candidate.

# NEXT-ACTIONS

Prioritized executable queue. Every item must be runnable by a fresh Cursor or Codex session with no chat history.

If work stops, rewrite the top item into a concrete command or review step. Vague "keep going" language is not an action.

## P0

### P0-1 — Release-lane review of UI/UX candidate `8d3ac08`

- Candidate: `8d3ac083e4906c7d2940e7e4501191b8f4c923d3`
- Base: `7ed4e18` on `codex/owner-reviewed-controlled-beta-20260917`
- Diff scope: presentation, layout, copy, a11y, current-flow interaction only.
- Check: `git diff 7ed4e18 8d3ac083e4906c7d2940e7e4501191b8f4c923d3 --stat` and confirm no auth/consent/Vault/package/submission/policy changes.
- Invariants: `docs/OWNER_REVIEWED_CONTROLLED_BETA.md`, `docs/AI_MEMORY.md`, `docs/agents/DECISIONS.md`.
- If accepted: integrate `8d3ac08` into the owner-reviewed release lane without unrelated worktree commits. Do not check out `C:/Users/evanp/Documents/Claude/Projects/1ststep.ai/.worktrees/owner-reviewed-controlled-beta-20260917` until its uncommitted `lib/employer-browser-session-provider.js` is resolved.
- After integrate: run `npm run pretest:concierge && npm run test:concierge && npm run test:browser:vault` and Playwright `scripts/concierge-job-capture-browser.spec.mjs` `scripts/ui-handoff-browser.spec.mjs`.
- Do not wait for the uncommitted action-first/landing working tree. Do not push, merge to `main`, deploy, enable tenants, or set `JOB_AGENT_COUNSEL_APPROVED`.

### P0-2 — Verify polish candidate `8d3ac083e4906c7d2940e7e4501191b8f4c923d3` with concierge tests after review

- Command: `npm run pretest:concierge && npm run test:concierge`
- Also run Playwright `scripts/concierge-job-capture-browser.spec.mjs` and `scripts/ui-handoff-browser.spec.mjs` before claiming integrate readiness.
- Do not fold uncommitted action-first files into this verification.

## P1

### P1-1 — Commit action-first + landing conversion only if the owner asks

- Working tree on `cursor/job-agent-ui-ux-polish-20260917` after `a0d8c14`.
- Reports: `docs/UX_ACTION_FIRST_2026-09-18.md`, `docs/UX_LANDING_CONVERSION_2026-09-17.md`.
- Verify before commit: `npm run test:homepage` and `npm run test:landing-conversion`.
- Do not include owner-reviewed dirty files from another worktree.

### P1-2 — Independent re-audit of owner-reviewed SHA after hygiene

- R3 TESTED `cfa483c77d22b2b6150255744865aee5583235f3` already PASS. Do not treat `7ed4e18` as current HEAD.
- Local `b391a3f` is DIRTY — do not audit until clean or use a new worktree of `cfa483c`.
- Read `docs/SESSION_RETROS/2026-09-17-owner-reviewed-r2.md` for R2 history only.
- Do not modify PR #86 (`bbb6ee3`), do not set `JOB_AGENT_COUNSEL_APPROVED`, do not enable beta users, do not deploy.

### P1-3 — Refresh Git snapshot after every meaningful cycle

- Command: `npm run agent:handoff-status`
- Then reconcile `HANDOFF.md` TASK/NEXT ACTION by hand. The script must not be used to invent next actions.

## P2

### P2-1 — Deferred presentation work (not this candidate)

- Full vault redesign, Learning Center, `/app/resume` residual admin jargon.
- GHL default landing rewrite; standalone `resume.1ststep.ai` still uses Start Free → app signup.
- Wire `signup_*` / `onboarding_*` funnel events only after PR #86 is unfrozen.

## Explicit non-actions

- Do not redesign Job Agent runtime, consent, or submission for this queue.
- Do not treat waitlist signups as beta tenants.
- Do not treat `docs/status.md` / `docs/tasks.md` as the queue.
- Do not assume a dirty or newer-looking sibling worktree is the release candidate.

# NEXT-ACTIONS

Prioritized executable queue. Every item must be runnable by a fresh Cursor or Codex session with no chat history.

If work stops, rewrite the top item into a concrete command or review step. Vague "keep going" language is not an action.

## P0

### P0-1 — Inspect combined UX successor `6aa7b50` without merging onto R3

- Candidate: `6aa7b50a8121929d26d7aa852d4a5b37b49609e5`
- Includes polish: `8d3ac083e4906c7d2940e7e4501191b8f4c923d3`
- Base: `7ed4e18` on `codex/owner-reviewed-controlled-beta-20260917`
- Diff: `git diff 7ed4e18 6aa7b50a8121929d26d7aa852d4a5b37b49609e5 --stat`
- Report: `docs/UX_ACTION_FIRST_2026-09-18.md`
- Confirm presentation, layout, copy, a11y, current-flow only. No auth/consent/Vault/package/submission/policy changes.
- Do **not** merge onto `codex/owner-reviewed-controlled-beta-20260917`. R3 `cfa483c77d22b2b6150255744865aee5583235f3` remains the security-remediation authority. Release Validation integrates UX after R3 independently passes.
- Do not check out `C:/Users/evanp/Documents/Claude/Projects/1ststep.ai/.worktrees/owner-reviewed-controlled-beta-20260917` until its dirty files are preserved.
- Do not push-merge to `main`, deploy, enable tenants, or set `JOB_AGENT_COUNSEL_APPROVED`.

### P0-2 — Verify polish candidate `8d3ac083e4906c7d2940e7e4501191b8f4c923d3` lineage with concierge tests after inspect

- Command: `npm run pretest:concierge && npm run test:concierge`
- Also run Playwright `scripts/concierge-job-capture-browser.spec.mjs` and `scripts/ui-handoff-browser.spec.mjs` before claiming integrate readiness.
- Run against a new worktree of `6aa7b50` or `8d3ac08`, not the dirty owner-reviewed tree.

## P1

### P1-1 — Independent re-audit of owner-reviewed SHA after hygiene

- R3 TESTED `cfa483c77d22b2b6150255744865aee5583235f3` already PASS. Do not treat `7ed4e18` as current HEAD.
- Local `b391a3f` is DIRTY — do not audit until clean or use a new worktree of `cfa483c`.
- Do not modify PR #86 (`bbb6ee3`), do not set `JOB_AGENT_COUNSEL_APPROVED`, do not enable beta users, do not deploy.

### P1-2 — Refresh Git snapshot after every meaningful cycle

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
- Do not merge this UX successor onto the controlled-beta release baseline.

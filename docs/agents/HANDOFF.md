# HANDOFF — live Cursor ↔ Codex ↔ Claude baton

Git and this file are authoritative. Chat history is not.
Fresh executor with zero history: read this, `CURRENT-STATE.md`, `NEXT-ACTIONS.md`, `DECISIONS.md`, then `PRODUCT-FAMILY-RECONCILIATION-2026-09-18.md`.

ACTIVE AGENT: none (baton open)
LAST AGENT: Claude Code
TIMESTAMP: 2026-09-18T21:30:00-04:00
REPOSITORY: https://github.com/1ststepai/1ststep-resume.git
CANONICAL BRANCH: `main` at `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29` (behind Production `7412af1`; see CURRENT-STATE)
HEAD SHA: `50473c67e24da6e6acb11bd65ceded93b9b6a463` (RC code tip; the docs commit that adds this file follows it)
ACTIVE BRANCH: `claude/job-agent-integrated-rc-20260918`
ACTIVE WORKTREE: `C:/Users/evanp/Documents/Claude/Projects/1ststep.ai/.worktrees/claude-integrated-rc-20260918`
TASK ID: JA-PRODUCT-FAMILY-RECONCILIATION-20260918
TASK: Reconcile app/resume/partners, preserve dirty work, build one integrated RC on R3, fix demonstrated P0/P1s, record deployment parity.
STATUS: RC IMPLEMENTED, COMMITTED, PUSHED. Not MERGED, not DEPLOYED, NOT HOSTED VERIFIED. Beta 0/5.
LAST COMPLETED ACTION: Final RC test matrix and durable docs.
FILES CHANGED: see `git log cfa483c..claude/job-agent-integrated-rc-20260918`.
COMMITS CREATED: `e83658a` merge UX onto R3; `695578f` P0 consent fix + a11y + attribution + test fixes; `50473c6` extension digest re-pin; then docs.
UNCOMMITTED CHANGES: none in this worktree. Other agents' dirty worktrees were preserved to `origin/preserve/*`, not modified.
TESTS RUN: pretest:concierge, test:concierge, test:application-candidate, test:homepage, test:resilience, test:continuous-improvement, test:deployment-output, build:web, R3 ceiling + policy, security-regression, pilot-access, entitlement, extension release (23 browser) + unpacked MV3 smoke + controlled build, 16 Playwright specs.
TEST RESULTS: see the reconciliation report "Test evidence". All unit/integration/security suites PASS. Browser: all PASS except 3 failures that also fail on pure R3 (signed-out fixtures) and occasional order-dependent flakes.
KNOWN FAILURES: `dialog-keyboard` guided launch ×2, `discovery-retry` (pre-existing on R3; fixture opens setup while signed out).
BLOCKERS: security re-review of RC deltas (P0-1); Director accept (P0-2); owner Preview gate (P0-4).
DO NOT CHANGE: auth, consent, legal gates, access control, Vault/résumé authority, per-package source review, package truth, employer submission/transmission, PR #86 `bbb6ee3`, pilot allowlist, `JOB_AGENT_COUNSEL_APPROVED`, owner-reviewed policy semantics.
NEXT ACTION: Independent security re-review of `git diff cfa483c claude/job-agent-integrated-rc-20260918` (NEXT-ACTIONS P0-1), then Director accept, then re-run `npm run pretest:concierge && npm run test:concierge && npm run test:browser:vault` on the accepted SHA.
NEXT VERIFICATION: `npm run smoke` and `npm run test:agent-handoff` on this branch.
DEPLOYMENT STATUS: RC NOT DEPLOYED (only the automatic SSO-protected Vercel Preview that every push creates). Production unchanged: app/resume `7412af1`, partners `7ec3acc`.

## Resume from zero

```text
git fetch origin
git worktree add ../ja-next origin/claude/job-agent-integrated-rc-20260918
cd ../ja-next && npm ci
# R3 = cfa483c77d22b2b6150255744865aee5583235f3 (immutable)
# RC = origin/claude/job-agent-integrated-rc-20260918
# If port 4175 is busy: set PORT=<free port> for Playwright
```

## Machine-captured Git snapshot

Regenerate with `npm run agent:handoff-status`. Trust Git for SHAs and dirty files.

<!-- git-state:start -->
- Captured by hand at RC write.
- Active branch: `claude/job-agent-integrated-rc-20260918`
- HEAD SHA: `50473c67e24da6e6acb11bd65ceded93b9b6a463`
- origin/main: `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29`
<!-- git-state:end -->

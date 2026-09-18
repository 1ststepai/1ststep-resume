# HANDOFF — Job Agent controlled-beta

Fresh Codex with zero chat history: read this, CURRENT-STATE, NEXT-ACTIONS, DECISIONS. Chat is not authority.

## Repository

- Remote: `https://github.com/1ststepai/1ststep-resume.git`
- Production branch: `main` @ `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29` — **UNTOUCHED**
- R3 AUTHORITATIVE SHA: `cfa483c77d22b2b6150255744865aee5583235f3` — independent audit **PASS**
- FINAL UX CANDIDATE SHA: `cdab3c98af2cde461150adf5e59b5483758d2b35`
- UX branch: `cursor/job-agent-ui-ux-polish-20260917`
- Prior polish ancestor: `8d3ac083e4906c7d2940e7e4501191b8f4c923d3`
- Action-first+landing inspect SHA: `6aa7b50a8121929d26d7aa852d4a5b37b49609e5`
- Release handoff branch: `codex/owner-reviewed-controlled-beta-20260917`
- Launch-access preservation (not R3): `afcd97351fd23f03b768e0ff5a7befc2aa42987a` on `cursor/owner-reviewed-launch-access-20260918`
- Engineering PR #86: `bbb6ee31bffdd6c84729639c29d1d94c5ddb320e` **FROZEN**

## Codex resume (zero Cursor context)

```text
git fetch origin
git worktree add ../ja-codex-handoff origin/codex/owner-reviewed-controlled-beta-20260917
# read docs/agents/HANDOFF.md CURRENT-STATE.md NEXT-ACTIONS.md DECISIONS.md
# R3 = cfa483c77d22b2b6150255744865aee5583235f3
# UX = cdab3c98af2cde461150adf5e59b5483758d2b35
# next job = Director-only integrate of UX onto a NEW worktree of R3
```

Do **not** check out a dirty Cursor worktree. Do **not** merge UX into R3 in this job. Do **not** deploy.

## Completed

- R3 independent audit PASS on `cfa483c`.
- UX polish `8d3ac08` is an ancestor of the final UX candidate.
- Action-first + landing conversion committed at `6aa7b50` and pushed.
- Tester-accepted one-action / auto-prepare / first-draft review overlay committed at `cdab3c9` on the UX branch. **Not merged into R3.**
- Tester invite / page-owner admin access work preserved at `afcd973`. **Not R3. Not integrated.**

## Current work

Director-only UX integrate onto a clean R3 worktree. Then relevant tests. Chrome extension exact-RC verification. Zero-user Preview. One-user E2E. Controlled beta up to 5. Production remains blocked.

## Do-not-change

Auth/consent/Vault/package/submission policy. PR #86. `JOB_AGENT_COUNSEL_APPROVED`. Employer submission/transmission. Pilot tenant enablement in this job. Production. Post-beta streams. Consultancy/partners/resume sites.

## Tests required after Director integrate

`npm run pretest:concierge && npm run test:concierge && npm run test:browser:vault` plus Playwright `scripts/concierge-job-capture-browser.spec.mjs` and `scripts/ui-handoff-browser.spec.mjs`. Then Chrome extension exact-RC verification.

## Next exact action

`JA-UX-INTEGRATE` — Director only. New worktree of `cfa483c`. Inspect `git diff 7ed4e18 cdab3c9`. Integrate presentation/action-first/launch-loop UX only if accepted. Do not Preview. Do not enable tenants.

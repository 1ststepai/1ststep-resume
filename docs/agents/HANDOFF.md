# HANDOFF — Job Agent controlled-beta

Fresh Codex with zero chat history: read this, CURRENT-STATE, NEXT-ACTIONS, DECISIONS, `docs/OWNER_REVIEWED_CONTROLLED_BETA.md` if present on this SHA.

## Repository

- Remote: `https://github.com/1ststepai/1ststep-resume.git`
- Production branch: `main` @ `d64e1743a63c40760d2c7ce8ef8f5a2f75d53f29`
- Release branch: `codex/owner-reviewed-controlled-beta-20260917`
- Exact local HEAD when this was written: `b391a3f` **DIRTY**
- R3 TESTED (clean audit SHA): `cfa483c77d22b2b6150255744865aee5583235f3`
- This worktree: `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\.worktrees\owner-reviewed-controlled-beta-20260917`
- UX worktree (do not mix): `...\job-agent-ui-ux-polish-20260917` HEAD `a0d8c14` DIRTY; candidate `8d3ac08`

## Codex resume

**Do not checkout this worktree while it is dirty and Cursor occupies it.**

```text
git fetch origin
# new worktree of the R3 tested SHA:
git worktree add ../ja-r3-clean cfa483c77d22b2b6150255744865aee5583235f3
git status
```

If `b391a3f` has been committed and pushed, use that SHA instead. Verify `targetSha` not superseded.

## Completed

R2 historical (M1 FAIL). R3 PASS + independent audit PASS on `cfa483c`. UX polish COMMITTED at `8d3ac08` (not pushed). Action-first/landing IMPLEMENTED not COMMITTED on the UX tree.

## Current work

Worktree hygiene. UX integrate is Director-gated. Preview/E2E/5-user beta not started (0/5).

## Do-not-change

Auth/consent/Vault/package/submission policy. PR #86. Counsel flag. Pilot tenant list. Production. Consultancy/partners/resume sites. Post-beta folded into release.

## Tests completed

R3 independent audit PASS (dispatcher evidence). UX tree previously recorded homepage/concierge/landing Playwright PASS — not a release-gate claim for `b391a3f` dirty files.

## Tests required

After clean UX integrate: pretest/concierge/vault + job-capture/ui-handoff Playwright.

## Active job

`JA-WORKTREE-HYGIENE` then `JA-UX-CANDIDATE`.

## Next exact action

Preserve dirty files. Open a new worktree on `cfa483c`. Review `git diff 7ed4e18 8d3ac08`. Do not Preview.

## Owner-only gates

Preview, one-user E2E, 5-user beta, Production, counsel approval, committing foreign dirty trees, Chrome store publish.

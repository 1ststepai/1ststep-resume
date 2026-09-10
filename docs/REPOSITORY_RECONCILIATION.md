# Repository reconciliation — 2026-09-10

This is the read-only-first hygiene and release-readiness record for the local `1stStep.ai` umbrella workspace. Git, GitHub, Chrome Web Store, Vercel, tests, and on-disk state were freshly inspected on 2026-09-10. No merge, reset, force-push, production deployment, extension publication, pricing change, OAuth credential rotation, provider activation, or applicant-data operation was performed.

## Executive result

> Release follow-up: the inventory below remains the historical hygiene snapshot. PR #80 on `release/consolidated-job-agent-v1.6-20260910` is now the sole integration path for the verified v1.6 extension ancestry and PR #79 documentation. The candidate also replaces the rejected broad partner-preview history with a focused, encrypted partner-role workflow: explicit existing-user and affiliate-only paths, no implicit Job Agent data or entitlement, administrator-only approval, and account export/deletion coverage. Exact pushed-head CI, production configuration, authenticated mobile persistence, and source/deployment parity remain release gates; Chrome Web Store publication remains separately gated.

- The source of truth for `app.1ststep.ai`, the Chrome extension, `resume.1ststep.ai`, and `partners.1ststep.ai` is `1ststepai/1ststep-resume`.
- The authoritative repository has 44 registered worktrees. It started with 12 dirty worktrees and finishes with 8. Four were cleaned only after their changes were proven generated or already preserved in merged commits.
- Current `origin/main` is `8a6ba82`. Its smoke, public build, and 17-test extension release suite pass.
- PR #72 is the selected v1.6 durable-capture candidate at `5c30d77`; its complete `release:gate`, production build, and 23-test extension browser suite pass. A fresh controlled ZIP reproduced the supplied SHA-256 `72491347f92a416d76d0e81f097aa0516d277587bfa304fadb20c22d42f44fff`. It is seven commits behind `main` and is not released.
- PR #79 is the operating-system/reconciliation branch. It is clean, three commits ahead of `main` before this reconciliation update, and all GitHub checks were green at inspection time.
- The Chrome Web Store remains v1.3.2. `main` is v1.5.0, PR #72 is v1.6.0, and the mixed primary checkout currently says v1.4.0. That four-way drift blocks extension release.
- Three production aliases return HTTP 200 from Ready Vercel deployments, but Vercel exposes no Git commit SHA for those deployments. Live source parity is therefore `unknown`, not proven.
- No high-confidence live credential signature was found in tracked current files. Real `.env*.local` and `.vercel` environment files are ignored. Two Google OAuth client-secret JSON files were moved, without opening or changing them, from the unversioned umbrella directory to `C:\Users\evanp\.1ststep-private\oauth-quarantine\2026-09-10`; the unversioned root `.env` remains in place and was not opened.

## Independent repository inventory

Ahead/behind is shown against the configured upstream after `fetch --all --prune`, where available.

| Repository | Absolute path | Final branch / upstream | Final HEAD | Status | Ahead / behind | Stash | Decision |
|---|---|---|---|---|---:|---|---|
| Product source of truth | `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\1ststep-resume-deploy` | `codex/chrome-store-policy-update` / `origin/codex/chrome-store-policy-update` | `7a57fd7652e3` | dirty: 113 tracked, 62 untracked files | 15 / 0 upstream; 17 / 19 vs `origin/main` | empty | Preserve mixed work; do not commit as one unit. |
| Commission prototype | `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\comission-vercel` | `main` / `origin/main` | `50d5d9955f1e` | clean | 0 / 4 | empty | Not a release source for the requested surfaces; no pull because merging/updating was not approved. |
| 1stStep agency site | `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\main-website` | `codex/reconcile-agency-site-20260910` / none | `a0e7f107f829` | clean | 1 / 0 vs `origin/main` | empty | Preserved coherent tested work in a local branch; not pushed because a push may trigger deployment. |
| Job Agent social-video project | `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\instagram reels\job-agent-reels-20260904` | `main` / none | `6c2ff38e0b02` | dirty: 131 file-level entries | no remote | empty | Preserve mixed source, receipts, scripts, and 366 MB media; lint fails. |
| Release staging snapshot | `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\release-job-agent-20260907` | unborn `master` / none | none | dirty: 744 file-level entries | no remote or commit | empty | Preserve; uninitialized duplicate/candidate snapshot needs an owner-approved archive plan. |
| The Spot café | `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\TheSpot\site` | `main` / `origin/main` | `022a0a45feca` | dirty: 41 file-level entries | reported 0 / 0 | empty | Unrelated and explicitly out of scope; preserve. Tests pass. |
| Invalid umbrella marker | `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\.git` | none | none | empty `.git` directory; not a repository | n/a | n/a | Preserve until the owner decides whether the umbrella should become a real repo or the empty marker should be removed. |

The nested Git marker `C:\Users\evanp\Documents\Claude\Projects\1ststep.ai\1ststep-resume-deploy\unified-cross-site-preview-20260910\.git` is a registered worktree of the product repository, not an independent repository. No additional backend or package repository was found within four levels after excluding dependency/build directories.

### Recent commit purpose

- Product `main`: `8a6ba82` status-style cache refresh; `7ec3acc` accessibility/status navigation; `3605510` homepage security/cache; `adbb0a8` partner hardening; `1471693` resume onboarding focus; `44a2f42` resume landing alignment; `ce5be50` listings restore; `268b390` landing roast fixes.
- Commission local: `50d5d99` testimonials, `0ba9305` brand assets, `b2269bc` initial demo. The four unpulled remote commits only add LeanCTX/Copilot/Cursor/Claude harness documentation.
- Agency site: `a0e7f10` preserves the tested conversion, portfolio, booking, and revenue-systems work in this pass; prior `451dbd4` is the admin security/campaign baseline.
- Social-video repo: only `6c2ff38`, initial Remotion project; all later work remains uncommitted.
- The Spot: `022a0a4` mobile experience, then gallery/audio commits.

## Authoritative worktree inventory

Ahead/behind values are `HEAD...origin/main`. All clean worktrees were inspected and left unchanged.

| Worktree / branch | HEAD | Ahead / behind | Final status |
|---|---:|---:|---|
| primary — `codex/chrome-store-policy-update` | `7a57fd7` | 17 / 19 | dirty: 113 tracked, 62 untracked |
| temp consent clean — detached | `9add18a` | 18 / 19 | clean |
| temp consent deploy — detached | `d686aa5` | 18 / 19 | clean |
| temp consent release — detached | `9add18a` | 18 / 19 | clean |
| nested `codex/unified-cross-site-preview-20260910` | `de77157` | 1 / 2 | clean |
| `codex/admin-live-costs-20260907` | `6002259` | 51 / 19 | clean |
| `codex/affiliate-ledger-20260909` | `254a1bc` | 4 / 0 | clean |
| `codex/affiliate-public-ticker-20260909` | `724ce5d` | 2 / 0 | clean |
| `codex/app-partner-link-20260908` | `ff0e1a4` | 4 / 11 | clean |
| `codex/comprehensive-ux-audit-20260908` | `acad40b` | 3 / 15 | clean after local preservation commit |
| `deploy/user-feedback-current-20260908` | `ce2803b` | 3 / 12 | clean |
| `deploy/user-feedback-nonblocking-20260908` | `4b2dc3f` | 7 / 14 | clean |
| `codex/ecosystem-operating-system-20260910` | `f8e0a2d` before this update | 3 / 0 | clean before this update |
| `codex/finish-staged-candidate-20260907` | `1c5918c` | 60 / 19 | clean |
| `feature/extension-efficiency-controls` | `5c30d77` | 14 / 7 | clean; PR #72 |
| `codex/ja001-browser-harness-20260908` | `3f149e0` | 18 / 19 | clean |
| `codex/job-agent-operations-bridge-20260908` | `bb62b6c` | 1 / 18 | clean |
| `release/landing-cro-20260908` | `a9f75dc` | 3 / 18 | clean; merged PR #62 history |
| `codex/listings-showcase-20260908` | `cd9e860` | 3 / 14 | clean |
| `codex/main-job-agent-bridge-fix-20260908` | `4ba77dd` | 1 / 15 | clean; merged PR #63 history |
| `codex/mobile-shell-layout-20260908` | `a997160` | 19 / 19 | clean |
| `codex/career-profile-schema-20260908` | `3c81b91` | 18 / 5 | clean |
| `codex/neon-readiness-20260907` | `6421107` | 47 / 19 | clean |
| `feature/partners-affiliate-redesign` | `800bcae` | 12 / 11 | dirty: one tracked deletion |
| `codex/partners-hardening-20260909` | `800bcae` | 12 / 11 | clean after duplicate reconciliation |
| `codex/partners-hardening-main-20260909` | `2e16ec3` | 1 / 4 | clean; merged PR #75 history |
| production baseline — detached | `3268a6a` | 0 / 18 | clean |
| `codex/production-mainstay-admin-bridge-20260908` | `1748208` | 19 / 19 | clean |
| `release/login-pricing-reconciled-20260906` | `874cc05` | 48 / 19 | clean after generated Playwright output removal |
| `release/user-feedback-20260908` | `4b2dc3f` | 7 / 14 | clean after duplicate reconciliation |
| `codex/resume-clerk-consolidation-20260908` | `e2389f7` | 2 / 15 | clean |
| `codex/resume-focus-20260909` | `762ba0f` | 1 / 5 | clean; merged PR #74 history |
| `main` | `8a6ba82` | 0 / 0 | clean |
| `codex/trust-remediation-20260910` | `7f401e8` | 1 / 0 | clean |
| `codex/user-feedback-fixes-20260908` | `47d75a8` | 18 / 19 | clean |
| `codex/ux-theme-stack-20260907` | `b8d673e` | 68 / 19 | clean; draft PR #60 |
| `codex/fix-youtube-demo-20260908` | `61220f0` | 7 / 14 | clean |
| AgentTeam UI release — detached | `9c1565f` | 7 / 19 | clean |
| AgentTeam `693166dd/20c9b743` — detached | `deeb03e` | 9 / 7 | dirty: 6 tracked, 2 untracked |
| AgentTeam `d4cfc7a6/01aa8506` — detached | `f7c9067` | 9 / 19 | dirty: `vercel.json` |
| AgentTeam `d4cfc7a6/18a3d175` — detached | `7a57fd7` | 17 / 19 | dirty: 66 tracked, 96 untracked |
| AgentTeam `d4cfc7a6/39e2855e` — detached | `0c590a4` | 8 / 19 | dirty: `vercel.json`; generated npm cache removed |
| AgentTeam `d4cfc7a6/5189cf6d` — detached | `924cd75` | 2 / 19 | dirty: 15 tracked, 3 untracked |
| AgentTeam `d4cfc7a6/b80df5fc` — detached | `924cd75` | 2 / 19 | dirty: 19 tracked, 7 untracked |

## Local branch reconciliation

Git ancestry against `origin/main` was inspected for every local branch. Squash merges mean a merged branch can still appear divergent, so merged-PR evidence takes precedence over simple ancestry.

| Branch | HEAD | vs main | Reconciliation |
|---|---:|---:|---|
| `claude/landing-cro-20260907` | `351d495` | 69 / 19 | stale/diverged candidate; PR #62 later merged from release branch |
| `codex/admin-live-costs-20260907` | `6002259` | 51 / 19 | preserved historical candidate |
| `codex/affiliate-ledger-20260909` | `254a1bc` | 4 / 0 | clean current candidate, pushed |
| `codex/affiliate-public-ticker-20260909` | `724ce5d` | 2 / 0 | clean current candidate, pushed |
| `codex/app-partner-link-20260908` | `ff0e1a4` | 4 / 11 | divergent; upstream points to another branch, needs manual reconciliation |
| `codex/application-concierge-pilot` | `e92a89f` | 77 / 25 | merged PR #52 history plus later divergence |
| `codex/career-profile-schema-20260908` | `3c81b91` | 18 / 5 | active-looking candidate; runtime/database review remains gated |
| `codex/chrome-store-policy-update` | `7a57fd7` | 17 / 19 | local branch is 15 commits ahead of its remote and has mixed dirty state; draft PR #58 remote head differs |
| `codex/comprehensive-ux-audit-20260908` | `acad40b` | 3 / 15 | unique audit preserved in local commit; not pushed |
| `codex/ecosystem-operating-system-20260910` | `f8e0a2d` pre-update | 3 / 0 | PR #79, green at inspection |
| `codex/finish-staged-candidate-20260907` | `1c5918c` | 60 / 19 | draft PR #59 base chain; do not merge blindly |
| `codex/fix-youtube-demo-20260908` | `61220f0` | 7 / 14 | content already appears in merged PR #71 blobs; branch retained |
| `codex/ja001-browser-harness-20260908` | `3f149e0` | 18 / 19 | preserved test harness candidate |
| `codex/job-agent-operations-bridge-20260908` | `bb62b6c` | 1 / 18 | older bridge candidate |
| `codex/job-agent-twice-daily` | `620cd8f` | 1 / 24 | merged PR #53 history |
| `codex/listings-showcase-20260908` | `cd9e860` | 3 / 14 | restored later through merged PR #71 |
| `codex/main-job-agent-bridge-fix-20260908` | `4ba77dd` | 1 / 15 | merged PR #63 history |
| `codex/mobile-shell-layout-20260908` | `a997160` | 19 / 19 | stale/diverged UI candidate |
| `codex/mobile-shell-live-baseline-20260908` | `b98a82f` | 4 / 12 | stale/diverged UI candidate |
| `codex/neon-readiness-20260907` | `6421107` | 47 / 19 | historical runtime-evidence candidate; not production proof |
| `codex/partners-hardening-20260909` | `800bcae` | 12 / 11 | worktree cleaned; substantive hardening is in merged PR #75 |
| `codex/partners-hardening-main-20260909` | `2e16ec3` | 1 / 4 | merged PR #75 history |
| `codex/production-mainstay-admin-bridge-20260908` | `1748208` | 19 / 19 | historical deployment candidate |
| `codex/queue-draining-reviewed` | `0c590a4` | 8 / 19 | historical queue candidate |
| `codex/resume-clerk-consolidation-20260908` | `e2389f7` | 2 / 15 | candidate; auth/runtime proof still required |
| `codex/resume-focus-20260909` | `762ba0f` | 1 / 5 | merged PR #74 history |
| `codex/trust-remediation-20260910` | `7f401e8` | 1 / 0 | clean unmerged candidate |
| `codex/unified-cross-site-preview-20260910` | `de77157` | 1 / 2 | clean unmerged candidate |
| `codex/user-feedback-fixes-20260908` | `47d75a8` | 18 / 19 | stale/diverged UI candidate |
| `codex/ux-theme-stack-20260907` | `b8d673e` | 68 / 19 | open draft PR #60, unstable |
| `codex/wave0-prod-release-20260908` | `6b34cdf` | 3 / 11 | historical release-evidence branch |
| `codex/wave0-release-evidence-20260908` | `09bca84` | 6 / 12 | historical release-evidence branch |
| `deploy/user-feedback-current-20260908` | `ce2803b` | 3 / 12 | historical deployment candidate |
| `deploy/user-feedback-nonblocking-20260908` | `4b2dc3f` | 7 / 14 | historical candidate |
| `feature/extension-efficiency-controls` | `5c30d77` | 14 / 7 | PR #72; validated, behind main, not released |
| `feature/extension-universal-capture` | `530fd94` | 3 / 12 | merged PR #66 history |
| `feature/job-agent-time-saved-gauge` | `d00711f` | 1 / 11 | older unmerged candidate |
| `feature/partners-affiliate-redesign` | `800bcae` | 12 / 11 | dirty worktree contains a potentially harmful schema deletion; preserve |
| `main` | `8a6ba82` | 0 / 0 | current clean default branch |
| `release/landing-cro-20260908` | `a9f75dc` | 3 / 18 | merged PR #62 history |
| `release/login-pricing-reconciled-20260906` | `874cc05` | 48 / 19 | remote is three commits behind local; generated output cleaned |
| `release/production-baseline-20260907` | `86747a7` | 3 / 19 | merged PR #61 history |
| `release/resume-handoff-2026-09-06` | `354e50e` | 6 / 19 | historical candidate |
| `release/ui-2026-09-06` | `9ea75ab` | 5 / 19 | historical candidate |
| `release/user-feedback-20260908` | `4b2dc3f` | 7 / 14 | worktree cleaned; two local edits exactly match merged PR #71/#76 blobs |

Remote refs were fetched and pruned. Old remote branches remain because they back open PRs, merged-PR history, or unreviewed candidates; none was deleted.

## Open pull requests and overlap

| PR | State at inspection | Dirty-primary overlap | Decision |
|---|---|---:|---|
| #79 operating system | clean, 8 checks green | 1 file (`package.json`) | Keep; this reconciliation updates it. No merge without approval. |
| #72 extension v1.6 | behind, 8 checks green | 25 files | Selected release candidate. A merge-tree simulation against `origin/main` is conflict-free, but the branch is still seven commits behind. Update it only through an explicitly approved integration choice, then rerun the full gate; do not copy from primary. |
| #60 theme stack | draft, unstable | 23 files | Preserve; review against current main and close/supersede only with owner approval. |
| #59 staged candidate | draft, clean relative to its non-main base | 71 files | Major source of primary overlap; not a safe main merge. |
| #58 extension disclosures | draft, dirty merge state | 3 files | Remote head is `924cd75`, while local branch is 15 commits ahead and dirty. Superseded in part by #72; owner review needed. |
| #50 Stripe 22.3.2 | checks green | `package.json` | Dependency/payment boundary; separate review required. |
| #49 CodeQL analyze | one non-success check | 0 | Keep separate. |
| #48 CodeQL init | one non-success check | 0 | Keep separate. |
| #46 checkout 7 | checks green | 0 | Keep separate. |
| #44 older combined CodeQL bump | checks green | 0 | Likely superseded by #48/#49; no closure without approval. |
| #34 owner-access refresh | dirty merge state | 7 files | Old security/auth overlap; do not merge blindly. |
| #23 setup-node 6.4 | checks green | 0 | Keep separate. |
| #21 referral attribution | dirty merge state | 2 files | Old referral-contract overlap; do not merge blindly. |

No open PR exists in the commission, agency-site, or café GitHub repositories.

## Dirty-change decisions

Every remaining dirty path is covered below. Directory globs mean every file reported beneath that directory by `git status --porcelain --untracked-files=all`.

| Location and exact scope | Classification | Evidence and next action |
|---|---|---|
| Primary staged set: `.gitignore`; `api/{applicant-vault,application-packages,application-sessions,extension-application-handoff,job-agent-worker,subscription,user-session}.js`; `app.html`, `app.js`, `application-*.css`, `build-public-web.mjs`; `client/{application-control-center,application-execution-route,application-preparation,concierge-domain,draft-review}.js`; `concierge.*`; listed application/Clerk/background docs; `funnel.html`; application/background/discovery/run/session/vault libraries; `login.*`; package files; `partners-landing/*`; `persistent-concierge.css`; pricing/resume-landing files; application/Clerk/concierge/draft/browser/security tests; `terms.html`; `vercel.json` | Keep, but split/reconcile | 84 staged files mix application control, auth, partner, pricing, UI, and test work. They overlap PR #59 (71 paths), #60, #72, #34, #21, and #50. Smoke passes, but commit provenance and current-main conflict resolution are unresolved. Create clean branches from current main for one contract at a time; never commit this index wholesale. |
| Primary unstaged extension set: `1ststep-extension/{EXTENSION_STATUS,PERMISSION_JUSTIFICATIONS,PRIVACY_POLICY_EXTENSION_SECTION,README,STORE_LISTING,auth-bridge,background,manifest,popup.*,sidepanel.*}` plus `job-capture.js`; extension build/security/handoff/browser tests and `lib/controlled-extension-release.js` | Keep, blocked | Candidate manifest is v1.4.0 and conflicts with store v1.3.2, main v1.5.0, and PR #72 v1.6.0. Reconcile only through the validated PR #72 source after owner release selection. |
| Primary unstaged webhook/auth set: `api/{stripe-webhook,subscription,tally-webhook}.js`, `lib/{bounded-raw-request-body,tally-webhook-idempotency,user-session-store}.js`, webhook/replay/restore tests | Keep, split | Valid-looking security/idempotency work, but it touches billing/webhook/auth boundaries and lacks a focused branch and full targeted validation in this pass. |
| Primary unstaged UI/public set: `.vercelignore`, `app.js`, application CSS/routes, `build-public-web.mjs`, `concierge.*`, `funnel.html`, `home.css`, `index.html`, `login.css`, `persistent-concierge.css`, `pricing.html`, `robots.txt`, `sitemap.xml`, `style.css`, `og-1ststep-ai.png`, `llms.txt`, `where-to-find-1ststep-ai/**` and related browser tests | Keep, split | Mixed UX/SEO/release work overlaps current main and open PRs. Public pricing/security/deployment files require separate review. |
| Primary package-identity set: `docs/PACKAGE_IDENTITY_2026-09-07.md`, `lib/application-package-identity.js`, package identity Lua/JS tests/support, application package test edits | Keep, split | Unique uncommitted identity/idempotency work; preserve until rebased into one focused branch and tested. |
| Primary `1ststep-extension/graphify-out/**` | Preserve generated analysis | Confirmed Graphify output (37 files, about 308 KB). It is useful audit evidence but should be ignored rather than committed. |
| Primary `unified-cross-site-preview-20260910/` | Preserve worktree | Registered nested worktree, not a product artifact. Never add it to the parent repository. |
| `partners-affiliate-redesign-20260908`: `resume-tailor-landing/ghl-visual-journey-custom-code.html` | Preserve, potentially harmful | Uncommitted deletion removes 53 lines of structured-data normalization. No evidence shows the deletion is intended; do not commit or discard until compared with live GHL custom code and current main. |
| AgentTeam `693166dd/20c9b743`: extension permission/store docs, policy bundle, `privacy.html`, `terms.html`, privacy drift test, Chrome data-use form, v1.6 review packet | Keep, blocked by owner legal/store review | Focused candidate passes the privacy drift test. It changes public legal/store disclosures and must not be published without approval. Preserve current detached worktree or attach it to a named review branch after confirming ownership. |
| AgentTeam `01aa8506` and `39e2855e`: identical `vercel.json` changes | Keep one candidate, blocked by CSP approval | Adds Google Analytics/DoubleClick connect sources to CSP. Security-header changes require explicit approval. Both copies remain because their active ownership is unknown; consolidate only after ownership confirmation. |
| AgentTeam `18a3d175`: 66 tracked and 96 untracked files | Preserve mixed duplicate/candidate | 148 of 162 overlapping files are byte-identical to the dirty primary; 14 differ. This is recovery evidence, not a safe independent commit. Select the authoritative copy before any cleanup. |
| AgentTeam `5189cf6d`: discovery/capacity/legal/UI changes and three untracked tests/docs | Preserve earlier variant | All 18 paths are contained in `b80df5fc`; 14 are byte-identical there and 4 differ. Do not discard until the later variant is reviewed and committed. |
| AgentTeam `b80df5fc`: the prior 18-path set plus app/style/public-feed files and tests | Preserve later variant | Likely extends the earlier capacity/public-feed work, but it is based on `924cd75`, 19 main commits behind, and touches policy/legal/CSP. Needs a clean current-main branch and focused tests. |
| Social-video repo: modified `package.json`, `src/Root.tsx`; new production scripts, receipts/ledgers, `REEL-STANDARDS.md`, source components, `src/connected-batch-20260909/**`, `.playwright-cli/**`, and `public/**` | Preserve; split before commit | Source, publication evidence, browser output, and 366 MB of media are mixed. Lint fails at `src/ZeelyStory.tsx:12` for an unused `outcome`; no remote exists. Separate source from reproducible media and immutable receipt evidence, fix lint, then commit locally. |
| Release staging snapshot: all 744 staged/untracked file entries | Preserve; archive decision required | No valid HEAD or remote. It duplicates much of the product tree but may contain unique evidence. Hash/diff against current main and dirty primary before recoverable archive; never initialize or delete blindly. |
| The Spot dirty set: README/page/worker/package/tests, deleted auth/database/Drizzle/example files, and new security/docs | Preserve out of scope | Unrelated coffee-site work. Build and three tests pass. No mutation was authorized for this product. |

## Changes safely reconciled in this pass

| Worktree | Action | Why no valid work was lost |
|---|---|---|
| `partners-hardening-20260909` | Restored two tracked files and removed eight untracked paths | Every substantive current blob exactly exists in merged PR #75/current history; the only unique blob was a duplicate `.vercel` ignore line. |
| `release-user-feedback-20260908` | Restored `llms.txt` and `where-to-find-1ststep-ai/index.html` | Both current blobs exactly exist in merged PR #71/#76 history. |
| `release-login-pricing-20260906` | Removed `.playwright-cli/` | Two generated Playwright snapshot/log files, 24,007 bytes total; no product source. |
| AgentTeam `39e2855e` | Removed `.queue-npm-cache/` | npm debug/update cache only, 61,862 bytes; `vercel.json` candidate remains untouched. |
| `comprehensive-ux-audit-20260908` | Created local commit `acad40b` | Preserved 18 unique audit documents on their focused existing branch. Not pushed. |
| `main-website` | Created local branch and commit `a0e7f10` | Preserved 11-file tested agency-site conversion/revenue-systems work. Not pushed. |
| Umbrella OAuth files | Moved two unversioned Google OAuth JSON files into `C:\Users\evanp\.1ststep-private\oauth-quarantine\2026-09-10` | Recoverable quarantine by exact path; byte sizes and SHA-256 digests were recorded without reading or printing credential contents. No credential was rotated or revoked. |
| PR #72 controlled artifact | Rebuilt ignored `dist/1ststep-job-agent-extension-v1.6.0.zip` | Deterministic build produced 11 files, 50,407 bytes, and the exact supplied SHA-256. The source worktree remained clean. |

No stash was created or consumed. No branch or remote ref was deleted.

## Environment, generated artifacts, and deployment configuration

- Tracked environment templates: `.env.example` only. They contain names/documentation and were not treated as secrets.
- Ignored real environment files were observed by metadata only, including `.env.local` and `.vercel/.env.*.local` in several worktrees. Their values were never opened or printed. Ignore rules cover `.env*.local` and `.vercel`.
- Important ignored build/runtime paths in the clean main worktree: `.public-web/`, `.vercel/`, `node_modules/`, `partners-landing/.vercel/`, `resume-tailor-landing/standalone/.vercel/`, and `test-results/`.
- Unversioned umbrella risk remaining: root `.env` (399 bytes), which was left in place and unopened because `.env*` files must not be deleted or moved without a confirmed consumer plan. The two Google OAuth client-secret JSON files (405 and 406 bytes) are now quarantined outside the workspace. Their recorded SHA-256 digests are `566CBBAFF88A1F9D1B89E0F996F422D089E5FB5B884F5C10142DA039666611E0` and `BF8AFDFCC248A7A660A772AA83972063B9DF46E8E536F207512F0269EF230C03`; these identify files without exposing their contents. Rotation/revocation remains an owner-approved external action.
- Vercel mappings are `1ststep-resume` for app/API, `1ststep-resume-landing` for resume, and `1ststep-growth-finder` for partners. The three custom domains return HTTP 200 and Ready deployment state.
- Current production deployment IDs: app `dpl_EN3RYuPEvEkTGfMQPvWwXWTSFxHR`, resume `dpl_2UC7e3oFPiwLC4JJCz1mUV9r2DDb`, partners `dpl_3qctMKn1Cm7jT77gLGSGZwe9oZQr`. Their metadata has no Git SHA/ref, so exact release/source parity is unknown.

## Validation results

| Target | Command | Result |
|---|---|---|
| clean `origin/main` worktree | `npm run smoke` | pass, 6 allowlisted inline-handler warnings |
| clean `origin/main` worktree | `npm run build` | pass, 82 intentional public assets |
| clean `origin/main` worktree | `npm run test:extension-release` | pass, 17 browser tests; first parallel attempt hit port 4175 in use, isolated rerun passed |
| PR #72 at `5c30d77` | `npm run smoke` | pass, 6 allowlisted warnings |
| PR #72 at `5c30d77` | `npm run build` | pass, 70 public assets |
| PR #72 at `5c30d77` | `npm run test:extension-release` | pass, persistence/replay/isolation/verification/promotion gates plus 23 browser tests |
| PR #72 at `5c30d77` | `npm run release:gate` | pass: web, extension, production-readiness, database-evidence, capacity, rollback, preview-log, CI-policy, AI-use, source-inventory, and release-preflight gates |
| PR #72 at `5c30d77` | `npm run build:extension:controlled` | pass; v1.6.0 ZIP, 11 files, 50,407 bytes, SHA-256 `72491347f92a416d76d0e81f097aa0516d277587bfa304fadb20c22d42f44fff`, no candidate values |
| dirty primary | `npm run smoke` | pass; not evidence that mixed changes are releasable |
| legal/store detached candidate | `node scripts/privacy-policy-drift-test.mjs` | pass |
| partner hardening before duplicate cleanup | `node scripts/partner-site-hardening-test.mjs` | pass |
| agency site before local commit | `npm run check` | pass: 89 tests and Vite production build |
| social-video repo | `npm run lint` | fail: unused `outcome` in `src/ZeelyStory.tsx:12`; build not run after lint failure |
| The Spot | `npm test` | pass: Vinext build and 3 tests; route classification warning remains |
| commission prototype | none available | no `package.json`; repository is clean but four documentation commits behind upstream |

The authoritative package provides no standalone `lint` or `typecheck` script, so those checks are unavailable rather than passing. The social-video project does provide ESLint and TypeScript through `npm run lint`, and that combined check failed as recorded.

## Release readiness and exact next actions

1. **PR #72 is the selected v1.6 candidate, but do not release it yet.** Its current head and artifact are verified. Choose an explicit branch-integration option to reconcile its seven-commit drift from clean `origin/main`, then rerun `release:gate` and rebuild/checksum the artifact on the integrated head. Merge, force-push, deployment, and Web Store publication still require explicit approval.
2. **Do not commit the primary checkout wholesale.** Assign ownership to the five primary bundles above, recreate each from current `origin/main`, compare against the relevant open PR, and preserve only the non-duplicated patch.
3. **Resolve legal/CSP candidates separately.** Owner approval is required before changing public privacy/terms/store disclosures or CSP. Select one of the duplicate CSP worktrees and one legal review branch.
4. **Prove deployment parity.** The three Vercel deployments are Ready but not bound to visible Git SHAs. Before any promotion, verify exact source/assets against the intended commit and protected runtime evidence. Current production database/encryption/worker/tenant health remains unknown.
5. **Complete secret handling.** The two Google OAuth files are quarantined; identify every consumer and rotate/revoke the credentials only with explicit approval. Preserve the root `.env` until its consumers are known. Then decide whether the empty umbrella `.git` marker should be removed or initialized deliberately.
6. **Review local preservation commits.** `acad40b` and `a0e7f10` are local only. Push them only if preview/deployment side effects are explicitly acceptable.
7. **Triage stale PRs and branches.** Close/supersede old PRs only after confirming no unique patch remains. No branch deletion is required for product correctness, but the current branch/worktree sprawl makes release mistakes materially more likely.
8. **Run the remaining real user-flow proof.** From the integrated v1.6 candidate, complete one extension capture through authenticated `app.1ststep.ai` into My Jobs and verify persisted state after reload. Sending an OTP or signing into the user account requires a separate explicit request; no OTP was sent during this pass.

## Ponytail hygiene finding

The dominant avoidable complexity is repository-state duplication, not a safely removable code abstraction: the same extension/application patch exists in the primary checkout and detached recovery worktrees while multiple stale PR chains overlap it. No speculative source cleanup was applied.

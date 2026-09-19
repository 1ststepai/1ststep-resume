# Product-family reconciliation — 2026-09-18

Scope: `app.1ststep.ai`, `resume.1ststep.ai`, `partners.1ststep.ai`. Executor: Claude Code. Every claim below was checked against Git, Vercel, the live sites, or a test run on the named SHA. Source inspection alone is labeled as such.

## 1. Inventory

| Field | app.1ststep.ai | resume.1ststep.ai | partners.1ststep.ai |
|---|---|---|---|
| Repository / remote | `1ststepai/1ststep-resume` (public) | same | same |
| Source path | repo root | `resume-tailor-landing/standalone/` | `partners-landing/` |
| Vercel project | `1ststep-resume` (Git-linked) | `1ststep-resume-landing` (CLI) | `1ststep-growth-finder` (CLI) |
| Authoritative branch | `claude/job-agent-integrated-rc-20260918` (pending accept); security authority R3 `cfa483c` | same RC | same RC |
| Tested SHA | RC (see §6) | RC | RC |
| Deployed SHA | `7412af1` (CLI, 2026-09-15, `dpl_229cmvzCQvh3hvcXZuKBPf9EwCyy`) | `7412af1` (CLI, 2026-09-15, `dpl_6pb5ERtApySGNdQapLcqRHforj2o`) | `7ec3acc` (CLI, 2026-09-10, `dpl_3qctMKn1Cm7jT77gLGSGZwe9oZQr`) |
| `origin/main` | `d64e174` — behind Production | same | ahead of partners deploy |

Deployed SHAs come from Vercel deployment metadata (`gitCommitSha`, `source: cli`). A CLI deploy does not prove the tree was clean.

Open PRs (2026-09-18): #86 (frozen), #85 learning evidence (draft), #81 listings, #80 v1.6 consolidation (superseded by RC lineage), #79 ecosystem OS, #72 extension v1.6 (superseded: its capture work is in the R3 lineage), #60/#59/#58 drafts (superseded), #34 and #21 (May, stale; #21 referral attribution superseded by `lib/partner-account.js` + RC module), 6 Dependabot PRs (unreviewed).

## 2. Dirty work and local-only commits — preserved

The worktrees were not entered or modified. Each dirty tree was snapshotted through a temporary git index and pushed. Secret scan over every patch: only synthetic test fixtures matched.

| Worktree | Classification | Preserved as |
|---|---|---|
| `.worktrees/owner-reviewed-controlled-beta-20260917` | INTENTIONAL UX + RELEASE (all but `.gitignore` and one retro already in `e1f6362`/`afcd973`) | `preserve/release-worktree-20260918` |
| `.worktrees/controlled-beta-legal-review-20260917` | DOCUMENTATION (legal drafts, not counsel-approved) + post-beta EXTENSION of answer memory | `preserve/legal-review-worktree-20260918` |
| `.worktrees/aud029-login-headers-20260916` | INTENTIONAL RELEASE (login headers; partly in PR #86) | `preserve/aud029-login-headers-worktree-20260918` |
| `.worktrees/release-consolidated-job-agent-v1.6-20260910` | SUPERSEDED release attempt | `preserve/v16-worktree-20260918` |
| `background-continuation-20260910` | INTENTIONAL (schedule store) — unreviewed | `preserve/background-continuation-worktree-20260918` |
| `.worktrees/job-agent-engineering-os-20260912` | DOCUMENTATION (audit findings) | `preserve/engineering-os-worktree-20260918` |
| `partners-affiliate-redesign-20260908` | LANDING (GHL custom code) | `preserve/partners-affiliate-worktree-20260918` |
| `1ststep-publish-clean` | LANDING (listings page) | `preserve/publish-clean-worktree-20260918` |
| `1ststep-resume-deploy` (main checkout, `codex/chrome-store-policy-update`) | EXTENSION + mixed older release work; `graphify-out/` GENERATED (excluded); nested repo `unified-cross-site-preview-20260910` excluded | `preserve/chrome-store-main-checkout-20260918` |
| `release-job-agent-20260907` | UNKNOWN — separate broken `.git` (no HEAD), 2026-09-06 | not preserved; owner review |

33 local-only branches pushed as `preserve/local/<branch>`. `SECRET — NEVER COMMIT`: `.env*` are git-ignored and were not read.

## 3. Findings

### P0 — fixed in the RC

- **P0-A Consent/résumé-authority bypass in the final UX candidate (`cdab3c9`).** R3 required a fresh human source review for every package (`if (automatic) return null`). UX removed it, fabricated `{ accepted: true, baseResumeSha256, verifiedFactsHash }` for automatic runs and for manual clicks whenever consent was active, and auto-selected a base résumé with `reviewed: true` before preparing. Fixed in `695578f`: R3 guard restored, source review always shown, auto-prepare removed, base-résumé auto-select limited to right after an explicit résumé save and never replacing a selection. Contract test added.

### P1

| ID | Finding | Status |
|---|---|---|
| P1-A | Partner click attribution lost: partner links land on `app.1ststep.ai/?ref=…`, which never stored the code; the only attribution call needed `?ref` on `/concierge` *and* an existing session. | Fixed in RC (`client/referral-attribution.js`, cross-surface browser test). Not deployed. |
| P1-B | `resume.1ststep.ai` drops `ref`/UTM on every CTA; primary CTA led to `/app` (résumé workspace) with a competing Job Agent text link. | Fixed in RC. Needs CLI redeploy. |
| P1-C | `partners.1ststep.ai` live is stale `7ec3acc`: anonymous "Create my partner link" generator instead of the approval-only application (server still rejects unapproved codes, so no attribution integrity breach). | Source already correct; needs redeploy. |
| P1-D | Partial discovery told users "no match, try a different type of job". | Fixed in RC. |
| P1-E | Dark-mode contrast: waitlist/hero inputs 1.05:1, résumé-choice helper text ~1.4:1. | Fixed in RC. |
| P1-F | UX candidate shipped red: 13 browser failures, a unit failure (tests for launch-access code not in the branch), missing `test:theme-contrast` script, unpinned extension digest, stale HANDOFF format. | Fixed in RC. |
| P1-G | Production is CLI-deployed from a feature branch; `origin/main` is behind Production. | Open (NEXT-ACTIONS P1-4). |
| P1-H | Denied-user message said "this preview's invite list" (wrong on Production). | Fixed in RC. |
| P1-I | No email capture on `resume.1ststep.ai`; no first-party funnel events there. | By decision: capture lives on `app.1ststep.ai`; open question for owner. |
| P1-J | 8 Playwright specs hard-coded port 4175, silently testing whatever else listens there. | Fixed in RC. |

### P2
See NEXT-ACTIONS backlog.

## 4. Journey audit (Phase 7) — verification level stated

| Screen | Purpose | Primary action | Evidence |
|---|---|---|---|
| `app.1ststep.ai/` | Explain Job Agent, capture lead | Start My Job Agent — Free (Production); email then Start (RC) | Live browser 390px + RC Playwright landing-conversion |
| `/login.html` | Clerk sign-in/up | Continue | RC Playwright (Clerk-ready/disabled paths) |
| `/concierge` signed-out | Gate | Start my Job Agent (→ sign-in/access) | Live browser 390px |
| Setup: résumé → path → work → review | Tell the agent who I am | Choose résumé; Continue disabled until chosen | RC Playwright trust-remediation |
| Saved Info | What Job Agent knows; which résumé it uses | Choose résumé | RC Playwright vault suite |
| Discovery | Find jobs | Named states ("Checking job requirements"); one next action | RC unit + browser |
| My Jobs | Operational workspace | Prepare application (source review) | RC Playwright |
| Needs You | Questions blocking progress | Answer | RC Playwright |
| Review | Human review of package | Review draft; nothing sent | RC Playwright |

Signed-in Production journey was **not** browser-verified: it requires a real account and credentials, which the executor may not create or enter. It is the purpose of the one-user E2E gate.

## 5. Chrome extension (Phase 11)

Source `1ststep-extension/`, MV3 v1.6.0, permissions `storage, activeTab, scripting, contextMenus`, hosts `*.greenhouse.io` and `app.1ststep.ai` only (no broadening). Popup: "Save to Job Agent" → "Open in Job Agent" (single contextual action). RC: `test:extension-release` PASS (23 browser incl. Greenhouse detection/capture/handoff), `test:extension-unpacked` PASS (real MV3 worker, restart persistence, wrong-ID ACK rejection), controlled build PASS (11 files, no candidate values, no-submit). Store listing not re-verified; version bump needed before upload.

## 6. Test evidence on the RC

Filled in by the final run on code tip `50473c6`: see `TEST RESULTS` in HANDOFF.md and the table below.

| Suite | Result |
|---|---|
| pretest:concierge (policy bundle, sherlock review of 47 routes, spend/storage boundaries) | PASS |
| test:concierge | PASS |
| test:application-candidate (incl. partner account/API/surface, referral attribution) | PASS |
| test:homepage (incl. waitlist, resume standalone) | PASS |
| test:resilience, test:continuous-improvement | PASS |
| test:deployment-output, build:web | PASS |
| R3 ceiling + owner-reviewed policy, security-regression, pilot-access, entitlement | PASS |
| agent handoff protocol | PASS |
| Extension release + unpacked + build | PASS |
| Playwright (16 specs, 130 tests) | 126 PASS; 3 fail identically on pure R3 (signed-out setup fixtures); 1 order-dependent flake (vault guided launch, passes alone) |

## 7. Duplication / dead code (Phase 14)

| Item | Class |
|---|---|
| `app.html` + `app.js` résumé workspace at `/app` | KEEP FOR COMPATIBILITY (existing users; its referral capture writes the same key) |
| `resume-tailor-landing/ghl-*.html` | KEEP FOR COMPATIBILITY until GHL pages are confirmed retired (UNKNOWN usage) |
| `resume-tailor-landing/DEPLOY_INSTRUCTIONS.md` ($49 done-for-you service, formsubmit) | DEPRECATE (describes a retired product) |
| `docs/CLAUDE.md` multi-ATS extension doc | DEPRECATE (already marked superseded) |
| Anonymous partner link generator (live only) | REMOVE NOW by redeploying partners |
| PRs #80, #72, #60, #59, #58, #21 | DEPRECATE (superseded; close after owner confirms) |
| `preserve/*` branches | KEEP (archives) |
| `release-job-agent-20260907/` broken repo | UNKNOWN |

## 8. Data / auth / privacy (Phase 15) — source inspection unless stated

Clerk sign-in is same-origin on `app.1ststep.ai` with opaque server sessions (`requireOpaqueSession`). Referral codes live in `localStorage` on the app origin only (no cookies, no cross-site tracking); attribution records are keyed by an HMAC of the subject. Waitlist stores email/name/consent keyed by HMAC(email) in Upstash, no TTL (P2-3). Funnel events are aggregate daily counters with no identifiers and reject application content. Partner account records are envelope-encrypted. Tenant allowlist and 5-user cap unchanged (tests PASS). Submission and employer transmission remain disabled.

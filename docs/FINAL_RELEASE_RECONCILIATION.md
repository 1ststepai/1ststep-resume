# Final release reconciliation — 2026-09-10

## Decision

`release/consolidated-job-agent-v1.6-20260910` is the sole assembled release candidate. It starts at clean `origin/main` `8a6ba82`, integrates the verified Chrome extension v1.6 source from PR #72, the focused Job Agent trust remediation, the operating-system/reconciliation documentation from PR #79, and a newly implemented isolated partner-role workflow. It excludes the older incomplete partner preview, database migration, broad UX, stale PR, detached recovery, and mixed dirty-primary work.

This branch is source- and local-test-ready, but **not production-release-ready**. Production lacks 89 required environment variable names across controlled-beta, private storage/scanning, cost, evidence, support, assisted-application, and final-submission controls. The consolidated branch also lacks the branch-scoped Preview configuration needed for an authenticated extension-to-My-Jobs test. No production deployment, Chrome Web Store publication, database migration, provider activation, pricing change, or OAuth credential change is authorized by this document.

## Evidence sources and access limits

| Source | Evidence used | Access/result |
|---|---|---|
| Local Git repositories and registered worktrees | Fresh fetch/status/log/ref/merge-base inspection; exhaustive inventory and dirty-path decisions in `docs/REPOSITORY_RECONCILIATION.md` | Accessible. 6 independent repositories plus the invalid empty umbrella `.git` marker; 44 registered product worktrees before this new isolated release worktree. |
| GitHub | Open PR metadata, merge state, checks, branch heads | Accessible through `gh`. Replacement release PR [#80](https://github.com/1ststepai/1ststep-resume/pull/80) is open and mergeable. Its deterministic 13-layer gate, CodeQL, static QA, dependency audit, and Vercel checks passed on the runtime/report head and the subsequent evidence-only refresh. The exact current head and checks must be read from GitHub before merge. PR #72 and PR #79 remain intentionally separate and must not also be merged. |
| Codex task history | 20 recent 1stStep task threads, their final reports, and key intermediate evidence | Accessible for the latest bounded task listing. Older/unlisted conversations are not guaranteed accessible and are therefore not claimed reviewed. |
| Local documentation and artifacts | 1,561 candidate README/roadmap/architecture/audit/handoff/report files; 271 unique contents after hashing and 1,290 duplicate worktree copies | Key unique current release documents and relevant handoffs were reviewed. Duplicate copies were not reread as independent evidence. |
| Vercel | Project/deployment metadata, aliases, status, environment **names only**, and public asset bytes | Accessible. Runtime-bearing Preview deployment `dpl_Awsa9tA7AwJpJbpDrVbsUNSiXzZP` is Ready and GitHub deployment `6373675875` binds it to implementation commit `76fd986`. Evidence-only Preview `dpl_ENPNfyLyg57LUixMpKvhTTHUeFfd` is Ready/Staged and binds to reconciliation commit `442e228`; its clean `/concierge` route, JavaScript, and CSS are byte-identical to that candidate. Direct `/concierge.html` appends only Vercel's 163-byte feedback script. Secret values were neither requested nor printed. The current Production deployment was created through Vercel CLI from commit `5b1ba79` on `codex/fazier-badge-20260910`; its complete Git tree is byte-identical to clean baseline `8a6ba82`, so baseline parity is proven while parity with unmerged PR #80 is expectedly false. |
| Live public sites | Content-free requests, Vercel CLI provenance, and public asset hashes for `app.1ststep.ai`, `resume.1ststep.ai`, and `partners.1ststep.ai` | All returned HTTP 200 on 2026-09-10. App matches clean baseline tree `8a6ba82`; resume root matches `resume-tailor-landing/standalone/index.html` at `44a2f42` and PR #80; partner root/CSS/JS match `partners-landing` at `7ec3acc`, while PR #80 intentionally contains the unreleased replacement partner bundle. Authenticated behavior remains unproven. |
| Chrome Web Store | Prior audit evidence and current repository release metadata | Published store state remains v1.3.2 per the preceding reconciliation. No publication action occurred. |
| Secrets | File metadata/hashes, ignore policy, environment names | Two unversioned Google OAuth JSON files remain quarantined outside the workspace. Values were not opened. Root `.env` values were not printed. Rotation/revocation state is unknown. |
| Runtime databases/providers | Source contracts and content-free test harnesses | Live Redis data, PostgreSQL migration/RLS state, storage/scanner behavior, provider behavior, tenant data, and recovery evidence were not accessed; they remain unknown. |

## Chronological reconciliation

1. Clean `origin/main` `8a6ba82` was re-established as the only baseline and passed the complete local release gate.
2. PR #72 head `5c30d77` was verified as extension v1.6.0 source. Its deterministic 11-file ZIP reproduced SHA-256 `72491347f92a416d76d0e81f097aa0516d277587bfa304fadb20c22d42f44fff`.
3. PR #72 was merged into this isolated branch with merge commit `2c360e5`; no existing worktree was reset or overwritten.
4. Trust-remediation source `7f401e8` was integrated as `bce8eb9`. The single conflict preserved both the v1.6 evidence-based time-saved gauge and the accessible My Jobs tab hint.
5. PR #79's five operating/reconciliation commits were cherry-picked as `65b6651`, `e7b1b50`, `3390842`, `e38d5d6`, and `d30d07b`.
6. A partial static security scan of exact PR #72 head reported four browser issues: model-output DOM XSS, a portable browser bearer token, persistent resume PII, and CSV formula injection.
7. Commit `2eb61a1` fixed those four boundaries and added source regression checks. The client now relies on the HttpOnly session instead of storing/transmitting the legacy bearer, excludes authentication from backups, keeps resume content session-scoped, renders model output as text nodes, and neutralizes spreadsheet formula prefixes.
8. Commits `c019c1c` and `042bae1` reconciled the trust-gated onboarding/contrast tests and current stylesheet contract. All 25 relevant browser contrast tests passed.
9. The complete release gate passed at `042bae1`; production build, extension build, dependency audit, and environment-name audit were then run.

## Product contract and best source mapping

| Contract/feature | Best verified source | Release decision | Remaining proof |
|---|---|---|---|
| Job Agent is the primary application workflow | `origin/main` plus trust commit `7f401e8` | Included | Authenticated Preview journey required. |
| Capture once from extension into My Jobs | PR #72 `5c30d77` | Included | Real installed-extension capture must produce durable 201/readback on the exact Preview. |
| Refresh/sign-out/sign-in persistence | PR #72 durable capture store plus trust branch authenticated workflow hydration | Included | Live Preview persistence test not yet possible. |
| Idempotent capture/replay and tenant isolation | PR #72 captured-job store/API/tests | Included | Local deterministic tests pass; live two-tenant evidence remains unavailable. |
| Honest failures and no fabricated completion | `origin/main`, PR #72, trust remediation | Included | Preview must show an explicit blocked/error state when consent/runtime is unavailable. |
| Onboarding/profile/resume continuity | Trust branch `7f401e8`; encrypted applicant-vault source in main | Included | Live sign-out/sign-in readback required; legacy resume page local profile storage remains a separate browser boundary. |
| Only confirmed applicant facts | Main application-session/vault contracts plus trust remediation | Included | Provider/runtime evidence remains gated. |
| No unsupported autonomous submission | Main defaults and v1.6 extension contract | Included; extension is no-submit | Production environment name audit confirms final-submission enablement names are absent, but values and equivalent overrides are not runtime-verified. |
| Evidence-backed time saved | PR #72 ancestry (`d00711f`) | Included | Browser test passes; figures remain labeled estimates based on completed events. |
| Cross-site copy/pricing/legal | Current main plus PR #72 disclosures and PR #79 operating docs | Included only where merged here | External counsel sign-off and live cross-domain parity remain outstanding. |
| Partner isolation | New focused partner role built on current release contracts | Included in candidate | `de77157` remained excluded. The replacement uses the existing Clerk-to-opaque-session boundary, explicit existing-user or affiliate-only consent, encrypted isolated Redis records, administrator-only approval, approved-only attribution, self-referral rejection, and account export/deletion. It creates no Job Agent data or entitlement and activates no payout. Production auth/runtime/mobile proof remains required. |
| Canonical PostgreSQL career profile | `codex/career-profile-schema-20260908` | Excluded | Independent review, isolated migration/RLS runtime evidence, and production authorization are required. |

## Conflicts, stale work, and missing evidence

- PR #72 is superseded as a direct merge target by this consolidated branch; its exact v1.6 source remains traceable in the merge ancestry.
- PR #79 documentation is integrated here; PR #79 should not be merged independently after this branch because that would duplicate/split the release narrative.
- `codex/unified-cross-site-preview-20260910`, `codex/comprehensive-ux-audit-20260908`, `codex/career-profile-schema-20260908`, PRs #58/#59/#60, and the dirty primary checkout are preserved but excluded. Their unique work is not discarded.
- The mixed primary checkout remains intentionally dirty and must not be committed wholesale. Exact dirty-path decisions are maintained in `docs/REPOSITORY_RECONCILIATION.md`.
- During final verification, two Vercel CLI Production deployments replaced the prior app deployment. `dpl_AFReDSp4WKAuGCYjR1BDJtkE4ca8` at 2026-09-10T14:17:55Z records Codex actor commit `87eb60a` (`Add Fazier launch badge`) on `codex/fazier-badge-20260910`. Current `dpl_2XSwQvgnCjhNWv5a3shXPDQRLbXe` at 2026-09-10T14:25:28Z records commit `5b1ba79` (`Remove unavailable Fazier launch badge`) on the same branch. Both were created by the `1ststepdotai` Vercel account; this release task did not create or promote them.
- Commits `87eb60a` and `5b1ba79` add and then exactly remove one external Fazier badge line. Current commit `5b1ba79` and baseline `8a6ba82` resolve to the same complete tree `6f403f3b1e7936d97cf17765ecf4f1d5972e6678`; current Production therefore matches the declared clean baseline exactly. Its Job Agent asset hashes also match that baseline. Production does not yet match PR #80 because PR #80 remains intentionally unmerged and undeployed.
- Resume Production `dpl_2UC7e3oFPiwLC4JJCz1mUV9r2DDb` records Vercel CLI/Codex commit `44a2f42` on `main`; its 42,699-byte root exactly matches `resume-tailor-landing/standalone/index.html` at that commit and PR #80 (SHA-256 `bc8bfa32a4522c7f2572d7d8e65d85043c3c4e9cf4afda171a527bdb1cfe6763`). Partner Production `dpl_3qctMKn1Cm7jT77gLGSGZwe9oZQr` records Vercel CLI/Codex commit `7ec3acc` on `main`; its root, CSS, and JavaScript exactly match that commit. PR #80's replacement partner bundle is source-verified in Preview but not deployed to `partners.1ststep.ai`.
- The production environment-name audit observed 82 names, with only 37 of 126 required release names present. Missing controls include private object storage/malware scanning, explicit consent enforcement, scheduling, cost approvals, controlled-beta gates, audit archive/evidence, support ownership, document rendering, assisted Greenhouse activation, and all final-submission activation names.
- The release branch has zero branch-specific Preview overrides. The earlier 62-unique-name count combined generic Preview variables with variables restricted to other Git branches and therefore did not prove availability to PR #80. A branch-resolved, one-use environment pull for `release/consolidated-job-agent-v1.6-20260910` was evaluated only through content-free shape checks and then deleted. Its names include generic Redis, rate-limit, tier, and email-delivery configuration; Vercel redacts sensitive values during pull, so Redis/rate validity remains unknown rather than failed. Clerk variables are restricted to `codex/affiliate-ledger-20260909`; encryption and audit variables are restricted to other branches; no `JOB_AGENT_RECEIPT_SECRET` entry was found. PR #72 still has only five branch overrides and lacks the receipt secret, so copying PR #72 cannot close the gate. No secret value was printed or persisted. On three application-equivalent Previews—`dpl_3ZhHMrqY5sK69t3aJhXisAHpwDYn` at `1a8dfe5`, `dpl_5ka3ESoTPaxventdyh6bXSvNQt8F` at docs-only `9362ad1`, and `dpl_GMJxTKNAhtr9BhnEftg9eqMsYwmV` at docs-only `119e4e0`—public `/api/app-config` returned `authentication.clerk.enabled: false`, a null publishable key, and `restoreAccessAvailable: false`. The Preview accepts its deployment URL and alias as origins and correctly returns `AUTH_REQUIRED` without authentication, so origin allowlisting is not the blocker. PR #80 requires deliberate isolated Clerk, encryption, audit, and receipt configuration plus authenticated runtime proof.
- The prior Preview E2E reached an authenticated session but stopped because Job Agent data consent was inactive. It did not prove captured-job persistence or replay.
- PostgreSQL migration/RLS, live Redis isolation, private storage/scanning, provider retention/egress, recovery drills, notification delivery, and support ownership are unknown rather than clean.
- The two quarantined Google OAuth client files are not referenced by the current product source found in this audit. Exposure was not proven, but rotation/revocation has not been verified.

## Validation results

| Check | Result |
|---|---|
| `npm ci` | Pass; 179 packages; initial audit found 0 vulnerabilities. |
| Clean-main `npm run release:gate` | Pass at `8a6ba82`. |
| Consolidated `npm run release:gate` | Pass at `042bae1`; includes web, 12 theme tests, 25 workspace contrast tests, Job Agent domain/security suites, smoke, deployment-output boundary, 23 extension browser tests, production-readiness, database-evidence contracts, capacity, rollback, Preview-log, CI-policy, AI-use, source-inventory, and release-preflight gates. |
| `npm run build` | Pass; 82 intentional public assets. |
| `npm run build:extension:controlled` | Pass; v1.6.0, 11 files, 50,407 bytes, exact SHA-256 `72491347f92a416d76d0e81f097aa0516d277587bfa304fadb20c22d42f44fff`, no candidate values. |
| `npm audit --omit=dev --audit-level=high` | Pass; 0 vulnerabilities. |
| Static security scan | Four inherited PR #72 findings were remediated in `2eb61a1`. Two later browser-storage trust paths were remediated in `fc5e385` and `d42ffb8`. Focused regression tests pass, and Sonar's PR quality API reported Security Rating A with no open vulnerability returned for implementation head `76fd986`. Live/runtime security remains unverified. |
| TypeScript / ESLint | Unavailable in the authoritative package: no standalone `typecheck` or `lint` script. This is not recorded as a pass. |
| Production environment-name audit | Fail for release readiness: 89 of 126 required names absent; values not validated. |
| Preview environment audit | PR #80 branch-specific scope has zero overrides. A branch-resolved pull confirmed generic Redis/rate/tier and email-delivery names, but sensitive values were redacted and are not claimed valid. Clerk, encryption, audit, and receipt configuration are unavailable to this branch; `JOB_AGENT_RECEIPT_SECRET` has no observed entry. Three application-equivalent runtime probes report Clerk and restore access unavailable. Temporary files were deleted and no value was printed. |
| Public domains | HTTP 200 for app, resume, and partners. App baseline, resume source, and partner baseline bundle parity are proven. The live Job Agent safety-boundary probe passed (public routes 200 with CSP; private APIs 401). App and partner intentionally differ from unmerged PR #80; authenticated behavior remains untested. |
| PR #80 CI | Implementation head `76fd986` passed the complete local release gate. GitHub deterministic gate, CodeQL, static QA, dependency audit, and Vercel Preview were green; Sonar's direct PR quality result was A. Recheck the evidence-only documentation head before merge. |
| Release Preview | Application-equivalent Previews `dpl_3ZhHMrqY5sK69t3aJhXisAHpwDYn` at `1a8dfe5` and `dpl_5ka3ESoTPaxventdyh6bXSvNQt8F` at docs-only `9362ad1` are Ready; all configured checks passed on both heads. Authenticated Vercel curl proved `/`, `/concierge`, and `/api/health/live` return 200, protected APIs fail closed, and candidate public asset hashes match after excluding Vercel's direct-HTML feedback-script injection. Both observed `/api/app-config` responses report Clerk disabled and restore access unavailable, so authenticated Clerk/partner/My Jobs persistence cannot yet be executed or claimed. |
| Partner mobile and Preview | Pass locally at rendered 390x844 and 412x915 viewports: explicit affiliate-only state visible, all visible controls have at least a 44px hit target, and document width does not exceed viewport. Exact Preview `/partner`, `partner.js`, and `partner.css` bytes match the candidate; direct `partner.html` differs only by Vercel's appended feedback script. `/api/partner` rejects an unauthenticated request with 401. Authenticated onboarding remains unverified. |

## Release commits and source of truth

The replacement release PR is [#80](https://github.com/1ststepai/1ststep-resume/pull/80), this branch against `origin/main`. The meaningful release commits are:

- `2c360e5` — merge verified extension v1.6 source (contains PR #72 ancestry)
- `bce8eb9` — Job Agent trust and reliability gates
- `65b6651` through `d30d07b` — operating system, contract enforcement, capture evidence, and repository reconciliation
- `2eb61a1` — browser security boundary remediation
- `c019c1c` and `042bae1` — integration/accessibility contract reconciliation
- the commit containing this document — final release evidence and blocker record

After review, this branch—not PR #72, PR #79, the dirty primary checkout, a detached worktree, or a Vercel deployment—is the proposed Git source of truth. Production and Chrome Web Store source of truth remain unchanged until separately proven and approved.

## Exact next actions and approvals

1. Review PR #80 as the single replacement release PR. Do not merge PR #72 or PR #79 separately afterward.
2. With owner approval, provision the isolated PR #80 Preview secrets (`BETA_DATA_ENCRYPTION_KEY`, `BETA_DATA_ENCRYPTION_KEY_ID`, `JOB_AGENT_AUDIT_SECRET`, `JOB_AGENT_RECEIPT_SECRET`, `RATE_LIMIT_HASH_SECRET`, and `TIER_SECRET`), and map an approved Clerk Preview configuration without printing, rotating, or silently broadening existing branch-scoped credentials. Redeploy and re-run the content-free gate. Do not merely copy PR #72: its five overrides are incomplete and omit `JOB_AGENT_RECEIPT_SECRET`. Preserve other branches' configuration until the replacement Preview passes and cleanup is separately approved.
3. On the resulting exact-head Preview, bind the extension ZIP asset hash and run: installed extension v1.6 capture → authenticated app → active consent → durable My Jobs readback → refresh → sign out → sign in → readback → duplicate capture replay. A one-time sign-in code and active account consent require owner participation.
4. Obtain live two-tenant isolation evidence and verify required Redis/encryption/audit configuration without exposing values.
5. Resolve all production environment-name gaps appropriate to the selected controlled-beta scope and produce signed launch/recovery/support evidence. Keep final-submission/provider execution disabled unless separately approved.
6. Coordinate against the identified `codex/fazier-badge-20260910` CLI deployment path so Production does not move during the release window. Current Production is back on the exact clean-baseline tree; do not roll it back or promote PR #80 until steps 2–5 pass and the exact approved candidate is re-verified immediately before promotion.
7. Before Chrome Web Store publication, verify the exact v1.6 ZIP digest, manifest permissions, disclosure/legal packet, installed behavior, and final authenticated E2E. Store publication remains a separate approval.
8. Identify the Google OAuth projects/consumers and decide whether to rotate/revoke the quarantined clients. No release should claim those credentials rotated until Google confirms it.

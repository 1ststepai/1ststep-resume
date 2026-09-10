# Final release reconciliation — 2026-09-10

## Decision

`release/consolidated-job-agent-v1.6-20260910` is the sole assembled release candidate. It starts at clean `origin/main` `8a6ba82`, integrates the verified Chrome extension v1.6 source from PR #72, the focused Job Agent trust remediation, and the operating-system/reconciliation documentation from PR #79. It excludes incomplete partner-preview, database-migration, broad UX, stale PR, detached recovery, and mixed dirty-primary work.

This branch is source- and local-test-ready, but **not production-release-ready**. Production lacks 89 required environment variable names across controlled-beta, private storage/scanning, cost, evidence, support, assisted-application, and final-submission controls. The consolidated branch also lacks the branch-scoped Preview configuration needed for an authenticated extension-to-My-Jobs test. No production deployment, Chrome Web Store publication, database migration, provider activation, pricing change, or OAuth credential change is authorized by this document.

## Evidence sources and access limits

| Source | Evidence used | Access/result |
|---|---|---|
| Local Git repositories and registered worktrees | Fresh fetch/status/log/ref/merge-base inspection; exhaustive inventory and dirty-path decisions in `docs/REPOSITORY_RECONCILIATION.md` | Accessible. 6 independent repositories plus the invalid empty umbrella `.git` marker; 44 registered product worktrees before this new isolated release worktree. |
| GitHub | Open PR metadata, merge state, checks, branch heads | Accessible through `gh`. Replacement release PR [#80](https://github.com/1ststepai/1ststep-resume/pull/80) is open and mergeable at `2be4174`; its deterministic 13-layer gate, CodeQL, static QA, dependency audit, and Vercel checks passed. PR #72 and PR #79 remain intentionally separate and must not also be merged. |
| Codex task history | 20 recent 1stStep task threads, their final reports, and key intermediate evidence | Accessible for the latest bounded task listing. Older/unlisted conversations are not guaranteed accessible and are therefore not claimed reviewed. |
| Local documentation and artifacts | 1,561 candidate README/roadmap/architecture/audit/handoff/report files; 271 unique contents after hashing and 1,290 duplicate worktree copies | Key unique current release documents and relevant handoffs were reviewed. Duplicate copies were not reread as independent evidence. |
| Vercel | Project/deployment metadata, aliases, status, and environment **names only** | Accessible. Preview deployment `dpl_E7h1ghMHF31tqAFFQN7Tfn1iF6M9` is Ready and GitHub deployment `6371383461` binds it to exact release HEAD `2be4174`. Its root, `/job-agent`, and `/partners.html` returned HTTP 200. Secret values were neither requested nor printed. Exact Git SHA for the current production deployment remains unavailable. |
| Live public sites | HEAD requests to `app.1ststep.ai`, `resume.1ststep.ai`, and `partners.1ststep.ai` | All returned HTTP 200 on 2026-09-10; this proves reachability, not source parity or authenticated behavior. |
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
| Partner isolation | Merged main partner hardening | Included through baseline | `de77157` unified partner preview excluded because Clerk/Apple/admin approval was incomplete. |
| Canonical PostgreSQL career profile | `codex/career-profile-schema-20260908` | Excluded | Independent review, isolated migration/RLS runtime evidence, and production authorization are required. |

## Conflicts, stale work, and missing evidence

- PR #72 is superseded as a direct merge target by this consolidated branch; its exact v1.6 source remains traceable in the merge ancestry.
- PR #79 documentation is integrated here; PR #79 should not be merged independently after this branch because that would duplicate/split the release narrative.
- `codex/unified-cross-site-preview-20260910`, `codex/comprehensive-ux-audit-20260908`, `codex/career-profile-schema-20260908`, PRs #58/#59/#60, and the dirty primary checkout are preserved but excluded. Their unique work is not discarded.
- The mixed primary checkout remains intentionally dirty and must not be committed wholesale. Exact dirty-path decisions are maintained in `docs/REPOSITORY_RECONCILIATION.md`.
- Current production deployment `dpl_EN3RYuPEvEkTGfMQPvWwXWTSFxHR` is Ready and serves `app.1ststep.ai`, but Vercel did not expose a Git commit SHA. Production source parity is unknown.
- The production environment-name audit observed 82 names, with only 37 of 126 required release names present. Missing controls include private object storage/malware scanning, explicit consent enforcement, scheduling, cost approvals, controlled-beta gates, audit archive/evidence, support ownership, document rendering, assisted Greenhouse activation, and all final-submission activation names.
- The new release branch does not inherit PR #72's branch-scoped Preview `JOB_AGENT_AUDIT_SECRET` and encryption variables. A real authenticated Preview gate would fail closed until configuration is deliberately mapped.
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
| Static security scan | Partial repository coverage; 4 findings on PR #72, all remediated in `2eb61a1` and covered by regression assertions. Live/runtime security remains unverified. |
| TypeScript / ESLint | Unavailable in the authoritative package: no standalone `typecheck` or `lint` script. This is not recorded as a pass. |
| Production environment-name audit | Fail for release readiness: 89 of 126 required names absent; values not validated. |
| Public domains | HTTP 200 for app, resume, and partners; authenticated and source-parity proof still missing. |
| PR #80 CI | Pass at `2be4174`: deterministic 13-layer gate, CodeQL, static QA, production dependency audit, and Vercel checks. |
| Exact release Preview | Ready: `dpl_E7h1ghMHF31tqAFFQN7Tfn1iF6M9`, bound through GitHub deployment `6371383461` to `2be4174`; public root, Job Agent, and partners routes returned HTTP 200. Authenticated persistence is still untested. |

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
2. Deliberately configure the consolidated branch's Preview environment by copying the approved **names/secret references** from the verified PR #72 Preview scope; do not print or replace values. This environment mutation requires owner approval.
3. On exact Ready Preview `dpl_E7h1ghMHF31tqAFFQN7Tfn1iF6M9`, bind the extension ZIP asset hash and run: installed extension v1.6 capture → authenticated app → active consent → durable My Jobs readback → refresh → sign out → sign in → readback → duplicate capture replay. A one-time sign-in code and active account consent require owner participation.
4. Obtain live two-tenant isolation evidence and verify required Redis/encryption/audit configuration without exposing values.
5. Resolve all production environment-name gaps appropriate to the selected controlled-beta scope and produce signed launch/recovery/support evidence. Keep final-submission/provider execution disabled unless separately approved.
6. Verify the exact production deployment source before any promotion. Production deployment remains blocked until steps 2–5 pass.
7. Before Chrome Web Store publication, verify the exact v1.6 ZIP digest, manifest permissions, disclosure/legal packet, installed behavior, and final authenticated E2E. Store publication remains a separate approval.
8. Identify the Google OAuth projects/consumers and decide whether to rotate/revoke the quarantined clients. No release should claim those credentials rotated until Google confirms it.

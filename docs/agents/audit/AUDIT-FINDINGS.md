# Durable independent audit findings

Cycle 0 source: C:\Users\evanp\Documents\Claude\Audits\1ststep.ai\2026-09-12-job-agent-audit-baseline.md (SHA-256 936EE4FAFFDAD2914D3161568C563134335CCACA72AA59F597F95F1C680F6344). The report is a September 12 snapshot. The later independent Cycle 1 and Cycle 2 reports and hashes are indexed in `AUDIT-STATE.md`; AUD-017..028 below preserve their findings without advancing the scoped main or partial PR #80 anchors. The Orchestrator's reconciliation did **not** rerun signed-user, installed-extension, or hosted-data tests. First-observed commits below mean first *observed in evidence*, not proven introducing commits. Statuses are OPEN, MITIGATED, RESOLVED, SUPERSEDED, or NEEDS REVERIFICATION. MITIGATED and NEEDS REVERIFICATION remain unresolved; no build agent or green check can close an ID.

| ID | Severity | Product area / Agent OS area | Status | Limited beta | Production |
| --- | --- | --- | --- | --- | --- |
| AUD-001 | HIGH | Canonical capture / Capture + Persistence | OPEN | BLOCKS | BLOCKS |
| AUD-002 | HIGH | Clerk/session / Auth + Persistence | NEEDS REVERIFICATION | BLOCKS | BLOCKS |
| AUD-003 | HIGH | Deployment provenance / Release Candidate | OPEN | BLOCKS | BLOCKS |
| AUD-004 | HIGH | Tenant data / Identity & Data, Security | OPEN | BLOCKS | BLOCKS |
| AUD-005 | HIGH | Résumé authority / Truth Verification | OPEN | BLOCKS | BLOCKS |
| AUD-006 | HIGH | Extension compatibility / Extension Reliability, Release | OPEN | BLOCKS | BLOCKS |
| AUD-007 | MEDIUM | Fact confirmation / Application Content & Truth, Security | OPEN | NO (as scoped in Cycle 0) | BLOCKS autonomous/full claim |
| AUD-008 | MEDIUM | Partner attribution / Partner | OPEN | NO for job-seeker-only beta | BLOCKS partner launch/claims |
| AUD-009 | MEDIUM | Local/stale governance / Orchestrator | MITIGATED | NO direct block | Release packet must reconcile |
| AUD-010 | MEDIUM | Dirty worktrees / Release Manager, Orchestrator | OPEN | Release source must be clean | BLOCKS |
| AUD-011 | MEDIUM | Google OAuth rotation / Security, owner | OPEN | UNKNOWN scope | BLOCKS review |
| AUD-012 | MEDIUM | Test evidence quality / QA + Regression | OPEN | Blocks proof where hosted tests required | Blocks proof |
| AUD-013 | LOW | Capture replay metrics / Analytics + Capture | OPEN | NO direct block | Accurate claims required |
| AUD-014 | LOW | Reverted secret-using diagnostic / Security, Release | MITIGATED | NO direct block | Verify exposure/disposition |
| AUD-015 | LOW | Sonar check/comment mismatch / QA, Release | NEEDS REVERIFICATION | NO direct block | Reconcile signal |
| AUD-016 | LOW | Legacy "applied" versus receipt-only SUBMITTED / Truth + Receipt | OPEN | No conflated claims | No conflated claims |
| AUD-017 | MEDIUM | Unattributable Clerk-enabled Preview / Release + Identity | OPEN | BLOCKS | BLOCKS |
| AUD-018 | MEDIUM | Dirty release worktree / Release + résumé truth | MITIGATED | Clean source required | BLOCKS |
| AUD-019 | MEDIUM | Paid-tier browser/API mismatch / Entitlement | OPEN | Free-only beta conditional | BLOCKS PR #80 deploy |
| AUD-020 | LOW | ATS capability matrix/copy drift / Extension + public claims | OPEN | NO direct block | Claims review |
| AUD-021 | MEDIUM | Real résumé fact keys bypass conflict detector / Truth | OPEN | BLOCKS via narrative gate | BLOCKS |
| AUD-022 | MEDIUM | Unselected legacy browser résumé package input / Truth | OPEN | BLOCKS | BLOCKS |
| AUD-023 | LOW | Revision skips new fact reconciliation / Truth | OPEN | NO direct block | BLOCKS truth claim |
| AUD-024 | MEDIUM | Hard-filter browser-suite regression / QA | NEEDS REVERIFICATION | BLOCKS integration | BLOCKS |
| AUD-025 | MEDIUM | Obsolete Clerk sign-in fixture and coverage gap / Auth + QA | OPEN | BLOCKS auth acceptance | BLOCKS |
| AUD-026 | LOW | My Jobs recovery copy and historical binding / My Jobs | OPEN | NO direct block | Copy/edge review |
| AUD-027 | LOW | Onboarding browser-test flake / QA | OPEN | Green accounting only | Green accounting |
| AUD-028 | LOW | Incomplete remote-negation coverage / Job filters | OPEN | Conditional Remote-only block | BLOCKS affected claim |

No Critical finding was proven. All 28 IDs remain visible and unresolved pending their specified evidence. AUD-018 is only partially mitigated: isolated RESUME-001 did not adopt the dirty WIP, but the stale release worktree remains. AUD-024's engineering-only assertion correction is not independent closure. A field marked UNKNOWN is not a pass.

## AUD-001 — distinct captures of one requisition produce two records

- First observed / latest affected: PR #80 b071371 / b071371; introducing commit UNKNOWN. Evidence: lib/captured-job-store.js keys and Lua replay on tenant + captureId, api/captured-jobs.js creates discovery run by captureId, and scripts/captured-job-store-test.mjs replays only one ID against fake Redis. These source paths were rechecked at b071371.
- What evidence proves / root cause: replay of one capture ID is idempotent; distinct IDs have no canonical employer-requisition lookup and can create separate records/runs. Identity is client capture ID rather than a tenant-scoped job key; hosted outcome remains untested.
- Recommended remediation / regression: Job Intelligence primary with ATS Adapter/Capture and Identity & Data review; canonical provider + board + requisition (safe URL fallback) key, attach distinct captures; test two IDs -> one job/run for one tenant and separate record for another tenant.
- Preview/live verification: YES, two independent supported captures/readback; hosted-data verification: YES, Redis. Blocks task: Capture + Persistence YES; beta YES; Production YES. Resolution evidence: NONE.

## AUD-002 — signed Clerk/session path unproven

- First observed / latest affected: prior auth work 27ebef3..89cbd01 and diagnostic e945c6f/revert b071371; current candidate b071371 and newer associated CLI Preview dpl_Ck18EzsPGxb7YKwNiP2pkioDQdg5. Cycle 0 saw older Preview dpl_7THZ77Nc6QjZdxBoC8qwF2pywYmU with clerk.enabled false; it still returns false. Current newer Preview returns true, while Production app-config remains false. Vercel metadata for the newer Preview lacks Git SHA; GitHub associates its URL with b071371.
- What evidence proves / root cause: client readiness has changed on a newer Preview; it does **not** establish exact artifact parity, instance match, sign-in, server exchange, cookie, refresh, logout denial or second sign-in. Exact cause of the older false state and current downstream behavior are UNKNOWN; do not assert a missing variable or mismatched instance as proven.
- Recommended remediation / regression: Identity & Data owns first divergence on a proven exact-head Preview; no Clerk/Vercel mutation without owner approval. Test app-config predicates, controlled sign-in, exchange, authenticated cross-user denial, refresh, navigation, logout invalidation and second login.
- Preview/live verification: YES; hosted-data verification: YES for Redis sessions. Blocks task: Auth + Persistence/Greenhouse capture YES; beta YES; Production YES. Resolution evidence: NONE; status NEEDS REVERIFICATION because readiness changed, not because the chain passed.

## AUD-003 — Production deployment source not constrained to reviewed main

- First observed / latest affected: Cycle 0 cited 5b1ba79, 87eb60a, 44a2f42, 7ec3acc and a Production-linked uncommitted directory; current Production dpl_7o8qo9zVKRy8A7DXUdR6AiQpsaM3 records d64e174, source cli, gitDirty=1. Several linked/dirty directories remain. Source metadata and local status were rechecked.
- What evidence proves / root cause: a Git SHA label does not prove clean artifact parity, and CLI deploys have come from feature/unversioned checkouts. The operational deployment path and rollback baseline are not constrained to clean reviewed main.
- Recommended remediation / regression: Release Manager proposes one Git-main-only controlled path, clean-tree/branch/SHA preflight and disposition of linked directories; Production restrictions and unlink/retire actions need owner approval. Test pre-deploy guard on dirty, wrong branch and stale SHA.
- Preview/live verification: Production metadata YES; hosted-data verification: NO. Blocks task: release YES; beta YES; Production YES. Resolution evidence: NONE.

## AUD-004 — hosted tenant isolation and persistence unproven

- First observed / latest affected: Cycle 0 at b071371 / b071371; lib/postgres-tenant-store.js is used for identity upsert, while captured-job/vault persistence is Redis-backed. RLS evidence was disposable/synthetic; no hosted two-tenant denial or backup/restore proof was supplied.
- What evidence proves / root cause: source tenant key partitioning and fake Redis tests do not establish hosted authorization, durability or cross-session behavior. Postgres activation was deferred; exact configured data targets remain UNKNOWN.
- Recommended remediation / regression: Identity & Data primary, Security review; owner decides Redis-versus-Postgres beta architecture before any migration. Exercise two real isolated test tenants against non-Production hosted storage for write/read/list/delete denial, persistence and restore.
- Preview/live verification: YES; hosted-data verification: YES. Blocks task: Auth + Persistence/data YES; beta YES; Production YES. Resolution evidence: NONE.

## AUD-005 — canonical résumé authority undecided

- First observed / latest affected: Cycle 0 at b071371 / b071371; app.js sessionStorage résumé and handoff, concierge state, vault master-resume and excluded Career Profile schema coexist. Current PR source still contains the legacy handoff; complete precedence was not re-audited.
- What evidence proves / root cause: multiple representations have no established authoritative precedence/version pin through a generated package and receipt. The desired verified-facts -> base version -> package chain remains unproven.
- Recommended remediation / regression: Product Owner/Orchestrator chooses authority and precedence on Application Content & Truth advice; do not merge/migrate Career Profile by inference. Test one pinned vault document version, active confirmed facts, conflicts, reload/export/delete and unsupported-claim denial.
- Preview/live verification: YES; hosted-data verification: YES if cross-session/Postgres claims. Blocks task: Truth Verification YES; beta YES; Production YES. Resolution evidence: NONE.

## AUD-006 — extension source/Store compatibility unproven

- First observed / latest affected: Cycle 0 compared Store 1.3.2 (dated listing), main d64e174 manifest 1.5.0 and PR b071371 manifest 1.6.0; both manifest versions and absence of api/captured-jobs.js on main were rechecked. Installed package and Store listing were not rechecked; ZIP digest not independently reproduced.
- What evidence proves / root cause: source version drift and a new RC capture API exist; compatibility of installed 1.3.2 with either app is UNKNOWN, not a proven universal break.
- Recommended remediation / regression: Chrome Extension primary with Release Manager; matrix for Store 1.3.2 vs Production/RC and candidate 1.6.0 vs RC, independent package digest, compatible bridge or owner-approved update policy. Test installed packages against exact Preview.
- Preview/live verification: YES; hosted-data verification: NO. Blocks task: release YES; beta if extension included YES; Production if claimed YES. Resolution evidence: NONE.

## AUD-007 — bulk parsed facts marked user-confirmed

- First observed / latest affected: b071371 / b071371. Rechecked client/concierge-domain.js confirmReadinessDraft setting every proposal user-confirmed/autoReuse, and lib/applicant-vault-domain.js accepting client verificationState/provenance; consequential facts force autoReuse false.
- What evidence proves / root cause: a bulk client assertion can become server-accepted confirmation without a per-fact server event. It does not prove any specific false fact was reused.
- Recommended remediation / regression: Application Content & Truth primary, Security review; per-material-fact action and server-assigned provenance/confirmation evidence. Reject user-confirmed without the bound event; retain consequential-field protection.
- Preview/live verification: YES; hosted-data verification: NO for source rule, YES for persistence claim. Blocks task: fact-truth work YES; beta NO per Cycle 0 scope; Production/autonomous claim YES. Resolution evidence: NONE.

## AUD-008 — partner public link/attribution gap

- First observed / latest affected: live partner bundle at 7ec3acc / PR b071371 partner backend. Cycle 0 observed browser-only localStorage link creation without approval and advertised planned attribution; PR lib/partner-account.js was rechecked: approved-only recordPartnerAttribution uses Redis SET nx with no TTL, not anonymous click capture. Current public bundle was not re-read.
- What evidence proves / root cause: live claim and RC capture mechanism differ; no proven click -> signup attribution or 60-day expiry. Payout/commission copy was honestly marked planned in Cycle 0.
- Recommended remediation / regression: Partner primary; owner approval before changing Production copy or link availability. Decide honest non-operational messaging and approval-gated attribution; test click/signup, expiry, reassignment and isolation.
- Preview/live verification: YES, partner public site and authenticated Preview; hosted-data verification: YES for attribution store. Blocks task: partner launch YES; job-seeker beta NO; Production partner claims YES. Resolution evidence: NONE.

## AUD-009 — Agent OS local-only/stale governance

- First observed / latest affected: local 8898dbd / local 4025a022 (then this ingestion). Cycle 0 said audit directory absent; it now exists on the unpushed Agent OS branch. CURRENT_STATE.md named old PR #80 SHA 89cbd017; this ingestion corrects that dated lead to b071371. AGENTS.md versus autonomy roadmap decision and older release pointers remain.
- What evidence proves / root cause: local documentation was added after audit, mitigating absence, but remote discoverability/current-state and policy decisions are unresolved. A push/PR is not authorized by this ingestion.
- Recommended remediation / regression: Orchestrator owns dated current-state reconciliation and separate docs-only review; owner decides policy conflict. Verify remote docs and release packet references before marking resolved.
- Preview/live verification: N/A; hosted-data verification: NO. Blocks task: NO direct block; beta/Production packets cannot rely on stale docs. Resolution evidence: NONE; MITIGATED locally only.

## AUD-010 — dirty and possibly unowned worktrees

- First observed / latest affected: Cycle 0 local inventory / current local inventory, no source commit. Main clone 139 dirty entries, stale local RC 6, background continuation 5, unversioned release-job-agent 520 staged, publish-clean 2; AgentTeam ownership/disposition was not fully rechecked.
- What evidence proves / root cause: many mutable/linked checkouts coexist, creating accidental-release risk; why they exist and who owns each are UNKNOWN. This is not authority to delete, unlink or overwrite them.
- Recommended remediation / regression: Release Manager/Orchestrator inventories exact ownership and linked project, quarantines release inputs by policy; no destructive cleanup without owner approval. Verify clean exact candidate preflight.
- Preview/live verification: release provenance only; hosted-data verification: NO. Blocks task: clean release source YES; beta release/Production YES. Resolution evidence: NONE.

## AUD-011 — Google OAuth rotation unresolved

- First observed / latest affected: Cycle 0 RC documentation / UNKNOWN current provider state. Two quarantined client files were reported; revocation/rotation was not checked in Google console.
- What evidence proves / root cause: repository quarantine does not prove provider-side invalidation; whether credentials remain valid is UNKNOWN, not a proven leak.
- Recommended remediation / regression: Security with credential owner; content-free provider verification and documented rotation/revocation decision, no secret values in audit. Negative use of retired client only if safe/authorized.
- Preview/live verification: provider console; hosted-data verification: NO. Blocks task: Production security review YES; beta scope UNKNOWN until owner assesses exposure. Resolution evidence: NONE.

## AUD-012 — source-shape/fake-store tests overstate runtime proof

- First observed / latest affected: Cycle 0 at b071371 / b071371. Captured-job test was rechecked: only same-ID replay and fake Redis; report cites fake partner/vault/receipt tests, regex/drift gates and no lint/typecheck. CI green was dated evidence, not rerun here.
- What evidence proves / root cause: deterministic domain contracts exist, but they do not prove installed extension, real Redis isolation, signed sessions, Preview persistence or employer receipt. Test architecture lacks those hosted layers.
- Recommended remediation / regression: QA/Regression maps each finding to focused negative, real-store and exact-Preview evidence; retain deterministic tests and add executable integration/browser proof.
- Preview/live verification: YES where product claim requires it; hosted-data verification: YES for tenant/persistence. Blocks task/beta/Production: blocks acceptance of affected proofs, not an independent launch permission. Resolution evidence: NONE.

## AUD-013 — replay can double-count capture metrics

- First observed / latest affected: b071371 / b071371. api/captured-jobs.js records extension_capture_saved after saveCapturedJob regardless of replay status, and employer verification happens before save; rechecked source.
- What evidence proves / root cause: a same-ID replay can emit a second saved event despite one stored capture; downstream time-saved estimates risk inflation. No actual metric count was inspected.
- Recommended remediation / regression: Analytics/Learning with ATS Adapter/Capture; emit completed-once metric keyed to canonical event, test replay and distinct capture behavior.
- Preview/live verification: YES for reported metrics; hosted-data verification: NO for local counter test. Blocks task/beta: NO direct release block; Production claims require accurate events. Resolution evidence: NONE.

## AUD-014 — secret-using Preview diagnostic was put on RC branch

- First observed / latest affected: e945c6f / reverted at b071371. Cycle 0 saw a secret-using, boolean-output Clerk diagnostic deployed on the release branch; current PR head has the revert. Exposure or credential compromise is NOT proven.
- What evidence proves / root cause: diagnostic placement caused RC Preview builds and mixed candidate scope; endpoint removal mitigates current source exposure, not historical review.
- Recommended remediation / regression: Security/Release restrict diagnostic experiments to a non-RC branch and verify route absent from exact candidate/deployment; decide any credential action only from proven exposure.
- Preview/live verification: YES for route absence if claiming closure; hosted-data verification: NO. Blocks task/beta/Production: no direct block while removed; security review if exposure found. Resolution evidence: NONE; MITIGATED, not independently RESOLVED.

## AUD-015 — Sonar rollup and bot comment conflict

- First observed / latest affected: PR b071371 Cycle 0 / UNKNOWN current check state. Rollup showed SUCCESS while bot comment said the last analysis failed; this reconciliation did not resolve timing or job identity.
- What evidence proves / root cause: inconsistent signals, not necessarily a failing current check; root cause UNKNOWN.
- Recommended remediation / regression: QA/Release compare exact run IDs, timestamps, analysis URL and check conclusion before relying on Sonar for release.
- Preview/live verification: N/A; hosted-data verification: NO. Blocks task/beta/Production: no direct block but cannot count contradictory signal as proof. Resolution evidence: NONE; NEEDS REVERIFICATION.

## AUD-016 — legacy "applied" differs from receipt-only SUBMITTED

- First observed / latest affected: Cycle 0 PR b071371 / b071371. Legacy quickLogApplied records a user click as applied, while Job Agent recordAuthoritativeApplicationReceipt requires consumed approval, attempt and authoritative evidence before SUBMITTED; receipt function was rechecked.
- What evidence proves / root cause: two valid but different meanings can be conflated in totals or public claims; no actual merged count was proven wrong.
- Recommended remediation / regression: Application Content & Truth with Exception & Receipt; label legacy self-reported tracking separately and test that submitted totals use only verified receipts.
- Preview/live verification: YES for claims/counts; hosted-data verification: YES if aggregate store involved. Blocks task/beta/Production: any conflated submission claim, not all development. Resolution evidence: NONE.

## Cycle 1 findings — independently reported; not closed

- **AUD-017 (MEDIUM, OPEN; AUTH-001/Release):** GitHub associated Clerk-enabled Preview `dpl_Ck18EzsPGxb7YKwNiP2pkioDQdg5` with PR #80 `b071371`, but Vercel metadata called it a CLI deployment without a source Git SHA. The protected artifact cannot be attributed to the committed candidate. The stale local release checkout at `89cbd01` has six uncommitted entries; possible contamination is not proven. Require a clean exact-SHA Git-sourced Preview/deployment record and then signed-session proof. Blocks AUD-002, beta and Production. No Clerk configuration change is authorized by this finding.
- **AUD-018 (MEDIUM, MITIGATED only):** The release-candidate checkout contains uncommitted trust-boundary work in `client/resume-reconciliation.js`, `concierge.js` and related build/test files over stale `89cbd01`. The isolated RESUME-001 commit `12a2c369` did not adopt that uncommitted module, partially superseding the contamination concern, but the six-entry dirty release checkout still must not be integration or deployment input. Preserve its work; use a new clean worktree at the remote head. No deletion/reset authorized. Blocks clean-source release proof until independently reverified.
- **AUD-019 (MEDIUM, OPEN; paid access):** At PR `b071371`, browser `app.js` no longer sends `tierToken`, while `api/claude.js` still derives paid access only from a valid email-bound HMAC token, independently of session authentication. Source therefore routes RC browser AI calls to the free tier; actual paid-user impact remains UNKNOWN. Product Owner must choose a session-bound verified entitlement or safe short-lived proof before deployment beyond a free-only isolated Preview; paid/free API and hosted entitlement tests required. Blocks PR #80 Production as-is and any paid beta. Do not change payment/Production configuration by inference.
- **AUD-020 (LOW, OPEN; ATS claims):** `lib/ats-application-capabilities.js` marks provider submission disabled but has no runtime importer at `b071371`; Store/live Greenhouse fill claims may differ from this documentation-only matrix. Installed package behavior is UNKNOWN. Either enforce the matrix or label it non-authoritative, and reconcile public copy against installed extension evidence before claiming capabilities. No direct beta block.

## Cycle 2 findings — independent local scope, hosted proof outstanding

- **AUD-021 (MEDIUM, OPEN; RESUME-001):** `12a2c369` material-conflict detector `lib/resume-package-reconciliation.js` keys on synthetic `jobTitle/employer/degree/school/certification/metric`, while actual producers emit `employment/education/skills/licenses` and other fields. The synthetic test does not prove real conflicts; `MATERIAL_FACT_MISMATCH` cannot fire for app-created facts. Fix detection against real producer keys or remove that assurance and require bound narrative pre-generation review. Regression must use real producer-shaped employment/education facts. Blocks truth claim, beta narrative gate and Production.
- **AUD-022 (MEDIUM, OPEN; RESUME-001):** `reconcilePackageResumeInput` permits a no-selection `legacy-compatibility` branch; package validation synthesizes `legacy-browser` identity with `legacy-unverified` review state. This honestly labels but still packages unselected browser résumé text, contrary to the Product Owner's exactly-one-explicitly-selected-base contract. Product Owner must choose required selection or an explicit labelled legacy review step; test no-selection 409 or review. Blocks hosted acceptance, beta and Production. Legacy editor/import/export must remain supported.
- **AUD-023 (LOW, OPEN; RESUME-001):** `api/application-packages.js` revise action builds from `base.mission` without reconciling a newly revoked fact or reselected résumé. Recheck fact snapshot/selection on revise and require review on change; regression revoke-after-generation then revise. Production truth follow-up; no direct beta block as scoped.
- **AUD-024 (MEDIUM, NEEDS REVERIFICATION; hard filter/QA):** Independent Cycle 2 full browser file failed 2/42 because `18433c05` changed discovery copy while `scripts/concierge-vault-browser.spec.mjs:765` still expected “Found 0 matching jobs”; isolated failure reproduced 2/2, baseline passed. Engineering correction `d2864c8906c57175ff9028775f6cbd44bf1181cd` updates only that assertion and retains consent/run-start checks. Targeted authorization test passed 1/1; smoke passed with 0 failures/6 warnings. The subsequent full file was **40/42**: stale Clerk fixture plus intermittent onboarding-consent failure; onboarding isolated repeat was **4/5** on the candidate versus **5/5** on a sibling candidate. Thus full-suite green and independent closure are still absent. Blocks integration/beta until audited test evidence is clean or explicitly quarantined with replacement coverage.
- **AUD-025 (MEDIUM, OPEN; AUTH-001/QA):** Since `bce8eb9`, the sign-in browser fixture fills a disabled legacy `#agentAccessEmail` input, deterministically timing out. No passing browser test exercises current Clerk redirect or fail-closed state. Replace it with current-path redirect/fail-closed coverage and login-page progress/error checks; an explicit temporary quarantine is not a pass. Hosted signed lifecycle still required. Blocks auth acceptance, beta and Production.
- **AUD-026 (LOW, OPEN; My Jobs):** In `5cfcb50`, “refresh to try again” is misleading for expired/missing runs, rate-limit failures and records beyond the 10-run restore cap. A first matching-card fallback may bind the same requisition from a newer historical run to the wrong card. Test duplicate requisition across runs and prefer exact run+requisition; distinguish recovery copy by cause. Production claim/edge follow-up, no direct beta block.
- **AUD-027 (LOW, OPEN; QA):** Auditor observed a nondeterministic two-click résumé onboarding failure at `12a2c369` under full-suite load, then 2/2 isolated passes. Engineering also observed a different onboarding-consent assertion intermittent at `18433c05`/`d2864c8` (4/5 isolated), with 5/5 on sibling `be217f0`. Neither observation proves a single root cause. Repeat-gate and stabilize condition-based waits before counting integration green; do not hide failures.
- **AUD-028 (LOW, OPEN; Remote filter):** `ce50e11f` handles remote contradictions for Greenhouse/Lever/Ashby but not SmartRecruiters and other normalizers or description-only/in-person/office-based/“Remote: No” wording. No live feed sampled. Expand negative tests/normalizers and verify affected provider feed before claiming Remote-only mission reliability. Conditional beta block if first-user mission is Remote-only on an affected provider; Production claim blocked.

## Original track crosswalk — retain IDs

| Track ID | Cycle 0 status and linked finding | Remaining evidence |
| --- | --- | --- |
| AUTH-001 | NEEDS REVERIFICATION — HIGH AUD-002; current newer Preview readiness true, lifecycle unproven | Exact source/instance, controlled sign-in, exchange, refresh, logout denial, second login, cross-user denial. |
| DATA-001 | OPEN — HIGH AUD-004 | Hosted two-tenant denial, cross-session persistence, backup/restore, authoritative store decision. |
| RESUME-001 | OPEN — HIGH AUD-005 plus MEDIUM AUD-007 | Owner source-of-truth decision, pinned version, per-fact confirmation, hosted flow. |
| CAPTURE-001 | OPEN — HIGH AUD-001 plus LOW AUD-013 | Two distinct captures -> one canonical job/run, hosted readback and noninflated metrics. |
| STATE-001 | NEEDS REVERIFICATION — source-correct receipt guard at b071371, no authorized real receipt run; LOW AUD-016 | Negative attempted/2xx/timeout cases and independent live receipt proof before any submission claim. |
| EXT-001 | OPEN — HIGH AUD-006 | Store/installed version, package digest, exact candidate compatibility. |
| PARTNER-001 | OPEN — MEDIUM AUD-008 | Live claim/role/consent/admin isolation and time-bounded attribution. |

These track IDs are not seven extra defects or extra severity counts. No track/finding is resolved because code changed, tests passed, a PR merged, or a build agent said fixed. Independent re-verification plus the specified regression and hosted evidence is required.

## Earlier observations described as resolved in Cycle 0

The auditor did not assign durable AUD IDs to these. Preserve the historical disposition without treating it as Production proof: persistent résumé PII moved to sessionStorage and legacy localStorage cleanup in RC source; fake Submitted fixture guarded to localhost/127.0.0.1 (source-closed); DOM XSS, browser bearer storage and CSV formula concerns were **claimed** fixed in 2eb61a1 but not re-reviewed. All are source-only and need exact-candidate/hosted re-verification if relied upon for a gate. Do not silently delete them or count them as live-resolved.

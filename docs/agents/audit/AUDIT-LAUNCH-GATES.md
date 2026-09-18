# Independent audit view of launch gates

## Cycle 4 live-Production overlay — ingested 2026-09-16

The independent Cycle 4 verdict is **BLOCKED**. A live deployment is not a gate PASS or authorization. This dated overlay supersedes the older runtime rows below where they conflict; their original decisions and definitions remain historical evidence.

| Gate / seam | Current evidence | Status / first missing proof |
| --- | --- | --- |
| G1 app public and sign-in shell | Production `/` has intended headers. `GET /login.html` is static 200 without CSP, frame, nosniff, referrer or permissions headers; `/api/login-page` has them. Discovery module is 404 in Production. | **FAIL** — AUD-029 and public-module P0. A clean two-file module fix `89acfc1` has bounded independent patch review and signed-SSO Preview startup proof, but is not deployed or audited as full release. |
| G1 résumé landing | Three live “Create free account” links reach the degraded login page. Free résumé account admission may still be valid; no signed path was tested. | **FAIL via AUD-029; AUD-030 admission/copy harm NEEDS REVERIFICATION.** |
| G1 partners / G5 | No new signed attribution/role evidence; Production surface unchanged in Cycle 4. | **BLOCKED** — AUD-008. |
| Auth and G2 signed limited beta | Production `/api/app-config` reports Clerk enabled with Production-shaped configuration. No end-to-end sign-in, server exchange, refresh, logout, second sign-in or two-account denial. | **BLOCKED** — AUD-002/004; First Real User **0/10 hosted PASS**. Config is not lifecycle proof. |
| Paid/owner entitlement | Browser/API tier-token mismatch remains; now-live paid/owner reliance is UNKNOWN. | **PENDING OWNER RE-DECISION** — AUD-019; prior deferral covered clean integration/Preview conditionally, not an assumed Production waiver. |
| Provenance / G6 full Production | App alias `dpl_229cmvzCQvh3hvcXZuKBPf9EwCyy` is READY, CLI/prebuilt, declared commit `7412af1`; 88 pre-fix public assets match source. GitHub Production record still points to `d64e174`; complete CLI tree/function parity and exact approval binding are not established. | **BLOCKED** — AUD-003/010/029, hosted identity/data and owner release decision. No merge, redeploy, rollback or Preview-artifact promotion follows. |

## Cycle 2 / app product-family overlay (2026-09-13)

The table below is the Cycle 0 gate definition and historical limited reconciliation; it is **not** a fresh hosted or Production verdict. Independent Cycle 2 reported local **PASS WITH FINDINGS**, hosted **BLOCKED**, integration **YES WITH CONDITIONS**, Production **NOT AUTHORIZED**. Main audit anchor `d64e174` and partial PR #80 anchor `b071371` are unchanged. AUD-017..028 are now in `AUDIT-FINDINGS.md`; their release effects augment the earlier blockers, never waive them.

| Surface / shared seam | Current justified release state | First missing proof or decision |
| --- | --- | --- |
| `app.1ststep.ai` signed Job Agent | **BLOCKED**; public shell historically conditional only | Exact Git-sourced Preview, Clerk lifecycle, hosted tenant/capture/résumé persistence, independently accepted clean integration. AUD-002/017/021/022/024/025 and original gates remain. |
| `resume.1ststep.ai` | Public shell **historical PASS WITH CONDITIONS**; current parity **UNKNOWN**; authenticated authority **BLOCKED** | Current source/deployment mapping, selected Vault version and real-fact conflict/review path, identity linkage to canonical app user; no separate truth store authorized. |
| `partners.1ststep.ai` | Operational launch **BLOCKED**; current live deployment state **UNKNOWN** | Current claim/link behavior, approved role, click→signup attribution/expiry, tenant isolation and explicit linkage to canonical app identity (AUD-008). |
| Shared identity, schema, APIs, tenant ownership | **UNVERIFIED** across all three surfaces | Inspect existing per-surface identity/linkage and hosted two-tenant denial; do not infer a common user merely from three hostnames or introduce a second identity system. |

Gate 10 integration may start only from a new clean worktree at the exact remote PR head, applying the five auditor-reviewed candidates in order with required suites after each step. The hard-filter assertion is corrected at `d2864c8`, but its full browser file is not green (40/42, including AUD-025 and intermittent onboarding consent); AUD-024 remains **NEEDS REVERIFICATION**. The 2026-09-14 Product Owner decisions in `AUDIT-DECISIONS.md` require explicit résumé/version selection and bound pre-generation narrative review for the current beta; those choices are settled, but implementation, integrated tests, independent re-audit and hosted proof still block acceptance. AUD-019 paid-access continuity is deferred for clean integration and Preview acceptance, but must be decided and verified before deployment beyond Preview if that release scope depends on it. Obtain a Git-sourced exact-SHA Preview for hosted proof; no CLI-associated Preview counts as PR #80 identity. No Production release, autonomous final submission or extension publication is authorized.

This is a **separate evidence view**, not a replacement for `docs/production-readiness/release-gate.md`, `docs/JOB_AGENT_DEPLOYMENT_RUNBOOK.md`, or owner approval. The auditor reports; the Orchestrator reconciles statuses. A green deterministic gate is not a signed-user or Production pass.

Cycle 0 proposed explicit G1–G4 only. G5/G6 below reconcile the already-existing separate Agent OS gates; they are **not** attributed to the auditor's missing proposed rows. These are evidence statuses, not approval to merge, deploy, submit or publish.

| Gate | Required evidence | Current evidence (Cycle 0 + limited reconciliation) | Blockers | Status |
| --- | --- | --- | --- | --- |
| G1 Public informational surfaces | Exact deployment/source parity, safe navigation, truthful pricing/privacy/capability copy on resume/app/partners. | Cycle 0 found resume/app shells conditionally acceptable; partner planned payout copy honest but browser-only link/attribution claim. Production app metadata CLI/gitDirty=1. | AUD-003 provenance; AUD-008 partner shell claim; current per-site parity not verified. | PARTIAL / overall BLOCKED; resume and app public shell PASS WITH CONDITIONS, partners not operational. |
| G2 Signed Job Agent limited beta | Exact Preview/Production signed lifecycle; hosted two-tenant denial/persistence; canonical résumé and capture; compatible extension; consent, recovery, cost/ops, rollback and clean candidate. | Newer associated Preview app-config Clerk true, but no sign-in; source capture key and vault trust gaps persist; hosted data and installed extension untested. Cycle 0 release docs reported 89/126 required Production variable names missing (value-blind, not reverified here). | AUD-001..006, AUD-010/012 evidence; beta-scoped environment readiness and full capture journey unverified. | BLOCKED — no signed beta. |
| G3 Employer-browser assistance | G2 plus approved supported adapter, action-time consent, checkpoints/exceptions, legal disclosures, no autonomous final submit. | Source contracts and deterministic tests only; no authorized live employer path. | G2, owner/legal authority, supported ATS/live proof. | BLOCKED / NOT AUTHORIZED. |
| G4 Autonomous final application submission | G3 plus per-fact truth, stable attempts, unknown-outcome recovery, kill switch, real authoritative receipt, explicit owner authorization. | Receipt guard source-correct at b071371, no real receipt execution. | G3, AUD-007/016, hosted receipt/kill-switch and separate owner authorization. | BLOCKED / NOT AUTHORIZED. |
| G5 Partner portal operational status | Verified role/isolation, consent/admin approval, lifecycle, click attribution/expiry, honest public claims; separate payout approval. | Cycle 0 live browser-only links and RC approved-only attribution without click/TTL; current live role untested. | AUD-008, hosted role/tenant and current public behavior; payout not active. | BLOCKED — not operational. |
| G6 Full production | All applicable capability gates, clean exact candidate/independent audit, security/DB/capacity/backup/support/rollback/legal and human decision. | PR #80 partial audit only; Production CLI/gitDirty metadata; protected runtime and hosted DB unknown. | AUD-001..012 as applicable, clean source AUD-003/010, OAuth AUD-011, recovery/ops/legal and human approvals. | BLOCKED — no Production release approval. |

For each cycle, report gate-specific `PASS`, `FINDINGS`, or `BLOCKED/UNKNOWN` with exact evidence and whether unresolved findings block that gate. Do not infer that a gate is ready because an unrelated surface is live. Production, employer actions, provider activation, and publication still require separate owner authorization.

## First real user application — controlled-beta release projection (2026-09-13)

This is a product-facing projection of G2, not a new audit baseline. `Integrated` means present in the open PR #80 source at `b071371`, not merged or released. `Hosted verified` requires the signed end-to-end behavior, not a public configuration response or local test. RESUME-001 has an independent source/local `PASS WITH FOLLOW-UP`; hosted and integration gates remain open.

| Capability | Implementation | Independent verification | Integrated | Hosted verified | Release status |
| --- | --- | --- | --- | --- | --- |
| Auth | Clerk/session path in PR #80; associated Preview reports enabled | AUD-002 open | PR #80 source only | No controlled sign-in/session lifecycle | P0 blocker |
| Setup persistence | Account-backed concierge state and Applicant Vault paths in PR #80 | Hosted tenant/recovery evidence outstanding | PR #80 source only | No signed persistence proof | P0 blocker |
| RESUME-001 authority | Local `12a2c369`; selected Vault version and fact reconciliation | PASS WITH FOLLOW-UP, source/local only; AUD-005/007 open | No | No | P0 blocker |
| Hard-filter visibility | Local `18433c05`; server counts distinguished from added jobs | Pending | No | No | P1 candidate |
| Real job capture | Local canonical-key candidate `be217f02`; PR #80 capture path exists | AUD-001 open | Canonical fix: no | No authenticated two-capture proof | P0 blocker |
| Job intelligence | Requirement/fit paths in PR #80 | Full signed-path review outstanding | PR #80 source only | No | P1 requirement |
| Package generation | Durable worker in PR #80; RESUME-001 authority is separate | RESUME-001 source review PASS WITH FOLLOW-UP; hosted proof pending | Authority fix: no | No signed package proof | P0 blocker |
| Package review | Review controls in `concierge.js` | Full signed-path review outstanding | PR #80 source only | No | P1 requirement |
| My Jobs persistence | Local multi-run recovery `5cfcb50`; older saved jobs remain actionable or honestly blocked | Four focused browser tests pass; independent/hosted review outstanding | Fix: no | No signed-hosted two-run proof | Conditional P0 blocker |

Current narrow path: establish exact signed Preview identity and session lifecycle; complete independent RESUME-001 and AUD-001 review; integrate accepted candidates in a clean release source; run one authenticated real-job, package-review, sign-out/sign-in persistence test. Do not advance a cell from local tests alone.

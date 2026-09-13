# Independent audit view of launch gates

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

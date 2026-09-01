# Job Agent release execution plan

This is the operator path from the current protected Preview to a controlled Production release. It is an execution checklist, not an authorization record. No checked box, source change, or successful test authorizes a migration, paid resource, credential transmission, personal-data transmission, employer action, Git push, merge, or Production deployment.

## Current release identity

- Release candidate commit: `150d15ce082a2932eba245b297d2d46afbdf860c`
- Runtime SHA-256: `f5625a51fd554ad5a38dea5ad140cc5d7153af5d076b496fca3ff1cbe2ae8a40`
- Core CI-hardening commit: `307e48d2fb1c134da3252959ba8b5ed3efc6285e`
- Exact protected Preview: `dpl_1234TcPAayhdctQZ4g8c64jCqoVY`
- Current Production/rollback reference: `dpl_9c9giRaF6YzZnEgDVsNfvRx48mGM`
- Production state: unchanged and not candidate-parity

## Authoritative live plan

Run `npm run security:launch-report` in a protected operator shell. It evaluates Production rules against the current process, emits content-free capability blockers and the bounded next-action view, performs no external calls, and writes no Production state. Encrypted provider values unavailable to that process remain unknown. The authenticated deployed readiness endpoint and retained external evidence are still required for release approval.

The current no-secret evaluation contains 34 unique actions: 23 for signed beta, one for Package Ready, five for assisted application, and five for final submission. The complete action catalog is normative in `lib/job-agent-launch-plan.js`; every emitted blocker is regression-checked against that catalog, while this document supplies the complete human execution sequence.

## Phase 1 - isolated data plane

- [ ] Select and prove a disposable local or isolated non-Production Postgres/Supabase target.
- [ ] Separately authorize applying the canonical migration to that target.
- [ ] Pass role-aware pgTAP, advisors, grant inspection, Data API exposure checks, and adversarial cross-tenant denial.
- [ ] Configure an isolated private encrypted object store and exact-host malware scanner under an approved cost ceiling.
- [ ] Pass synthetic write/read/integrity/scan/delete evidence without candidate data.
- [ ] Perform the separately authorized backup/PITR restore exercise and measure approved RPO/RTO targets.

Exit proof: layers 3 and 8 have applied isolated-target evidence; layer 13 has retained restore evidence. None of this may use Production candidate rows.

## Phase 2 - durable signed-beta runtime

- [ ] Configure encrypted durable state, tenant partitioning, data/audit key IDs, private storage, and fail-closed rate limiting.
- [ ] Configure counsel-approved consent/authorization versions and renewal behavior.
- [ ] Configure bounded scheduling, global caps, idempotent enqueue, consent pause, and cap deferral.
- [ ] Configure generic Needs You delivery and pseudonymous bounce/complaint suppression.
- [ ] Configure the exact-host retention archive and independently verify immutable acknowledgement/retention.
- [ ] Configure operator alert delivery, support ownership, incident ownership, coverage, escalation, acknowledgement window, and retention.
- [ ] Configure durable Stripe webhook idempotency before any paid entitlement path.
- [ ] Approve invoice-backed unit ceilings and configure integer-cent caps before paid provider work.
- [ ] Configure the server-only receipt-ingestion signing boundary.
- [ ] Configure the pseudonymous pilot allowlist, one-to-ten seat limit, and explicit Job Agent entitlement policy.

Exit proof: all 23 signed-beta blockers are absent from the authenticated readiness manifest, synthetic notification and alert receipts are receiver-verified, and the release evidence is signed to the exact candidate/configuration fingerprints.

## Phase 3 - Package Ready

- [ ] Configure and verify the fixed-budget, deny-all document sandbox.
- [ ] Generate only synthetic DOCX/PDF artifacts; verify ATS extraction, page rendering, integrity, teardown, and private retention/deletion.

Exit proof: `Package Ready` becomes eligible without enabling employer access or submission.

## Phase 4 - supervised Greenhouse assisted application

- [ ] Complete and version employer/ATS terms review.
- [ ] Separately approve the supervised assisted-application pilot.
- [ ] Configure the single-use server-signed Greenhouse extension handoff.
- [ ] Complete the synthetic security review and pin the reviewed Greenhouse-only artifact SHA-256.
- [ ] Keep candidate values transient, extension persistence disabled, and submit disabled.

Exit proof: assisted application is eligible only for the reviewed Greenhouse extension path. CAPTCHA, OTP, identity verification, ambiguous facts, changed terms, and consequential questions always pause for the human.

## Phase 5 - final submission and receipt proof

- [ ] Separately approve and configure the exact-scope submission provider.
- [ ] Configure the single-use durable worker with approval expiry, consent rechecks, idempotency, and outcome-unknown recovery.
- [ ] Run a separately authorized supervised synthetic execution matrix and sign evidence for every consequential control.
- [ ] Configure exact-host read-only authoritative receipt capture and authority allowlist.
- [ ] Exercise the durable receipt worker; exhaustion must create `Verify employer receipt` and must never retry submission.

Exit proof: `Submitted` remains impossible until an authoritative employer receipt is persisted. A filled form, click, redirect, or browser completion is never submission proof.

## Phase 6 - capacity, remote review, and release candidate

- [ ] Supply a scoped Preview bypass secret only through the protected shell and authorize the capped 10-request/concurrency-2 liveness probe.
- [ ] Record plan, region, concurrency, queue-depth, latency, and cost assumptions; run approved signed-user fairness and dependency-failure drills after the durable runtime exists.
- [ ] Explicitly authorize the branch push and review request.
- [ ] Require green remote Production Readiness Gate CI and human review; do not merge automatically.
- [ ] Re-run the complete local gate and exact-Preview verifier against the reviewed commit.
- [ ] Reconcile the 13-layer scorecard, full execution plan, evidence register, runbook, rollback preflight, and approval queue to the same commit and runtime digest.

Exit proof: one reviewable artifact has green local/remote gates, exact protected Preview evidence, capacity evidence, alert/recovery evidence, a fixed rollback target, and no unaccepted Critical layer.

## Phase 7 - controlled Production release

- [ ] Obtain a separate explicit Production deployment/promotion approval.
- [ ] Re-run preflight immediately before the consequential action and refuse on identity, digest, configuration, evidence, or approval drift.
- [ ] Promote/deploy only the approved artifact; do not mutate unrelated Production state.
- [ ] Run bounded, content-free Production acceptance checks for identity, assets, liveness, fail-closed readiness, headers, protected-route denial, and logs.
- [ ] Roll back to the fixed Ready Production reference if acceptance fails, only with action-time owner authorization.
- [ ] Keep separate action-time approvals for pilot admission, personal-data transmission, employer browser execution, paid provider activation, and each application submission.

Exit proof: Production serves the approved digest, bounded checks pass, monitoring/rollback ownership is active, and all user-visible states are backed by persisted evidence.

## Stop conditions

Stop and create Human Action Required for any CAPTCHA/OTP, identity verification, ambiguous candidate fact, changed/nonstandard term, new certification, outside-employment conflict, compensation exception, material qualification gap, paid-provider activation, unexplained configuration drift, unavailable receipt, or evidence mismatch. Never replace unavailable evidence with an optimistic status.

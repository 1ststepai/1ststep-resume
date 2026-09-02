# Human action required before controlled production release

This file is an operator checklist, not an authorization record. Checking a box in source does not authorize a migration, paid resource, credential transmission, Git push, employer action, or Production deployment. Each consequential action still requires a specific approval at action time.

## Current verified boundary

- Latest runtime candidate: commit `a1776d81d466f0249686387b1abc36d2b100be44`; runtime SHA-256 `0e047c3a79b2eab7f341fc1bb6406e75016acfb2658bde94adfd09035f84e3a8`.
- Protected Preview: `dpl_A8rpbCDYU8e9LPEKhLogHS5KQ2zu` (Ready; exact candidate, fail-closed sign-in UX, live route behavior, bounded capacity result, and content-free request logs verified).
- Protected Preview capacity: 10/10 liveness responses were HTTP 200 at concurrency 2; p50 100 ms, p95/max 134 ms, no bodies read, no bypass secret, and no writes. This is not a Production-capacity, signed-user-fairness, queue-throughput, or plan-quota claim.
- Isolated-data preflight: canonical digest valid; current operator environment has no Supabase CLI, no local container runtime, and no nonproduction target attestation. It made no network call and proved no target.
- Current Production/rollback reference: `dpl_9c9giRaF6YzZnEgDVsNfvRx48mGM` (Ready, but not candidate-parity).
- Full local release gate: passed.
- Production traffic, migrations, candidate transmission, employer contact, and application submission: unchanged/not performed.
- Production approval: blocked by scorecard layers 3, 8, and 13.
- Complete ordered operator path: [`RELEASE_EXECUTION_PLAN.md`](RELEASE_EXECUTION_PLAN.md). It maps the 34 current launch actions to phases and exit proof; it grants no authorization.

## Decision 1: isolated database target

Choose exactly one:

- [ ] Install/start Docker Desktop or Podman locally so `npx supabase start` can create a disposable target.
- [ ] Supply a separately isolated non-production Supabase/Postgres project through the protected environment, without placing credentials in chat or source.

Then separately authorize only this scope:

> Apply `supabase/migrations/20260901195545_job_agent_canonical_baseline.sql` to the proven isolated target; run the role-aware pgTAP pack, Supabase advisors, grant/RLS matrix inspection, and content-free schema evidence. Do not link to, inspect candidate rows in, or mutate Production.

Current evidence: neither Docker nor Podman, a local PostgreSQL command/service, nor a linked Supabase project is available. `npx supabase status` fails before database inspection because the container runtime is absent.

## Decision 2: private storage and recovery exercise

- [ ] Approve an isolated, non-production private object store and malware-scanner test configuration, including any provider cost ceiling.
- [ ] Approve a separate isolated backup/PITR restore exercise and evidence retention location.
- [ ] Name the recovery owner and approve target RPO/RTO values or revisions to the documented beta targets.

This approval must not activate browser execution, employer submission, email, billing, or Production data access.

## Decision 3: protected Preview capacity evidence

- [ ] Provide a scoped Preview protection-bypass secret only in the protected shell as `VERCEL_AUTOMATION_BYPASS_SECRET`; do not paste it into chat, documentation, or a tracker.
- [ ] Authorize one capped run: 10 GET requests, concurrency 2, only `/api/health/live`, expected 200, p95 ceiling 5,000 ms, no bodies retained.
- [ ] Separately approve the signed-user queue/fairness and dependency-failure exercise after the durable signed-beta runtime exists.

The exact bounded command is documented in [`staging-capacity-probe.md`](staging-capacity-probe.md). The script refuses Production hosts and cannot exceed 25 requests/five concurrent requests.

Current evidence: a read-only Preview environment-variable name listing contains no `VERCEL_AUTOMATION_BYPASS_SECRET`. No secret value was requested, displayed, written, or inferred, and no capacity claim has been made.

## Decision 4: operations and alerts

Provide or approve:

- [ ] Support owner.
- [ ] Incident/on-call owner and acknowledgement window.
- [ ] Redacted log/alert destination and retention period.
- [ ] Exact allowed alert host, endpoint contract version, and protected bearer-token provisioning method.
- [ ] One synthetic content-free alert-delivery and receiver-acknowledgement exercise.

A sender-side 2xx is not delivery proof. Retain receiver-side acknowledgement evidence without candidate or tenant values.

## Decision 5: remote review and CI

- [ ] Explicitly authorize `git push -u origin codex/application-concierge-pilot`.
- [ ] Explicitly authorize opening a review request after the push.
- [ ] Require the Production Readiness Gate check and human review; do not merge automatically.

The branch remains local until this authorization is given.

## Decision 6: controlled Production release

Only after Decisions 1-5 have evidence and the scorecard has no unaccepted Critical finding:

- [ ] Review the exact release commit, runtime digest, Preview deployment, migrations, configuration manifest, capacity evidence, recovery evidence, alert receipt, rollback target, and remote CI result.
- [ ] Give a separate approval for Production deployment/promotion.
- [ ] Give separate action-time approvals for any pilot admission, personal-data transmission, employer browser execution, paid provider activation, or application submission.

Production acceptance must remain bounded and content-free until a specifically approved synthetic pilot exercise. “Ready,” “Package Ready,” “Applying,” and “Submitted” retain their canonical evidence requirements.

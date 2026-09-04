# Human action required before controlled production release

This file is an operator checklist, not an authorization record. Checking a box in source does not authorize a migration, paid resource, credential transmission, Git push, employer action, or Production deployment. Each consequential action still requires a specific approval at action time.

## Current verified boundary

- Latest runtime candidate: commit `39d28c9c607187c1debe99ab120838b8edb53b57`; runtime SHA-256 `3e8fd271c838153dc899c151dcbdd68a2fccf40e44ccf78b0b2f99ac62c86443`.
- Protected Preview: `dpl_AiGJMf7zBkHJbwv6CjFtZvNj8STf` (Ready; exact candidate, fail-closed sign-in UX, live route behavior, bounded representative discovery canary, capacity result, and content-free request logs verified).
- Protected Preview capacity: 10/10 liveness responses were HTTP 200 at concurrency 2; p50 110 ms, p95/max 160 ms, no bodies read, no bypass secret, and no writes. The discovery canary returned 3/3 HTTP 200 and completed all eight representative source attempts across four providers from the 37-source catalog. This is not a Production-capacity, full-catalog-per-run, signed-user-fairness, queue-throughput, or plan-quota claim.
- Production configuration names: a value-blind audit found 47 observed names, 24 of 126 required names present, and 102 required names absent. Durable-runtime names are complete, but private storage, controlled beta, audit archive, operator alerting, signed launch evidence, support ownership, document rendering, assisted Greenhouse, and final submission remain materially incomplete by name alone. No value was read, and name presence does not prove a valid or working configuration.
- Isolated-data preflight: canonical digest valid; current operator environment has no Supabase CLI or local container runtime and no nonproduction target attestation. A separate authenticated read-only Supabase inventory found two healthy active projects, both assigned to another product, with zero development branches and zero eligible 1stStep.ai target. The sole visible organization is on the Free Plan; current Supabase billing documentation grants two Free projects across organizations where the account is an Owner or Administrator, so the free allocation is already occupied. No schema or data was inspected and no resource was created.
- Current Production/rollback reference: `dpl_9c9giRaF6YzZnEgDVsNfvRx48mGM` (Ready; read-only guard reverified 2026-09-02T02:49:55Z; protected routes deny unsigned access, but all four concierge assets remain intentionally not candidate-parity).
- Full local release gate: passed.
- Production dependency audit: source commit `0510756bed9537de9bba87eb1566150268d57408` adds a separate bounded CI job; the local `npm audit --omit=dev --audit-level=high` check found zero vulnerabilities across 167 production dependencies (181 total dependency entries). Remote CI execution is still unknown because the branch has not been pushed.
- Production traffic, migrations, candidate transmission, employer contact, and application submission: unchanged/not performed.
- Production approval: blocked by scorecard layers 3, 8, and 13.
- Complete ordered operator path: [`RELEASE_EXECUTION_PLAN.md`](RELEASE_EXECUTION_PLAN.md). It maps the 34 current launch actions to phases and exit proof; it grants no authorization.

## Decision 1: isolated database target

Choose exactly one:

- [ ] Install/start Docker Desktop or Podman locally so `npx supabase start` can create a disposable target.
- [ ] Supply a separately isolated non-production Supabase/Postgres project through the protected environment, without placing credentials in chat or source.

Then separately authorize only this scope:

> Apply `supabase/migrations/20260901195545_job_agent_canonical_baseline.sql` to the proven isolated target; run the role-aware pgTAP pack, Supabase advisors, grant/RLS matrix inspection, and content-free schema evidence. Do not link to, inspect candidate rows in, or mutate Production.

The candidate now includes a strict value-free runtime-evidence verifier. After a separately authorized isolated-target audit, run `npm run security:database-runtime-evidence -- --artifact <protected-redacted-artifact.json>`. It rejects a dirty or different release, target reuse, migration drift, missing forced RLS, client-role grants, failed pgTAP cases, unaccepted advisor findings, stale evidence, unknown fields, and candidate-bearing fields. It performs no connection, migration, write, billing, or Production action.

Current evidence: neither Docker nor Podman nor a local PostgreSQL command/service is available. `npx supabase status` fails before database inspection because the container runtime is absent. The authenticated Supabase account contains no eligible 1stStep.ai project or branch. Its sole visible organization is on the Free Plan and its two-project free allocation is already occupied by unrelated active projects. Current Supabase documentation states that data-less isolated branches are a Pro-plan capability. Exact cost remains unknown; selecting an organization and authorizing a cost lookup are required before any separately approved project or branch creation.

## Decision 2: private storage and recovery exercise

- [x] Implement and test a strict content-free recovery-evidence contract that requires distinct source/restore/Production fingerprints, exact migration identity, approved cost/RPO/RTO limits, encrypted backup policy, zero cross-tenant and orphan findings, integrity reconciliation, and cleanup proof.
- [ ] Approve an isolated, non-production private object store and malware-scanner test configuration, including any provider cost ceiling.
- [ ] Approve a separate isolated backup/PITR restore exercise and evidence retention location.
- [ ] Name the recovery owner and approve target RPO/RTO values or revisions to the documented beta targets.

This approval must not activate browser execution, employer submission, email, billing, or Production data access.

After the separately authorized restore, validate the redacted artifact with `npm run security:recovery-evidence -- --artifact <protected-redacted-artifact.json>`. A passing artifact is necessary but does not authorize or perform a restore, sign launch evidence, or prove any unrecorded provider behavior.

## Decision 3: signed-user capacity and dependency-failure evidence

- [x] Complete one capped protected Preview liveness run: 10 GET requests, concurrency 2, only `/api/health/live`, expected 200, no bodies retained, and no writes.
- [x] Record the actual hosting shape: active Vercel Pro plan, `iad1` function/default region, Fluid Compute enabled, standard fixed build machine, and Node 24.x.
- [x] Implement and test the strict redacted evidence contract that must pass before any signed-user fairness, queue, dependency-failure, quota, or cost result is accepted.
- [ ] Approve queue-depth, signed-user concurrency, latency, provider-quota, and cost ceilings for the durable signed-beta runtime.
- [ ] Separately approve the signed-user queue/fairness, backpressure, saturation, and dependency-failure exercises after that runtime exists.

The latest liveness probe used the authenticated Vercel CLI transport, not a protection-bypass secret. Exact Preview `dpl_9DLBhVkEo9JAvr8uN2kGBpqxJyUv` returned 10/10 HTTP 200 responses at concurrency two, p50 106 ms and p95/max 145 ms. The script remains Preview-only, exact-deployment-bound, GET-only, body-free, and capped at 25 requests/five concurrent requests. The new evidence verifier does not run or authorize a signed-user exercise. Signed-user fairness, queue throughput, provider quotas, failover, cost, and Production capacity therefore remain unverified.

## Decision 4: operations and alerts

Provide or approve:

- [ ] Support owner.
- [ ] Incident/on-call owner and acknowledgement window.
- [ ] Redacted log/alert destination and retention period.
- [ ] Exact allowed alert host, endpoint contract version, and protected bearer-token provisioning method.
- [ ] One synthetic content-free alert-delivery and receiver-acknowledgement exercise.

The candidate now fails closed unless alerting approval, the exact HTTPS allowlist, protected token, Redis outbox, contract version, 30-730 day retention, and 1-1,440 minute acknowledgement window all validate. Delivery evidence is scope-bound to the endpoint, contract, retention, acknowledgement window, and deterministic event contract. A sender-side 2xx is not delivery proof. Retain receiver-side acknowledgement evidence without candidate or tenant values.

Current read-only Vercel evidence found zero configured drains and one visible default team-wide alert rule. The rule was not inspected, and it is not evidence of a project-specific destination, retention, delivery, or acknowledgement. No alert, drain, integration, or paid feature was created or changed.

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

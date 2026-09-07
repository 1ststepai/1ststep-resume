# 1stStep.ai 13-layer production-readiness scorecard

This is an internal, evidence-first release methodology for the canonical `1ststep-resume` repository. The 13-layer organization is general inspiration only. It does not use or imply any third-party certification, branding, endorsement, assurance opinion, or proprietary report design.

## Evidence rule

The release cycle is:

`AUDIT IN -> FINDINGS -> REMEDIATION -> VERIFICATION -> AUDIT OUT`

Every statement is assigned one or more distinct maturity states:

- **Implemented**: source exists and was inspected.
- **Configured**: a named environment has the required configuration; secret names alone do not prove values.
- **Tested**: a repeatable test passed in a stated environment.
- **Verified in staging**: the exact commit was exercised in an identified staging/Preview deployment.
- **Verified in production**: the exact deployed commit and live behavior were observed within an approved, bounded check.
- **Unknown**: suitable evidence is absent, stale, inaccessible, or ambiguous.

`Pass` requires proportional evidence for every applicable production requirement. Code presence, a green build, a Vercel `Ready` state, an environment-variable name, or a public HTTP 200 is never enough by itself. `Warning` requires remediation or a time-limited risk decision. Any unaccepted `Critical` blocks production approval.

## Standards basis

- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) supplies application security verification objectives.
- [NIST SP 800-218 SSDF](https://csrc.nist.gov/pubs/sp/800/218/final) supplies secure-development and release-process practices.
- [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) requires grants and policies to be considered together and recommends explicit allow/deny database tests. These requirements are applied to any Supabase or Postgres Data API exposure; this repository's current tenant store is also assessed independently of vendor.
- [Vercel project configuration](https://vercel.com/docs/project-configuration) supplies deployment, function, header, route, and build-output requirements.
- Repository-specific contracts in `AGENTS.md`, `docs/JOB_AGENT_RUNTIME.md`, and `docs/JOB_AGENT_RESILIENCE_AND_RECOVERY.md` remain controlling constraints.

## Exit scorecard

| # | Layer | Requirements and relevant scope | Current evidence | Status | Exact remediation |
|---|---|---|---|---|---|
| 1 | Frontend foundations | Accessible, responsive, private-data-safe UI; `*.html`, client JS/CSS, browser suite | Candidate `1608968` retains the tested desktop/mobile first-use UI and adds native radio semantics plus roving keyboard focus for onboarding choices. The complete release gate passed, and the final Preview uses the same verified concierge asset hashes with fail-closed sign-in | Warning | Retain a full automated accessibility and performance artifact, then repeat bounded route, console, responsive, and signed-user checks after Production approval. |
| 2 | APIs and backend logic | Input validation, auth, idempotency, safe errors, bounded dependencies; `api/`, `lib/` | Local tests pass across 41 routes. Exact candidate `1aded9c` on protected Preview `dpl_E2D1cHiTdHg9Si2qhc1frrYpe1qW` returned liveness 200, readiness 503 fail-closed, app configuration 200, and three bounded discovery-canary 200s. Each canary attempted and completed eight representative sources across four ATS providers out of the 37-source catalog in 1.406-1.718 seconds. The full user discovery path has separately bounded provider work and a 45-second ceiling. Production is not the candidate artifact | Warning | Configure an isolated signed-beta environment, run safe signed-user Preview probes, and repeat complete bounded Production acceptance only after release approval. |
| 3 | Database and storage | Tenant isolation, least privilege, RLS/grants, encryption, retention, backup/restore; `migrations/`, tenant stores, object storage | Dedicated Neon Free staging now runs the exact canonical migration on PostgreSQL 17.11. Live inspection verified 20/20 RLS and forced-RLS tables, policies on all 20 tables, zero `FOR ALL` policies, zero client-role table privileges, and 19/19 adversarial pgTAP cases. A synthetic snapshot restored into a separate branch and cleanup returned the project to one branch, zero snapshots, and zero fixture rows. Preview-only configuration is branch scoped and Sensitive; Production was untouched | **Critical** | Exercise the signed-user persistence path in isolated Preview, implement and verify private object storage, then review an explicit authoritative-store migration and Production recovery plan before any Production database activation. |
| 4 | Authentication and permissions | Opaque sessions, revocation, least privilege, admin/tenant boundaries, consent | Local session, ownership, entitlement, and consent tests pass. Exact Preview `dpl_E2D1cHiTdHg9Si2qhc1frrYpe1qW` verified a server-only readiness check exposes only `restoreAccessAvailable: false`. A value-blind Production audit found zero of five consent-control names present and zero of eight controlled-beta names present; actual values and signed-user behavior remain unavailable and unclaimed | Warning | Configure the isolated signed-beta runtime, then verify a least-privilege staging account matrix, email-code session creation, revocation, admin denial, and tenant-crossing denial using synthetic accounts and the exact release commit. |
| 5 | Hosting and deployment | Reproducible clean build, intended routes/assets only, source exclusions, deployment identity | Clean release candidate `70736f3` passed the complete release gate and clean-candidate preflight. Exact protected Preview `dpl_9DLBhVkEo9JAvr8uN2kGBpqxJyUv` verified route behavior, the representative discovery canary, bounded liveness behavior, and content-free provider logs. Fresh Production parity still fails for all four concierge artifacts and Production lacks the candidate health routes | Warning | Push the reviewed candidate, require green remote CI, resolve Critical infrastructure gates, then obtain explicit Production approval before promotion and bounded acceptance checks. |
| 6 | Cloud and compute | Function limits, isolation, egress, spend, failure boundaries, vendor quotas | Duration, cost, isolation, and fail-closed contracts pass locally. Candidate `70736f3` adds a strict clean-release/exact-Preview evidence contract for approved synthetic signed-user latency, provider-unit, quota, cost, and failure-containment results. The latest three Preview canaries completed in 0.987-1.485 seconds. No signed-user exercise or quota/cost proof exists | Warning | Approve explicit function/account quota, queue, latency, provider-unit, and cost ceilings, then perform the bounded synthetic signed-user dependency-failure and saturation exercise and validate its artifact. |
| 7 | CI/CD and version control | Locked install, correct Node version, pinned actions, least permissions, required release gate | Clean implementation commit `307e48d` has Node 24, SHA-pinned actions, locked installs, bounded jobs, minimal permissions, concurrency controls, and non-persisted checkout credentials. Commit `0510756` adds a separate bounded high/critical production dependency-audit job; the local policy test and complete release gate pass, and the current production audit found zero vulnerabilities. Remote CI run unknown | Warning | Obtain explicit push/review authorization, require both workflow jobs as branch checks, and retain a successful GitHub run for the reviewed commit. |
| 8 | Security and RLS | OWASP-aligned authz, secrets, injection, SSRF, tenant RLS/grants, negative tests | The exact migration is applied to dedicated Neon staging. Live inspection verified RLS and forced RLS on all 20 tables, operation-specific policies on every table, no `FOR ALL` policies, and zero `PUBLIC`, anonymous, or authenticated table privileges. The adversarial pgTAP suite passed 19/19, including cross-tenant reads, writes, relationships, ownership transfer, delete, and invalid tenant context | Warning | Run a synthetic signed-user Preview persistence check, retain content-free provider advisor results, and repeat the tenant matrix before any Production database activation. |
| 9 | Rate limiting | Durable account/global limits, tenant-safe keys, fail closed, retry semantics | Upstash-based controls and regression tests exist. Candidate `70736f3` adds a verifier that requires durable tenant/global limit observation, valid retry semantics, tenant-key isolation, zero bypasses, and fail-closed behavior during backend unavailability. It has not accepted a live signed-user artifact | Warning | Approve and run the bounded synthetic signed-user exercise, then validate the redacted artifact; do not infer runtime proof from the local contract. |
| 10 | Caching and CDN | No private cross-user caching, explicit public caching, correct invalidation and error behavior | Preview verified concierge/API `no-store`, strict concierge CSP/security headers, and homepage `public, max-age=300, stale-while-revalidate=60` | Warning | After Production approval, repeat headers and add signed-user cache-isolation, error-route caching, and invalidation scenarios. |
| 11 | Load balancing and scaling | Bounded concurrency, backpressure, tenant fairness, capacity assumptions, dependency isolation | Provider bounds and circuit breakers pass local tests. Exact Preview `dpl_9DLBhVkEo9JAvr8uN2kGBpqxJyUv` passed a body-free liveness probe: 10/10 HTTP 200 at concurrency two, p50 106 ms and p95/max 145 ms. Candidate `70736f3` adds a strict verifier requiring zero starvation/cross-tenant interference, bounded queue depth/wait, explicit backpressure, zero drops/duplicate leases, drain, dependency containment, approved ceilings, and cleanup. The signed-user exercise has not run | Warning | Approve quota, queue, latency, provider-unit, and cost ceilings, then separately authorize and run the synthetic signed-user fairness, backpressure, saturation, and dependency-failure exercise; do not infer Production capacity from liveness or the verifier. |
| 12 | Error tracking and logs | Redaction, structured events, retention, correlation, alert delivery, ownership | Content-free health/events/alert queues pass local tests. Exact Preview `dpl_9DLBhVkEo9JAvr8uN2kGBpqxJyUv` produced 16 allowlisted expected log records with no content-bearing or unexpected record. Production alert ownership/delivery remains unconfigured and unverified | Warning | Name owners and approve the exact destination, retention, and acknowledgement window; then verify receiver-side synthetic alert acknowledgement and any approved log retention/dashboard. |
| 13 | Availability and recovery | Liveness/readiness, retries, backup/PITR, restore, reconciliation, RPO/RTO | Neon staging retains six hours of restore history. A manual snapshot of one synthetic row restored into a distinct branch; readback succeeded, restore compute became ready in 1,692 ms, and cleanup left one main branch, zero snapshots, and zero synthetic rows. Application retries and recovery tests continue to pass locally | **Critical** | Define approved RPO/RTO and alert ownership, finish private-storage recovery, migrate the authoritative store through an explicit reviewed plan, and then run a bounded Production-equivalent recovery exercise without touching live candidate data. |

The normative machine-readable record is [`scorecard.json`](scorecard.json). The immutable baseline for this remediation cycle is [`entry-scorecard.json`](entry-scorecard.json).

## P0-P3 findings

### P0

No P0 defect was proven by this bounded source/local audit. This is not proof that production has no P0 defect.

### P1

- Persistent staging grants/RLS and adversarial cross-tenant denial are verified; the signed-user application path and Production database boundary are not.
- A managed staging snapshot restore is verified; Production authoritative-store recovery, private-object recovery, and approved RPO/RTO remain unverified.
- The new full release workflow is not yet proven by a remote CI run.

### P2

- Current signed-user Preview/Production API behavior is unknown.
- Production log-drain, alert receipt, ownership, and retention are unknown.
- Capacity, queue-depth, cache, rate-limit fairness, and cloud quota behavior lack measured staging evidence.
- Representative Job Agent value, per-operation cost, and safety-outcome evidence are absent.

### P3

- Add a retained Lighthouse/axe-style accessibility and performance artifact for each release candidate.
- Set evidence-expiration periods per control family as operating experience accumulates.

## Release decision

**Blocked.** Layers 3 and 13 remain unaccepted Critical findings. Layer 8 improved to Warning after live persistent staging verification. No Production deployment or external action is authorized by this scorecard.

A fresh content-free Production configuration-shape audit on 2026-09-01 found 0/14 launch controls ready, 119 missing requirements, and zero malformed configured requirements. Preview remains eligible; signed beta correctly fails closed with 23 blockers led by `DURABLE_RUNTIME_NOT_CONFIGURED`. This is configuration evidence, not production runtime proof.

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
| 2 | APIs and backend logic | Input validation, auth, idempotency, safe errors, bounded dependencies; `api/`, `lib/` | Local tests pass across 41 routes. Exact candidate `1608968` on protected Preview `dpl_Ae8h7AVH4kAwDvhLVJfex8n11KRL` returned liveness 200, readiness 503 fail-closed, app configuration 200, and three bounded discovery-canary 200s. The canary states eight source attempts across four ATS providers out of the 37-source catalog and completed inside the function in 1.2-1.408 seconds; the full user discovery path has separately bounded provider work and a 45-second ceiling. Production is not the candidate artifact | Warning | Configure an isolated signed-beta environment, run safe signed-user Preview probes, and repeat complete bounded Production acceptance only after release approval. |
| 3 | Database and storage | Tenant isolation, least privilege, RLS/grants, encryption, retention, backup/restore; `migrations/`, tenant stores, object storage | One CLI-generated canonical migration is reconciled from three hashed sources; 20/20 tables enable/force RLS; explicit anon/authenticated revokes, operation policies, and tenant-scoped parent references pass static tests. Candidate `b5bccef` adds a content-free no-network preflight bound to the canonical digest, but the current environment has no Supabase CLI, local container runtime, or nonproduction target attestation; live schema/restore remain unknown | **Critical** | Provide a protected isolated target and attestation, pass the preflight, separately authorize the read-only audit, then apply only after review, pass adversarial pgTAP/advisors, verify private object storage, and perform a separately authorized isolated restore. |
| 4 | Authentication and permissions | Opaque sessions, revocation, least privilege, admin/tenant boundaries, consent | Local session, ownership, entitlement, and consent tests pass. Exact Preview `dpl_Ae8h7AVH4kAwDvhLVJfex8n11KRL` verified a server-only readiness check exposes only `restoreAccessAvailable: false`; actual signed-user behavior remains unavailable and unclaimed | Warning | Configure the isolated signed-beta runtime, then verify a least-privilege staging account matrix, email-code session creation, revocation, admin denial, and tenant-crossing denial using synthetic accounts and the exact release commit. |
| 5 | Hosting and deployment | Reproducible clean build, intended routes/assets only, source exclusions, deployment identity | Clean release candidate `1608968` passed the full release gate and exact protected Preview `dpl_Ae8h7AVH4kAwDvhLVJfex8n11KRL`; route behavior, representative discovery canary, bounded capacity behavior, and content-free provider logs were verified. Fresh Production parity still fails for all four concierge artifacts and Production lacks the candidate health routes | Warning | Push the reviewed candidate, require green remote CI, resolve Critical infrastructure gates, then obtain explicit Production approval before promotion and bounded acceptance checks. |
| 6 | Cloud and compute | Function limits, isolation, egress, spend, failure boundaries, vendor quotas | Duration, cost, isolation, and fail-closed contracts pass locally. Candidate `1608968` binds signed-user discovery to a regression-checked 45-second function ceiling and makes the synthetic Preview canary representative rather than parsing all 37 catalogs per probe; three exact-Preview canaries completed inside the function in 1.2-1.408 seconds | Warning | Record plan/region/quota assumptions and perform bounded staging dependency-failure exercises. |
| 7 | CI/CD and version control | Locked install, correct Node version, pinned actions, least permissions, required release gate | Clean implementation commit `307e48d` has Node 24, SHA-pinned actions, locked installs, bounded jobs, minimal permissions, concurrency controls, and non-persisted checkout credentials. Commit `0510756` adds a separate bounded high/critical production dependency-audit job; the local policy test and complete release gate pass, and the current production audit found zero vulnerabilities. Remote CI run unknown | Warning | Obtain explicit push/review authorization, require both workflow jobs as branch checks, and retain a successful GitHub run for the reviewed commit. |
| 8 | Security and RLS | OWASP-aligned authz, secrets, injection, SSRF, tenant RLS/grants, negative tests | Static suite confirms explicit backend operation policies, explicit anon/authenticated/PUBLIC revokes, tenant-scoped constraints, zero source cross-tenant reference risks, and no browser service-role marker. The isolated-data preflight rejects a managed target equal to Production and never converts operator attestation into live proof; runtime grants, adversarial denials, and advisors remain unverified | **Critical** | Pass the protected isolated-target preflight, separately authorize its read-only audit, then apply only after review and run role-aware pgTAP/advisors plus exposed-schema and grant inspection. |
| 9 | Rate limiting | Durable account/global limits, tenant-safe keys, fail closed, retry semantics | Upstash-based controls and regression tests exist; current deployed concurrency behavior unknown | Warning | Run approved staging concurrency/fairness tests and a content-free bounded production readiness probe. |
| 10 | Caching and CDN | No private cross-user caching, explicit public caching, correct invalidation and error behavior | Preview verified concierge/API `no-store`, strict concierge CSP/security headers, and homepage `public, max-age=300, stale-while-revalidate=60` | Warning | After Production approval, repeat headers and add signed-user cache-isolation, error-route caching, and invalidation scenarios. |
| 11 | Load balancing and scaling | Bounded concurrency, backpressure, tenant fairness, capacity assumptions, dependency isolation | Provider concurrency bounds and circuit breakers pass local tests. Exact protected Preview `dpl_Ae8h7AVH4kAwDvhLVJfex8n11KRL` passed a GET-only, body-free authenticated CLI probe: 10/10 HTTP 200 at concurrency 2, p50 109 ms and p95/max 243 ms, with no bypass secret or writes. The representative discovery canary returned 3/3 HTTP 200 with truthful source counts | Warning | Record plan/region quotas, then run separately approved signed-user queue/fairness, backpressure, saturation, and dependency-failure exercises; do not infer Production capacity from this bounded liveness sample. |
| 12 | Error tracking and logs | Redaction, structured events, retention, correlation, alert delivery, ownership | Content-free health/events/alert queues pass local tests. Exact Preview logs contained 16 allowlisted request records with every expected 200/503 route outcome, zero unexpected statuses, zero content-bearing records, and no retained raw messages | Warning | Verify an approved log drain, alert receipt, retention, dashboard, and on-call acknowledgement. |
| 13 | Availability and recovery | Liveness/readiness, retries, backup/PITR, restore, reconciliation, RPO/RTO | Application recovery mechanics pass locally. The isolated-data preflight explicitly reports `backupRestoreVerified: false` and refuses to authorize restore or billable operations; provider backup cadence/retention/PITR, restore, integrity reconciliation, RPO, and RTO remain unknown | **Critical** | After the isolated target is proven and separate operator/cost approval is recorded, restore into a separate target, measure RPO/RTO, reconcile content-free counts/links, and retain signed evidence. |

The normative machine-readable record is [`scorecard.json`](scorecard.json). The immutable baseline for this remediation cycle is [`entry-scorecard.json`](entry-scorecard.json).

## P0-P3 findings

### P0

No P0 defect was proven by this bounded source/local audit. This is not proof that production has no P0 defect.

### P1

- Applied database grants/RLS and adversarial cross-tenant denial are unverified; source-level policy and relationship defects are remediated and statically tested.
- Backup/PITR retention and an isolated restore are unverified.
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

**Blocked.** Layers 3, 8, and 13 remain unaccepted Critical findings. No deployment or external action is authorized by this scorecard.

A fresh content-free Production configuration-shape audit on 2026-09-01 found 0/14 launch controls ready, 119 missing requirements, and zero malformed configured requirements. Preview remains eligible; signed beta correctly fails closed with 23 blockers led by `DURABLE_RUNTIME_NOT_CONFIGURED`. This is configuration evidence, not production runtime proof.

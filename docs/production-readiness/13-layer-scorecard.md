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
| 1 | Frontend foundations | Accessible, responsive, private-data-safe UI; `*.html`, client JS/CSS, browser suite | Local release suite and 36 browser scenarios pass; current Preview/Production unknown | Warning | Commit a clean candidate and retain Preview route, console, accessibility, and mobile evidence. |
| 2 | APIs and backend logic | Input validation, auth, idempotency, safe errors, bounded dependencies; `api/`, `lib/` | Local security, workflow, import, and boundary tests pass across 41 routes | Warning | Run signed-user safe Preview tests and a bounded post-approval Production acceptance test. |
| 3 | Database and storage | Tenant isolation, least privilege, RLS/grants, encryption, retention, backup/restore; `migrations/`, tenant stores, object storage | One CLI-generated canonical migration is reconciled from three hashed sources; 20/20 tables enable/force RLS; explicit anon/authenticated revokes, operation policies, and tenant-scoped parent references pass static tests; live schema/restore unknown | **Critical** | Prove an isolated target, apply the canonical migration there, pass adversarial pgTAP and advisors, verify private object storage, then perform an authorized isolated restore. |
| 4 | Authentication and permissions | Opaque sessions, revocation, least privilege, admin/tenant boundaries, consent | Local session, ownership, entitlement, and consent tests pass | Warning | Verify the exact staging identity configuration with user/admin/cross-tenant denial and revocation scenarios. |
| 5 | Hosting and deployment | Reproducible clean build, intended routes/assets only, source exclusions, deployment identity | 56 static assets, 41 functions, and source boundary verified locally | Warning | Deploy a clean Preview from one commit and bind route/source evidence to its deployment ID. |
| 6 | Cloud and compute | Function limits, isolation, egress, spend, failure boundaries, vendor quotas | Duration, cost, isolation, and fail-closed contracts tested locally | Warning | Record plan/region/quota assumptions and perform bounded staging dependency-failure exercises. |
| 7 | CI/CD and version control | Locked install, correct Node version, pinned actions, least permissions, required release gate | Node 24 full-gate workflow implemented and locally validated; remote CI run unknown | Warning | Commit in isolation, require the workflow as a branch check, and retain a successful GitHub run for that commit. |
| 8 | Security and RLS | OWASP-aligned authz, secrets, injection, SSRF, tenant RLS/grants, negative tests | Static suite confirms explicit backend operation policies, explicit anon/authenticated/PUBLIC revokes, tenant-scoped constraints, zero source cross-tenant reference risks, and no browser service-role marker; runtime grants, adversarial denials, and advisors remain unverified | **Critical** | Apply only to a proven isolated target, then pass role-aware pgTAP and advisors and inspect the exposed schema/grant matrix. |
| 9 | Rate limiting | Durable account/global limits, tenant-safe keys, fail closed, retry semantics | Upstash-based controls and regression tests exist; current deployed concurrency behavior unknown | Warning | Run approved staging concurrency/fairness tests and a content-free bounded production readiness probe. |
| 10 | Caching and CDN | No private cross-user caching, explicit public caching, correct invalidation and error behavior | API/concierge no-store rules and output tests pass locally | Warning | Capture Preview and Production headers for public, private, API, and error routes. |
| 11 | Load balancing and scaling | Bounded concurrency, backpressure, tenant fairness, capacity assumptions, dependency isolation | Provider concurrency bounds and circuit breakers pass local tests | Warning | Define beta capacity and SLOs; run capped queue/source-failure/load exercises in staging. |
| 12 | Error tracking and logs | Redaction, structured events, retention, correlation, alert delivery, ownership | Content-free health/events/alert queues exist and pass local tests | Warning | Verify an approved log drain, alert receipt, retention, dashboard, and on-call acknowledgement. |
| 13 | Availability and recovery | Liveness/readiness, retries, backup/PITR, restore, reconciliation, RPO/RTO | Application recovery mechanics pass locally; provider backup cadence/retention/PITR, restore, integrity reconciliation, RPO, and RTO are unknown | **Critical** | After separate operator/cost approval, restore into an isolated target, measure RPO/RTO, reconcile content-free counts/links, and retain signed evidence. |

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

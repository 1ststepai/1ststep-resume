# Evidence register

Evidence is admissible only when it identifies the control, scope, environment, result, timestamp, owner, and exact commit or deployment. Sensitive values, candidate data, resumes, employer answers, tokens, or raw private logs must never be included.

## Evidence strengths

| State | Minimum acceptable evidence | Not sufficient |
|---|---|---|
| Implemented | Inspected source path and commit/diff | Design intent or TODO |
| Configured | Named environment plus safe shape/validation result | Environment-variable name or encrypted placeholder |
| Tested | Command, exit code, timestamp, and test scope | “Tests pass” without command/result |
| Verified in staging | Preview/deployment ID, commit, bounded runtime result | A local build or stale Preview |
| Verified in production | Production deployment ID/commit and approved live/persisted observation | `Ready`, HTTP 200, or source guard alone |
| Unknown | Explicit statement of missing/inaccessible/stale evidence | Silence or optimistic inference |

## Current register

| ID | Layers | State | Evidence | Timestamp | Commit/scope | Freshness |
|---|---|---|---|---|---|---|
| E-001 | 1,2,5 | Tested | `npm run test:web-release` passed; 56 static assets, 41 API functions, no internal-source leak | 2026-09-01 | Dirty working tree based on `77d2086` | Re-run after any release-source change |
| E-002 | 1 | Tested | `npm run test:browser:vault`: 36/36 passed, including mobile retry/Pause/Play again | 2026-09-01 | Local fixture | Re-run after UI/client changes |
| E-003 | 2,6,9,11,12,13 | Tested | Resilience, workflow, circuit-breaker, health, queue, and rate-limit tests passed locally | 2026-09-01 | Local mocked/synthetic dependencies | Not staging/production evidence |
| E-004 | 3,8 | Implemented, Tested | Deterministic inventory verifies three migration digests, 20/20 source RLS/forced-RLS tables, and no destructive statements; adversarial pgTAP pack is present but unexecuted | 2026-09-01 | Static source based on `77d2086`; no database connection | Invalidated by migration/database-access changes; not runtime evidence |
| E-005 | 4,8 | Tested | Session, tenant ownership, admin, consent, and authorization regression tests pass | 2026-09-01 | Local fixtures | Not live identity/RLS evidence |
| E-006 | 5,10 | Tested | Vercel output and header configuration tests pass | 2026-09-01 | Local production-equivalent build | Live header/cache behavior unknown |
| E-007 | 7 | Implemented | Node 24 deterministic release workflow added with pinned actions and locked install | 2026-09-01 | Dirty working tree | Remote GitHub run unknown |
| E-008 | 3,8,13 | Implemented, Tested, Unknown | Source now has a reconciled canonical migration, explicit backend operation policies, explicit anon/authenticated revokes, and tenant-scoped composite references with zero static cross-tenant reference risks. No isolated target was proven, so applied grants/RLS, adversarial tenant denial, advisors, managed backups, PITR retention, isolated restore, RPO, and RTO remain unverified | 2026-09-01 | Working tree / Staging / Production | **Critical; Human Action Required** |
| E-011 | 3,8,13 | Implemented | Database isolation/recovery report, machine evidence, read-only catalog inventory, and pgTAP suite define the exact staging/restore evidence contract | 2026-09-01 | Repository static analysis only | Not staging/production evidence |
| E-009 | 12 | Unknown | Log-drain retention, alert delivery receipt, dashboard SLO, and on-call acknowledgement | 2026-09-01 | Production | Warning |
| E-010 | 6,9,10,11 | Unknown | Measured runtime quota, cache, concurrency, fairness, capacity, and failover behavior | 2026-09-01 | Staging/Production | Warning |
| E-012 | 1,2,5,10 | Verified in staging | Protected Preview `dpl_CPqjxie64YwfUrrar3qzGrdr3WoF` rendered the first-use concierge, exposed 41 intended API functions, passed liveness and live-discovery smoke with submissions disabled, and returned the intended CSP, security, and cache headers. Readiness failed closed because signed-beta infrastructure is intentionally incomplete | 2026-09-01 | Commit `d899db2a899cfded756e38130ee864295f0a553b`; Vercel Preview | Warning; production unchanged |
| E-013 | 12 | Verified in staging | A bounded, content-free read of Preview runtime request logs corroborated the expected synthetic outcomes: liveness/config/discovery 200, incomplete readiness 503, unsigned session capabilities 401, and no application log messages | 2026-09-01 | Deployment `dpl_CPqjxie64YwfUrrar3qzGrdr3WoF`; nine retained request summaries | Warning; log drain, retention, alert receipt, and on-call response remain unknown |
| E-014 | 2,5,6 | Verified in staging | Clean commit `970260b` aligned the durable worker to the deployed 60-second ceiling, passed the full release gate, and passed the protected Preview verifier with healthy liveness, fail-closed readiness, durable limiting, live discovery, and submissions disabled | 2026-09-01 | Deployment `dpl_aRuM2TzQjwkN4eVYDHroep1JsJvC`; runtime SHA-256 `6ab6902456d7ae9766bf5c493a37caf3f437fc46e86bbf59e40dbd8a734f753f` | Warning; signed-user, capacity, alerts, and Production remain unverified |

## Persisting new evidence

Add only redacted summaries. Store provider-generated evidence in the approved private audit location when configured, record its digest here, and set an expiration appropriate to the control. Do not commit credentials, raw logs, user data, private URLs, employer content, or mutable dashboard screenshots as authoritative evidence.

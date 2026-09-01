# Job Agent resilience and recovery

## Runtime architecture

The production application is a static concierge frontend with Vercel Functions. Upstash Redis is the authoritative beta state/queue store; AES-256-GCM encrypted envelopes contain candidate-linked values. The hourly Vercel cron drains leased work. Optional Neon/Postgres tables are a reviewed relational projection, not a silent replacement for Redis. Employer-facing browser and submission capabilities remain separate, disabled-by-default boundaries.

The existing Redis/CAS/lease design remains the workflow engine. Adding a second workflow runtime now would create two authorities and weaken recovery. Each run now persists `runId`, `operationId`, lifecycle state, attempt/max attempts, last error class, retry time, heartbeat, parent/package relationship, and a bounded append-only event history before the next step begins.

## Dependency and failure-mode map

| Dependency | Purpose | Timeout / concurrency | Retry policy | Failure and user behavior | Primary concierge blast radius | Fallback and observability |
|---|---|---|---|---|---|---|
| Static frontend / Vercel CDN | Concierge shell | Browser requests are bounded by client timeouts | User reload | Cached/saved view remains; no fake zero state | Low | Local session fallback; route/browser tests |
| Opaque signed sessions / optional Clerk bridge | Authentication | 8–15s client/API limits | Reauthenticate; never bypass | Progress remains saved; sign-in requested | Medium | Existing signed session; authentication-failure aggregates |
| Upstash Redis | Runs, queues, leases, encrypted vaults, rate limits | Health probe 2.5s; worker leases 15–120s | Exponential run retry; stale lease reclaim | Consequential writes fail closed; state is unknown, not empty | High | Provider backup/PITR must be operator-verified; readiness 503 |
| Optional Neon/Postgres | Tenant relational projection and RLS | Provider defaults; query timeout not yet production-verified | Application-level retry only for safe reads | Redis beta runtime continues; relational projection marked unknown | Low today | Migrations 001–003; RLS/static checks |
| Private object storage | DOCX/PDF and exports | Endpoint/provider bounded | Retry before publication | Text/source retained; no document-ready claim | Low | Text-only review; storage metrics/drills |
| AI provider/router | Extraction and package drafting | 20–40s client; 35s package call | Maximum four durable attempts; spend reservation | Saved jobs remain; generation becomes Retrying or Failed Safely | Low | Candidate-edit/no-AI paths; spend ledger and provider metrics |
| Public ATS adapters | Greenhouse, Lever, Ashby, SmartRecruiters | 6–8s request; global bounded concurrency | Durable run retry plus tenant source circuit | Healthy-source results retained; partial coverage shown | Low | Direct-employer source rotation; source/circuit metrics |
| Reviewed future ATS adapters | Workday, iCIMS, Eightfold, Rippling, SilkRoad | Not operational | None until adapter review | Never silently scraped | None | Operator-review-only source-expansion proposal |
| Email / Resend | Generic Needs You notification | Provider request timeout is provider-bound | Durable notification queue | In-app Needs You remains authoritative | None | Suppression/retry queue and metrics |
| Browser worker | Employer application checkpoint | Provider/task deadlines and expiring leases | Safe pre-transmission retry only; unknown outcomes require review | Checkpoint preserved; other jobs continue | None | Extension/manual resume; cleanup and outcome-unknown queues |
| Submission/receipt workers | Consequential submit attempt and receipt proof | Single-use approvals and bounded tasks | No blind retry after provider start | Submitted remains false until authoritative receipt | None | Human reconciliation; receipt queue/audit chain |
| Vercel cron | Hourly queue drain | 60s worker function; bounded item counts | Next cron or manual Play | Missed run is visible; user can Play again | Low | Durable due indexes and worker heartbeat |
| Analytics / GHL | Product analytics and CRM | 10–15s endpoints | At most two attempts on legacy paths | Never blocks Job Agent | None | Local/no-op behavior; content-free errors |
| Stripe | Subscription entitlement | 10–15s functions | Webhook replay/idempotency | Existing access state preserved; no Job Agent work mutation | Low | Durable webhook claims and audit metrics |

No Supabase Function is part of the canonical concierge runtime found in this audit. Provider console settings, actual backup plans, connection-pool limits, and live alert delivery remain operator evidence—not source-code facts.

## Lifecycle and recovery

Canonical lifecycle states are `Queued`, `Searching`, `Verifying`, `Preparing`, `Waiting for You`, `Paused`, `Retrying`, `Completed`, `Partially Completed`, and `Failed Safely`. Legacy `status` remains for compatibility while `lifecycleState` is the user-facing durable truth.

- A run is persisted as Queued before a worker may claim it.
- Claiming is compare-and-set and assigns a hashed lease token.
- Every transition appends a content-free event with operation ID, attempt, state, and timestamp.
- Heartbeats extend the lease and persist `lastHeartbeatAt`.
- A crashed worker becomes claimable after lease expiry.
- Retry uses exponential delay, maximum attempts, and a persisted `nextRetryAt`.
- Three consecutive source failures open a tenant-scoped circuit. The source becomes half-open after cooldown and is never permanently blacklisted.
- Partial direct-source success finishes as Partially Completed and retains verified results.
- Submission tasks retain their separate single-use, outcome-unknown, and authoritative-receipt protections.

## Untrusted-content boundary

Employer pages, job descriptions, resumes, uploads, and email-derived evidence are data, never instructions. Job text is normalized, active markup/control characters are removed, instruction-like phrases are flagged, and the normalized SHA-256 plus verified source URL are stored with the package input. Only public HTTPS destinations are allowed; credentials, private IPs, localhost, internal hostnames, nonstandard ports, and fragments are rejected. Model output is strict JSON and existing deterministic qualification, source-map, hard-filter, ATS, and receipt checks remain authoritative.

## Health and observability

- `GET /api/health/live`: public process liveness only; no dependency claim.
- `GET /api/health/ready`: public, bounded core readiness only; returns 503 unless required state/auth/encryption/source dependencies are healthy.
- `GET /api/health/dependencies`: signed admin-only component summary.
- `GET /api/health/workers`: signed admin-only worker and content-free queue summary.

Statuses are `healthy`, `degraded`, `unavailable`, or `unknown`. Admin diagnostics are rate limited and contain no URLs, credentials, candidate values, or tenant identifiers. Existing operational aggregates cover authentication, rate limiting, provider usage/failures, source requests, schedules, queues, receipt verification, browser cleanup, submission outcomes, storage and spend. Alerts are dispatched through the existing operator-alert outbox; source code does not prove a live recipient or provider delivery.

The legacy `/api/health` administrative blast/backfill actions are now POST-only, require a production header credential, and are disabled unless `HEALTH_LEGACY_ADMIN_ACTIONS_ENABLED=true`. Keep this false for the Job Agent beta.

## Security and cost controls

- Opaque-session authorization and tenant ownership are mandatory for candidate-linked endpoints.
- Nested health routes are part of the explicit route-policy allowlist.
- Durable rate limits cover user, IP, endpoint, and expensive operations.
- Job content is capped at 50,000 characters; persisted private payloads are capped at 900 KB.
- AI calls reserve category spend before provider contact and settle conservatively.
- Repeated content can reuse its normalized SHA-256 for deterministic extraction caching; a shared cache is not activated until its tenant/privacy policy is reviewed.
- Circuit breakers prevent a failing source from consuming repeated network/runtime budget.
- Passwords, OTPs, CAPTCHA answers, security codes, government IDs, and prohibited secrets are rejected from durable run and learning stores.

## Risk register

### P0

None proven by the local source and test audit. This is not evidence that production has no P0 issue.

### P1

- Production Upstash backup/PITR, restore credentials, and recovery timing are unverified.
- Migrations 002 and 003 are not applied; Redis remains the only authoritative beta workflow store.
- Live alert routing and scheduler-miss delivery are unverified.

### P2

- Optional database query timeout and pool-exhaustion behavior remain provider-console unknowns.
- Private document storage/rendering is inactive, so full DOCX/PDF Package Ready remains unavailable.
- Future ATS adapters remain unimplemented and require source-specific review.
- Health dependency probes currently verify core Redis reachability; AI/email/browser/storage provider calls are intentionally not triggered by readiness.

### P3

- The legacy health route still contains old marketing/admin code, although consequential actions now fail closed behind POST, header auth, and a disabled flag. Split it into dedicated administration endpoints before broad GA.
- Run event history is bounded to 100 events and retained for 30 days; longer audit retention requires the relational projection.

## Backup and disaster-recovery plan

Target beta objectives, subject to provider verification:

- Workflow/vault RPO: 24 hours or the provider's confirmed PITR interval, whichever is stricter.
- Workflow restoration RTO: four hours after credentials and a clean release artifact are available.
- Static application rollback RTO: 30 minutes using the prior verified Vercel deployment.
- Document RPO/RTO: unknown until private object storage is activated and versioning/retention are verified.

Safe restore verification, without production mutation:

1. Record the approved release commit, deployment ID, environment-variable names, migration versions, and encrypted backup snapshot timestamp.
2. Restore into an isolated non-production project/account with newly scoped credentials.
3. Verify record counts and encrypted-envelope metadata without printing candidate content.
4. Run tenant-isolation, queue reconstruction, stale-lease, receipt-integrity, export, and deletion tests.
5. Confirm no employer-browser, submission, email, or paid provider activation exists.
6. Compare policy hashes and release-source inventory.
7. Destroy the isolated restore only after the operator confirms the evidence record; never use this procedure against production during testing.

Queue reconstruction uses durable run lifecycle state and `nextRetryAt`; Queued/Retrying work is re-indexed, active leases are allowed to expire, outcome-unknown consequential tasks remain human-review-only, and Completed/Partially Completed work is not replayed.

## Rollback

1. Keep learning, browser, submission, storage, and email activation flags unchanged.
2. Revert the resilience commit or promote the last verified Vercel deployment.
3. Do not roll back or delete migrations blindly. Leave additive tables unused, or apply a separately reviewed down migration after backup verification.
4. Preserve Redis run/event records until reconciliation completes.
5. Confirm `/api/health/live`, `/api/health/ready`, public routes, source boundaries, receipt semantics, and disabled capabilities.

## Production verification checklist

- [ ] Review and apply migrations 002 and 003 in Preview/staging first.
- [ ] Verify Upstash backup/PITR, restore role, retention, connection limits, and alerting.
- [ ] Verify Vercel cron invocation and worker heartbeat across a deployment.
- [ ] Exercise crash after claim, crash after provider reservation, and stale-lease recovery.
- [ ] Confirm a partial source outage retains healthy verified matches.
- [ ] Confirm expired auth never loses the persisted run.
- [ ] Confirm AI timeout/malformed JSON reaches Retrying then Failed Safely at the cap.
- [ ] Confirm browser interruption preserves the employer checkpoint.
- [ ] Confirm duplicate submission and unknown submission outcomes never retry blindly.
- [ ] Confirm authoritative receipt is still the only Submitted transition.
- [ ] Confirm admin health routes reject non-admin and cross-tenant access.
- [ ] Confirm public health routes disclose no infrastructure detail.
- [ ] Confirm mobile Play/Pause/Play again, keyboard focus, and no indefinite spinner.
- [ ] Keep `HEALTH_LEGACY_ADMIN_ACTIONS_ENABLED=false`.
- [ ] Review retention/privacy language before activating relational history.
- [ ] Deploy Preview from a clean committed tree; production requires Evan's separate approval.

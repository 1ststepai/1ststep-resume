# Queue draining local handoff

## Coordinator continuation — 2026-09-06

Final local continuation: both additional coverage gaps are now tested. `node --experimental-test-module-mocks scripts/application-package-lease-test.mjs` passes slow generation, rendering, stage renewal and late persistence; the worker rechecks/renews ownership after generation and before artifact transmission. `scripts/job-agent-queue-draining-test.mjs` now models server-time claim eligibility and passes server-ahead/server-behind lease and retry cases. The existing application-package suite passed again after these checks. Final same-provider peer review passes the local candidate, with real-store evidence still required. Smoke rerun: zero failures, six existing warnings. A real locally imported HTTP handler returns 401 Unauthorized anonymously. Browser navigation to that localhost test was blocked by the browser client; no protection was bypassed, and full manual browser/API workflow smoke is not claimed. No deployment.

Dependencies restored with the installed npm CLI using a normal registry install, scripts disabled and package-lock writes disabled. No cache cleanup was performed. Existing run-store, worker-API, consent, spend-ledger, submission-worker, receipt-worker and both new synthetic suites passed. The package suite initially failed because its historical injected clock was mixed with wall-clock completion; the package worker now advances completion/failure timestamps from injected `now` using monotonic elapsed time, matching discovery. The package suite then passed.

Same-provider read-only peer review confirmed the clock issue and no additional blocking code defect. Two verification gaps remain before release: slow package generation/artifact persistence crossing the 45-second lease, and deterministic claim eligibility with Redis server-ahead/server-behind clocks (the synthetic claim model does not yet model that TIME check). Keep expiry fences intact. Real Lua, distributed limits, strict fairness, continuous triggering and browser/API smoke remain unverified. This is still an isolated uncommitted candidate, not an integrated or deployed feature. The original blocked-install evidence below describes the earlier attempt, not the current dependency state.

Status: local candidate, uncommitted; **not 2,000-user readiness evidence**.
No deployment, provider request, paid call, migration, or remote mutation was made.

## Existing behavior and exact changes

The API already performs serial bounded batches (one run by default, maximum three),
plus bounded maintenance queues, under the existing 60-second platform ceiling.
The existing encrypted run store provides tenant identity, idempotency, versions,
hashed leases, due timestamps, retries and state events. These remain authoritative.

- `api/job-agent-worker.js`: shares a 50-second monotonic deadline across the existing
  cycle, including diagnostics; guards adapter entry/results and the supplied Redis
  client. Expiry returns HTTP 503 with content-free `outcome: unknown`, with no
  completion count. Isolated run errors/null results no longer stop the remaining
  bounded run slots. Existing authorization and external-capability checks remain.
- `lib/job-agent-worker-deadline.js`: deadline and guarded-client helper. Tests can
  shorten the budget but cannot raise it above 50 seconds. No polling or new consumer.
- `lib/job-agent-run-store.js`: examines at most 100 due entries; rotates the selected
  tenant's other visible entries to the back using the existing due score and atomic
  version checks. A per-cycle tenant set prevents repeated service in one cycle.
  Rotation also persists across default one-run invocations. Original creation,
  retry and lease timestamps remain in records. Contention no longer unconditionally
  removes the winner's recovery index entry. Expired owners cannot renew, finish or
  fail runs; Lua checks Redis TIME as well as the supplied timestamp. Claim checks
  lease/retry eligibility against server time. Four abandoned attempts exhaust into
  existing Failed/Failed Safely states with a content-free audited recovery error.
- `lib/job-agent-worker.js`: propagates the per-cycle tenant set, stops on rejected
  heartbeats, and does not record learning after unconfirmed completion. Elapsed time
  advances from the supplied run timestamp for deterministic historical fixtures.
- `lib/application-package-worker.js`: stops on a rejected initial heartbeat and
  rechecks existing authorization before generation. No monetary or approval policy
  was changed.
- `scripts/job-agent-queue-draining-test.mjs` and
  `scripts/job-agent-queue-cycle-test.mjs`: synthetic store/deadline and isolated cycle
  coverage. No candidate data or network dependencies are used.

No queue schema, environment, infrastructure or trigger was added. Existing cron
and all disabled external integrations remain unchanged. The unrelated preexisting
`vercel.json` edit is excluded from this handoff. This report is the only operating
document changed, per the worker's explicit ownership scope.

## Validation actually performed

- PASS: `node scripts/job-agent-queue-draining-test.mjs`: three tenants including
  105 older jobs from one tenant; repeated one-run invocation rotation; concurrent
  claims; preserved lease recovery score; expired and replaced owner fencing;
  stale client timestamp at atomic update; four-crash exhaustion; idempotent replay;
  terminal-state non-reclaim; stalled adapter late-write suppression; exhausted budget.
- PASS: `node --experimental-test-module-mocks scripts/job-agent-queue-cycle-test.mjs`:
  real cycle with mocked dependency boundaries; serial maximum concurrency one;
  bounded continuation after individual failure; exhausted deadline and stalled
  maintenance return unknown without starting runs; disabled browser/submission/
  receipt branches; unauthenticated request rejected. Node emits its experimental
  module-mocking warning. This does not validate the mocked configuration modules.
- PASS: syntax checks for all five changed/new worker modules; `git diff --check`.
- PASS: `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run smoke`:
  zero failures, six existing warnings. Direct `node scripts/smoke-test.cjs` also passed.
  The ordinary `npm run smoke` launcher failed because its npm-cli.js path is missing.
- BLOCKED: existing `job-agent-run-test.mjs` and `job-agent-worker-api-test.mjs` could
  not load missing `docx` / `@upstash/redis`. Offline dependency installation with
  scripts disabled failed with ENOTCACHED and cleanup EPERM warnings. No online
  install was attempted. Required broader worker/package regressions and manual
  browser/API smoke remain pending; synthetic cycle coverage is not a substitute.
- The synthetic Redis model does not execute Lua. Server TIME behavior and actual
  atomicity require real isolated Redis verification.

## Limits and explicit staging evidence needed

1. The deadline bounds response waiting and prevents subsequent guarded operations;
   it cannot cancel already-dispatched writes or arbitrary external adapters, and
   cannot preempt synchronous CPU work. A late Redis write may have succeeded even
   though its result was discarded. Reconcile durable state; do not automatically
   replay an ambiguous paid/external action. Existing monetary/idempotency and
   human-approval gates still apply. Verify delayed persistence, dropped responses,
   termination at every lease/finish boundary, and absence of late external action.
2. Rotation avoids a large finite tenant backlog monopolizing the visible queue,
   but is bounded lookahead, not strict distributed weighted fairness. Concurrent
   invocations can serve the same tenant. Each claim can read up to 199 records
   and rotate up to 99 entries; measure Redis commands, latency and queue delay.
   Stale/corrupt records and continuously contended workloads need real-store tests.
3. Per-invocation run concurrency remains one; there is no new distributed worker
   concurrency cap or continuous trigger. Keep any new repeated consumer disabled
   until an isolated host/queue-level concurrency and backpressure integration is
   reviewed. Do not turn up cron frequency as a capacity claim. Strict global fair
   scheduling would require a reviewed tenant scheduling index/atomic integration;
   none was migrated or enabled here.
4. Restore dependencies and run existing worker, run-store, package, consent,
   authorization, spend-ledger, submission and receipt suites. Retain the release
   identity, provider-disabled environment shape, real Redis Lua compatibility,
   clock-skew/expired-lease results, crash/replay evidence and browser/API smoke.
5. Against an approved isolated target, ramp synthetic tenants through the capacity
   plan. Retain per-tenant wait distributions, oldest age from createdAt (not the
   rotated due score), drain rate, rejected/deferred/unknown counts, p95/p99 latency,
   overlap/concurrency, Redis usage and monetary reservations. Prove no lost tasks,
   duplicate effects, starvation or cross-tenant disclosure. Real provider samples
   and activation require separate owner authorization and capped cost evidence.

Temporary `.queue-npm-cache` files remain from the failed offline install because
automatic approval review rejected both recursive and exact-file cleanup with
`blocked by policy`. Exclude them and the incomplete ignored `node_modules` from
integration. No git metadata was changed and no commit was created.

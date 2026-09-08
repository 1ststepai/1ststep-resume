# Shared public employer-feed ingestion: local implementation

## Integration receipt — 2026-09-06 UTC

The four owned module/test/document files were integrated into the canonical checkout after task `shared-public-feed-ingestion-001` reached `ready_for_owner`. Builder and fallback reviewer were both Codex after Claude quota exhaustion: this is not independent cross-provider review. The coordinator inspected the JS/Lua and reran the synthetic ingestion tests and `npm run smoke` on the integrated checkout: passed, zero smoke failures and six existing allowlisted warnings. The implementation handoff below describes its original stage; its request for a peer receipt is fulfilled only by that same-provider review, not by live Redis evidence. No route, cron or environment activation was added. This module is not included in the UI deployment `9ea75ab`.

This module is implemented and disabled by default. It is not connected to any route or scheduler. No deployment, environment inspection/change, Redis request, employer request, paid call, candidate transmission, or infrastructure provisioning was performed for this task. This is not evidence of capacity for 2,000 users.

## Files and local verification

- `lib/public-feed-ingestion.js`: fixed catalog validation, bounded fetch/normalization, refresh and consumer interfaces.
- `lib/public-feed-redis.js`: atomic Lua admission, owner-fenced publication/failure/release, bounded registry and source keys.
- `scripts/public-feed-ingestion-test.mjs`: injected synthetic Fetch responses and an in-memory atomic Redis contract model.
- This document: integration contract, limitations and required staging evidence.

Run `node scripts/public-feed-ingestion-test.mjs`. Tests cover concurrent claims, expired leases, stale publish/release attempts, provider/global admission, provider cooldown without occupying global capacity, numeric/date Retry-After parsing, exponential failure backoff, preservation of the previous snapshot, partial/missing coverage, freshness/expiry, cancellation, hung fetch/body/Redis adapters, malformed/oversized responses, source identity/config rejection, public field projection, and false verification claims. No dependencies were added.

Local results: focused tests passed. Both new modules passed `node --check`. The standard `npm run smoke` launcher failed because it resolved a missing `C:\Users\evanp\AppData\Roaming\npm\node_modules\npm\bin\npm-cli.js`. Running the installed CLI with `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run smoke` passed: zero failures, six existing allowlisted inline-handler warnings. No browser/API test was run: no route, generation/payment workflow or frontend was changed.

The test Redis is a contract model, not a Lua interpreter. Passing it does **not** prove the Lua executes correctly on Redis, distributed capacity, provider throughput, transport cancellation, failover durability, or production readiness. Independent peer review must inspect all four files and run the focused tests and smoke command; that peer receipt is still required.

## Interface

```js
import { createPublicFeedIngestion } from './lib/public-feed-ingestion.js';

// Dependencies are provided by an authorized server integration; importing does no I/O.
const feeds = createPublicFeedIngestion({
  enabled: false, // Only literal true enables reads/refreshes. No new env wiring here.
  redis: injectedRedis, // eval(script, keys, args), matching existing Upstash usage
  fetchImpl: injectedFetch, // Fetch-compatible Response with a readable byte stream
  // catalog defaults to DEFAULT_PUBLIC_ATS_SOURCES; limits are optional bounded integers
});
const ids = feeds.sources.map(source => source.id);
const one = await feeds.read(ids[0]);
const coverage = await feeds.readIndex(ids.slice(0, 10));
// Future service worker only; never pass missions, profiles or tenant state:
const refresh = await feeds.refresh(ids[0], { signal: shutdownSignal });
```

Source IDs have the form `provider:instance:lowercase-slug` and must exist in the immutable configured catalog. Catalog size is 1–100; duplicate identities, unsupported providers, invalid slugs/instances/hosts and extra source fields are rejected. Source validation, public request URLs, posting normalization and provider URL checks reuse `public-ats-discovery.js`; there is no new ATS scraper. The exact catalog spelling, employer and host configuration are part of the registry fingerprint. Provider concurrency conservatively combines global/EU instances.

`refresh` performs one unfiltered public feed GET, disables redirects and credentials, enforces body bytes before JSON parsing, normalizes at most `maxJobs` rows and writes at most `maxSnapshotBytes`. It does no detail fanout, pagination, candidate matching or exact-requisition verification. SmartRecruiters first-page results are partial when `totalFound` exceeds rows or is unknown. Truncation, rejected/duplicate rows and byte truncation produce partial coverage. An invalid feed schema or failed request never replaces the prior snapshot. A valid empty feed is an empty observation, not evidence that all tenant jobs are closed. A partial successful observation can replace the prior snapshot, explicitly marked partial; absence from it cannot establish closure.

Records are reconstructed from a named allowlist of public listing fields; upstream candidate/extra fields and verification claims are not spread into storage. Job URLs discard tracking/query values except exact `gh_jid`/`jid` requisition identity. Catalog/Fetch dependencies must be trusted server configuration, never browser-controlled or candidate-bearing payloads. An allowlist is not semantic PII detection: public title/description strings must actually come from the approved public feed. No candidate profile, resume, mission, answers, tenant IDs, authentication data or application state belongs in this store. Provider errors are reduced to fixed states; raw payloads/errors are not persisted or logged.

Every returned job has `applyPathVerified: false`, `applyPathVerification: 'pending-current-requisition-check'`, and `exactRequisitionRevalidationRequired: true`. Cached feed observation is never a currently verified Apply path. Feed completeness means completeness of the bounded observed feed only; it does not mean the whole market was searched or listing details were enriched.

## Freshness and failure semantics

All timestamps are epoch milliseconds from Redis `TIME`, independent of worker clocks. `observedAt` is conservatively the successful claim's start time; `publishedAt` is publication time. `freshUntil`/`staleAt` and `expiresAt` derive from observation, so slow fetches do not artificially extend freshness. No request starts on import, construction or a consumer read.

| Result | Meaning |
| --- | --- |
| `fresh`, complete coverage | Recent successful feed observation, still requires exact revalidation |
| `partial` | Some selected sources missing/failed, or a feed was bounded/incomplete; usable rows may exist |
| `stale` | Observation older than `freshUntil` but before expiry; per-source coverage can also be partial |
| `unavailable` / `expired` | Expired rows are not returned |
| `unavailable` / `missing` | No retained observation; not proof of zero jobs or closure |
| `unavailable` / `store-unavailable` | Redis timeout/error or registry mismatch; fail closed |
| `unavailable` / `disabled` | Integration deliberately disabled |

`readIndex` returns per-source freshness and coverage so its aggregate `partial` status cannot conceal stale/missing individual sources. It reads selected sources sequentially, at most the registered catalog size (100). Integrations should page at most ten sources per consumer request and cap flattened rows. A failed refresh retains the old snapshot and its original timestamps, and makes an otherwise fresh observation partial. Expiry drops rows at read time; the expired snapshot is retained for a short tombstone interval so readers can distinguish expiry from a never-observed source. After that physical TTL, its state is missing/unknown.

## Redis and scheduling bounds

All keys share the fixed `{public-feed-v1}` Redis cluster hash tag. The registry is one persistent bounded fingerprint/config value, not an append-only dynamic source list. The sequence is one persistent counter. At most 100 registered source identities can create three keys each (lease, latest snapshot, latest status), plus one global admission set and at most four provider sets/cooldowns: at most 311 live key names under the registered catalog. No per-attempt history or candidate indexes are created. Sorted-set members are expiring random lease tokens; expired members are pruned on claim and sets also have physical TTLs.

Defaults: global concurrency 4, provider concurrency 2, lease 30 seconds, fetch/body deadline 10 seconds, individual Redis operation deadline 2 seconds; success polling interval 60 seconds; freshness 5 minutes; logical snapshot expiry 24 hours plus 1 hour tombstone; at most 500 rows, 2 MB response, 1 MB snapshot per source. Settings are finite positive integers with hard upper bounds. The snapshot byte budget includes metadata allowance. Total default snapshot payload retention is at most approximately 100 MB with the maximum catalog; default catalog currently has fewer sources. This is a storage bound, not a memory/latency/capacity measurement.

One Lua operation checks provider cooldown, per-source retry eligibility, existing source lease, and provider/global capacity **before** reserving either slot. Workers defer instead of sleeping while holding capacity. Claim assigns a random owner token plus an increasing fence. Publish, failure and release compare the current expiring owner atomically; expired/replaced workers cannot mutate the snapshot/status or release another owner's slots. Snapshots and status are replaced, never appended. Publication preserves JSON arrays without Redis cjson decode/re-encode of the posting payload, including empty `jobs: []`.

Failures back off exponentially from 5 seconds to 5 minutes, capped at 16 failure-count steps; success resets the streak. A 429 also sets a shared provider cooldown. Retry-After accepts delta seconds or an HTTP date, evaluated against Redis time, and never shortens an existing provider cooldown. Retry-After is bounded by the configured `retryMaxMs` (default 24 hours, maximum seven days); unusually longer directives need operator policy before enabling that provider. There is no in-call retry. The future scheduler must return deferred work later, honor cooldowns and apply its own bounded invocation/daily request budget. This module implements concurrent admission and minimum source intervals, not a distributed daily request ledger.

Crash recovery relies on lease and admission TTLs. No heartbeat/lease extension is implemented: a fetch must finish inside its short deadline, or a later worker can reclaim after lease expiry. Redis timeouts fail closed without retrying ambiguous operations; a claim whose response is lost may temporarily occupy slots until TTL. An unknown publication response is not proof it failed; re-read the snapshot before scheduling further work. Cancellation is honored before publishing; once the atomic publish request is dispatched, cancellation cannot retract a committed snapshot.

Abort is best effort at the Fetch/transport boundary. A dependency that ignores AbortSignal, a paused process, or an in-flight Redis command can outlive a local deadline. Owner checks still fence later publication, but lease admission is **not proof** that physical provider connections cease at expiry. Production dependencies need finite transport deadlines, no opaque automatic retries, bounded response decompression, and verified abort/connection teardown. Redis must retain the registry and use suitable no-eviction/durability settings; evicting configuration or losing acknowledged writes invalidates the distributed guarantees. Registry/config changes intentionally fail closed instead of opening a second capacity namespace. A catalog/limit change needs an owner-reviewed maintenance procedure: stop all workers, wait for leases and transport deadlines, retire this namespace's retained data/registry, then restart consistent configuration. No registry reset/migration tool is provided or authorized here.

## Concrete future integration steps (not performed)

1. In a separately authorized change to `api/concierge-discovery.js`, preserve authentication, origin checks, request bounds, account/global rate limits and response compatibility. Construct the service from one reviewed server catalog and Redis adapter; keep a new integration gate false until staging passes. Never accept catalog, hosts, Redis keys or shared-record fields from `req.body`.
2. Replace per-tenant bulk feed polling in the enabled branch with bounded `readIndex` pages. Carry source coverage/freshness into `sourceSummary`, partial/error status and UI behavior. Do not make a cache miss trigger per-user employer fetches. Missing feeds remain unavailable, not empty-market success. Filter/rank public observations with the existing deterministic mission functions in tenant scope after reading the shared index; candidate mission data never enters this module.
3. Keep exact requisition revalidation through existing `reverifyPublicJob` and package-binding/fingerprint logic before packaging and again before any candidate transmission. Greenhouse feed rows intentionally lack detail content because the existing list URL requests `content=false`; do not invent detail data or treat a cache row as package-ready. Never bypass tenant-scoped canonical identity/idempotency reconciliation before creating durable campaign/job/application records. The shared index is neither that ledger nor a replacement for it.
4. Add a separate protected, disabled-by-default worker with explicit catalog traversal/cursor, at most ten source attempts per invocation, bounded wall time/concurrency and global daily request budget. Call `refresh` with source IDs only; pass shutdown signals. Schedule using deferred retry times and bounded fair rotation so unavailable providers do not starve others. Do not run a polling loop per tenant. Preserve existing cron/auth/consent and paid-boundary controls in their own workflows.
5. Emit content-free counts only: observed/partial/stale/missing sources, admissions/deferred/429/timeouts/lease-lost outcomes and aggregate bytes/latency. Reconcile cache coverage and request budgets before any capacity statement. Add route/worker/browser compatibility tests in that future change, including no automatic per-tenant fallback storm.

## Exact staging validation still required

With separate owner approval, use an isolated Redis database and synthetic Fetch responses only. Run the **actual exported Lua** via the intended Upstash-compatible adapter from at least two separate Node processes; do not substitute this test's model. Retain content-free outcomes and Redis version/adapter configuration.

1. Simultaneously claim one source 100 times; exactly one claim must succeed. Publish an empty feed and a Unicode/nonempty feed; read valid arrays and identical allowed records. Check EVAL/TIME support, string result handling, PX TTLs, same-slot placement and no cjson empty-array regression.
2. Stall worker A beyond the 30-second lease; let B claim/publish. Resume A's publish/failure/release, including after B claims but before B publishes. All A mutations must return lease-lost; B's lease and snapshot must remain intact. Kill a process after claim and verify source/provider/global capacity recovers after TTL with no cleanup call.
3. Across at least four sources/two providers, hold synthetic fetches open and contend from both processes. Observe at most configured global/provider **live leases** atomically. Return a 429 numeric/date response, verify other sources for that provider defer while another provider can claim the freed global slot, and verify an older cooldown cannot shorten a newer one. Do not equate leases with physical network capacity.
4. Publish success, then inject 503/malformed/oversized/timeout/cancellation responses and a partial SmartRecruiters page. Verify last successful snapshot preservation on failed requests, unchanged observation expiry, explicitly partial page coverage, and no false closure or verification claim. Wait through reduced staging freshness/expiry/tombstone settings and verify transitions plus actual key disappearance.
5. Delay/drop Redis responses before and after script commit. Verify fail-closed unknown outcomes, no automatic command retries, fencing after lease replacement, bounded caller deadlines, and temporary lost-response slots recovering. Test adapter Fetch AbortSignal handling with a local synthetic streaming HTTP server and count sockets after timeout; this is needed to establish physical teardown separately from Redis lease correctness.
6. Attempt divergent catalogs/limits and unregistered identities; ensure rejection with no capacity multiplication. Stress the maximum catalog/row/byte bounds and verify bounded key count, set cardinality, script duration, retained bytes and reader memory. Test Redis restart/failover/eviction behavior under the actual service configuration and document any loss of acknowledged registry/fence writes. No distributed guarantee is established without these results.

Retain a peer review that inspects Lua as well as JS, reruns local tests, and evaluates the above staging results before wiring or enabling integration. No staging evidence or peer approval is claimed by this implementation handoff.

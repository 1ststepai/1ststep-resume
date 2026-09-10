# Job Agent implementation roadmap

No large implementation is authorized by this audit. Each package below is independently reviewable and must retain deployment, migration, provider-cost, personal-data transmission, and submission approval gates.

## Wave 0 — evidence and convergence

### JA-001 — Fix and baseline the Job Agent browser harness

- **Objective/User problem:** restore reproducible proof for the main subscriber journey.
- **Existing/target:** 41 tests stall around static server startup; suite completes on a unique isolated port with cleanup.
- **Architecture/files:** `playwright.config.mjs`, `scripts/static-test-server.mjs`, test scripts only.
- **Data/API/extension/UI:** none.
- **Tests:** repeated cold runs, forced failure cleanup, Windows CI.
- **Security:** no real credentials or user data.
- **Rollout/rollback:** test-only; revert config.
- **Dependencies/complexity/priority:** none / S / P0.
- **Success:** three consecutive complete runs, no orphan listener.
- **Must not change:** production routes, app behavior, migrations.

### JA-002 — Create release-bound evidence manifest

- **Objective:** bind commit, build assets, migration digest, extension version/digest, Vercel deployment, feature flags, and rollback.
- **Existing/target:** multiple documents/snapshots -> one signed content-free manifest.
- **Files:** existing release-preflight/manifest scripts and `docs/production-readiness/`.
- **Tests:** reject dirty tree, hash mismatch, stale evidence, wrong deployment.
- **Complexity/Priority:** M / P0.
- **Success:** source/live parity can be decided from one artifact.
- **Must not change:** production environment or deploy automatically.

## Wave 1 — canonical data and read model

### JA-003 — Define ApplicantKnowledge and CareerProfile schema

- **Objective:** one versioned source for facts/preferences/answers/provenance.
- **Existing/target:** encrypted vault plus legacy browser state -> canonical relational metadata with encrypted values/object refs.
- **Files:** new timestamped migration, `lib/postgres-tenant-store.js`, vault/domain modules, schema tests.
- **Database:** fact versions, evidence refs, reuse scope, verification/expiry/sensitivity; preserve existing IDs.
- **API:** additive read/write projection; no browser values in logs.
- **Migration:** isolated staging first; no production apply without approval.
- **Tests:** RLS, cross-tenant, optimistic concurrency, revoke/export/delete, restore.
- **Security:** forced RLS and backend-only grants.
- **Rollback:** additive tables/dual read; disable flag.
- **Complexity/Priority:** L / P0.
- **Success:** signed user restores same profile on a new device.
- **Must not change:** application submission, extension permissions.

### JA-004 — Import and reconcile legacy browser data

- **Objective:** preserve resume/profile/tracker/history without trusting labels.
- **Files:** new importer UI/module/API; account export; legacy code read-only adapters.
- **Database:** import batch and reconciliation status.
- **Tests:** duplicates, malformed backup, conflicting/newer server data, applied-without-receipt.
- **Rollout:** opt-in cohort; keep original export and local state until acknowledgement.
- **Rollback:** turn off importer; no source deletion.
- **Complexity/Priority:** L / P0.
- **Success:** zero silent loss and zero imported false Submitted.
- **Must not change:** current legacy write paths until parity.

### JA-005 — Unify subscriber My Jobs read model

- **Objective:** one projection for discovery, packages, applications, human actions, receipts, and outcomes.
- **Files:** `lib/subscriber-ui-model.js`, application/job stores, `/api/concierge-state`, client model/tests.
- **API:** versioned projection with plain labels and exact next action.
- **Tests:** stale client, partial store outage, receipt-only counts, pagination.
- **Complexity/Priority:** M / P0.
- **Success:** UI no longer merges authoritative status from localStorage.
- **Must not change:** state transition domain rules.

## Wave 2 — policy and readiness

### JA-006 — Implement versioned AutomationPolicy evaluator

- **Objective:** deterministic reject/review/ask/prepare decisions with rule trace.
- **Files:** new policy domain plus existing relevance/throughput/consent integration.
- **Database/API:** policy versions and evaluation result references.
- **Tests:** salary/location/travel/sponsorship/exclusion/duplicate/unknown; property tests.
- **Security:** protected traits prohibited.
- **Rollback:** shadow-only flag then decision flag.
- **Complexity/Priority:** L / P0.
- **Success:** every decision has deterministic reasons and exact versions.
- **Must not change:** final submission gate.

### JA-007 — Build capability readiness calculator

- **Objective:** replace global/vanity readiness with job-segment prerequisites.
- **Files:** extend `lib/job-agent-capabilities.js`, new profile/policy coverage modules, subscriber projection.
- **Tests:** hard blockers, unknown coverage, stale evidence, adapter/version mismatch.
- **Rollout:** show statuses/reasons first; percentage flag off until coverage data exists.
- **Complexity/Priority:** M / P1.
- **Success:** top three tasks state exact capability impact.
- **Must not change:** authorization semantics.

### JA-008 — Add canonical question classifier and scoped answer lookup

- **Objective:** stop repeated equivalent questions safely.
- **Files:** extend `lib/application-answer-memory.js`; new canonical concept registry/classifier.
- **Data:** canonical question ID, scope, sensitivity, expiry, source/version.
- **Tests:** paraphrases, employer-specific why, contradictions, salary context, demographics, OTP/secret rejection.
- **Rollout:** suggestion-only, then exact low-risk reuse.
- **Complexity/Priority:** L / P1.
- **Success:** fewer repeat questions with no consequential silent reuse.
- **Must not change:** final approval or employer transmission.

## Wave 3 — scale discovery and preparation

### JA-009 — Shared public-feed ingestion

- **Objective:** avoid per-user fan-out across 37 sources.
- **Files:** existing `public-feed-*`, ATS discovery, worker/store modules.
- **Data:** public-only job/source versions and freshness; no candidate data.
- **Tests:** global/provider leases, 429/backoff, partial feeds, stale expiry, exact re-verification.
- **Rollout:** shadow compare, then read flag by provider.
- **Complexity/Priority:** L / P0 for scale.
- **Success:** >=95% roles filtered/deduped model-free; bounded provider requests.
- **Must not change:** package authority check.

### JA-010 — Continuous fair tenant queue draining

- **Objective:** replace twice-daily recovery cadence as the effective background engine.
- **Files:** worker/schedule/run stores, metrics, deployment worker config.
- **Tests:** fairness, lease expiry, crash, backpressure, quota, authorization revocation.
- **Rollout:** isolated staging; capped pilot concurrency.
- **Complexity/Priority:** L / P0 for scale.
- **Success:** bounded queue delay with no lost/duplicate work.
- **Must not change:** cost caps or ambiguous paid retry behavior.

### JA-011 — Career evidence selection and package orchestration

- **Objective:** automate resume strategy from verified facts.
- **Files:** package worker, profile retrieval, source-map/QA/render modules.
- **API:** package request references job/profile/policy versions, not raw browser claims.
- **Tests:** unsupported numbers, source order, correction invalidation, cache/idempotency.
- **Complexity/Priority:** L / P1.
- **Success:** one truthful package per canonical version, concise review diff.
- **Must not change:** fact verification states.

## Wave 4 — controlled execution

### JA-012 — Formal adapter SDK and Greenhouse conformance

- **Objective:** make existing Greenhouse path the reference adapter.
- **Files:** extension adapter modules, execution-task contract, conformance fixtures.
- **API:** immutable task and value-free schema protocol.
- **Tests:** DOM variants, partial fill, navigation change, mismatch, tab close, version drift.
- **Rollout:** controlled beta, no submit.
- **Complexity/Priority:** L / P0 execution.
- **Success:** measured fill success and zero unauthorized fields.
- **Must not change:** extension host permissions beyond reviewed need; submit disabled.

### JA-013 — Release source-aligned extension package

- **Objective:** eliminate 1.3.2 store / 1.4.0 source drift.
- **Files:** extension package docs/build digest only as required by store review.
- **Tests:** reproducible package, permissions/listing/privacy parity, install/update.
- **Rollout:** staged Web Store submission requires explicit authorization; verify final listing/version.
- **Complexity/Priority:** S-M / P0.
- **Success:** store, server allowlist, and source share exact version/digest/capability copy.
- **Must not change:** add permissions or submission capability.

### JA-014 — Lever supervised-fill adapter

- **Objective:** expand one ATS at a time.
- **Dependencies:** JA-012 and observed Greenhouse metrics.
- **Files:** new adapter and fixtures; server allowlist/feature flag.
- **Tests:** conformance/security/live-safe read-only/synthetic fill.
- **Rollout:** per-adapter pilot; instant disable.
- **Complexity/Priority:** L / P2.
- **Success:** acceptable success/partial/unknown thresholds defined before launch.
- **Must not change:** submission and receipt semantics.

## Wave 5 — receipts, learning, and UX retirement

### JA-015 — Expand authoritative receipt connectors

- **Objective:** turn submission attempts into verified outcomes without optimistic labels.
- **Files:** receipt evidence providers/workers and application domain.
- **Tests:** spoofing, replay, wrong requisition/document, delay, missing receipt, ambiguous outcome.
- **Complexity/Priority:** L / P0 before submission.
- **Success:** coverage and verification delay measured by channel.
- **Must not change:** definition of Submitted.

### JA-016 — Learning proposals from corrections/outcomes

- **Objective:** improve future decisions without silent profile mutation.
- **Files:** learning domain/store/worker and Career Profile review UI.
- **Tests:** correction attribution, conflicting proposal, protected trait exclusion, rollback.
- **Complexity/Priority:** M / P2.
- **Success:** accepted/rejected proposals and reduced repeat corrections.
- **Must not change:** verified fact without user/source verification.

### JA-017 — Contextualize and retire duplicate legacy navigation

- **Objective:** move resume/search/tracker/positioning/interview functions behind Home/My Jobs/Saved Info.
- **Files:** `app.html`, `app.js`, `concierge.html/js`, extracted modules and flags.
- **Tests:** migrated/unmigrated users, mobile, keyboard/accessibility, rollback.
- **Rollout:** cohort flag; preserve advanced workspace.
- **Complexity/Priority:** L / P1 after JA-004/005.
- **Success:** reduced clicks/navigation without lost capability or data.
- **Must not change:** legacy data deletion until migration acknowledged.

## Feature flags

Use scoped flags: `career_profile_read`, `legacy_import`, `canonical_my_jobs`, `automation_policy_v1`, `capability_readiness`, `shared_feed_ingestion_<provider>`, `adapter_<provider>_fill`, `legacy_workspace_advanced`, and eventually `adapter_<provider>_submit`. Flags do not substitute for permissions or evidence.

## Codex execution contracts

These are draft tasks pending architecture approval. Each is deliberately bounded.

| Task | Scope | Acceptance criteria | Required tests | Files expected to change | Files that must not change | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| JA-001 | Browser harness lifecycle only | 3 cold runs complete; no orphan listener | startup, failure cleanup, Windows CI | Playwright config/static server/tests | app/API/migrations | revert test config |
| JA-002 | Content-free release manifest | exact source/deploy/migration/extension/rollback binding | dirty/stale/hash/wrong-deploy rejection | release scripts/evidence docs | product behavior/env values | ignore/remove additive manifest |
| JA-003 | ApplicantKnowledge schema/projection | cross-device versioned profile, forced tenant isolation | RLS, cross-tenant, conflict, revoke/export/delete/restore | new migration, profile/store/API/tests | submission/extension | feature off; dual-read old vault |
| JA-004 | Legacy import/reconciliation | no silent loss; no false Submitted | corrupt/conflict/duplicate/applied-without-receipt | importer/API/UI/tests | legacy source deletion | disable import; retain original data |
| JA-005 | Canonical My Jobs projection | one server projection wins over stale client | partial outage, pagination, receipt counts | subscriber model/state API/client/tests | domain transitions | switch projection flag off |
| JA-006 | AutomationPolicy evaluator | deterministic reason/version for every decision | rule/property/protected-trait cases | policy domain/store/tests | final submission gate | shadow-only/off |
| JA-007 | Capability readiness | status and exact blockers; no percentage on unknown coverage | hard blocker/stale/adapter mismatch | capabilities/projection/UI/tests | permissions | flag off |
| JA-008 | Question concepts/scoped reuse | safe paraphrase match; consequential reuse remains confirmed | contradiction/scope/expiry/sensitive/OTP | answer-memory/classifier/tests | transmission/approval | suggestion-only/off |
| JA-009 | Shared public feed | public-only index; bounded requests; exact package recheck | lease, 429, partial, stale, dedupe | public-feed/discovery/store/worker/tests | candidate stores/package authority | provider read flag off |
| JA-010 | Fair queue drain | bounded delay; no lost/duplicate claims | fairness, crash, backpressure, revoke | run/schedule/worker/metrics/tests | spend caps/retry policy | revert consumer; retain cron recovery |
| JA-011 | Evidence-driven package | one truthful package/version and concise diff | source map, unsupported claim, cache/idempotency | package/profile/QA/tests | verification states | package orchestration flag off |
| JA-012 | Adapter SDK + Greenhouse | existing flow passes conformance and failure tests | DOM variants, tab loss, partial fill, schema/version drift | extension adapter/task contract/tests | host permissions/submit | disable adapter version |
| JA-013 | Extension 1.4 release artifact | store/source/server exact version+digest+copy | reproducible build/install/update/privacy | extension docs/build digest | permissions/submit | roll server allowlist back |
| JA-014 | Lever supervised fill | synthetic/live-safe conformance thresholds met | adapter/security/drift/partial fill | new Lever adapter/flag/fixtures | submit/receipt semantics | disable Lever flag |
| JA-015 | Receipt connectors | spoof/replay resistant and exact identity matched | wrong job/doc, delay, ambiguity, replay | receipt providers/workers/tests | Submitted definition | disable connector |
| JA-016 | Learning proposals | no silent verified-fact mutation | conflict/protected trait/accept/reject/rollback | learning/profile review modules | fact state without confirmation | disable proposal generation |
| JA-017 | Legacy navigation retirement | fewer actions with parity for migrated/unmigrated users | desktop/mobile/a11y/data/rollback | app/concierge/extracted UI modules | legacy data deletion | cohort flag off |

## Production submission gate

Do not enable any `*_submit` flag until counsel/employer terms, adapter reliability, final-action authorization, teardown/recovery, receipt coverage, monitoring, cost, rollback, and signed release evidence are all current for that exact adapter/version. Green tests alone are insufficient.

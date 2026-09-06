# 2,000 concurrent-user readiness

Assessment: 2026-09-05. Status: NOT VERIFIED; production approval blocked.
This is a capacity target, not a guarantee of uninterrupted service. No deployment,
environment mutation, external load test, or paid AI request was performed.

Local verification: `npm run test:web-release` passed, including the local Vercel
production-output build (55 intentional static assets, 41 API functions, no source
or extension-package leaks). `npm run smoke` passed with six existing allowlisted
inline-handler warnings. The focused Playwright test passed, including mobile
overflow and page-error checks. `npm run build` and `git diff --check` passed.
`npm run audit:production-readiness` passed its 13 deterministic controls while
explicitly retaining three Critical production layers. None of these tests is a
2,000-user load test. Existing unrelated worktree edits were preserved; no commit
or release artifact identity is claimed for this dirty checkout.

## Verified local corrections

- Browser discovery allowance: 40 seconds, beneath the existing 45-second function ceiling.
- Discovery network work shares a 32-second deadline (including response-body reads
  through native fetch cancellation); queued requests do not start after expiry.
- Requisition verification runs at eight concurrent requests per invocation instead
  of launching up to 100 together. This is not a distributed concurrency limit.
- Successful verified results survive failures; partial coverage is explicitly marked.
- Browser retry remains user initiated; no paid or employer action is retried by this change.
- `node scripts/discovery-capacity-test.mjs` uses synthetic dependencies to check
  bounded concurrency, deadline cancellation, and verified partial results. It is
  included in `test:resilience` and therefore `test:web-release`.
- `npx playwright test scripts/discovery-retry-browser.spec.mjs --workers=1`
  verifies timeout copy, restored retry controls, preserved onboarding, and partial
  result messaging. The browser deadline is accelerated only inside this fixture.

## Open blockers and exact next work

| Priority | Evidence / gap | Required work before 2,000-user approval |
| --- | --- | --- |
| P1 | Readiness checker reports three Critical layers: storage, security/RLS, recovery. Existing documents are historical, not fresh infrastructure proof. | Select an isolated deployment/database target. Run the existing database runtime, cross-tenant, and restore evidence contracts against that target; retain results bound to the release. |
| P1 | `concierge-discovery` fans out per user across a 37-source default catalog; per-invocation limits multiply with users. | Build scheduled public-feed ingestion with a shared public-only index, distributed leases, bounded global/provider concurrency, freshness timestamps, upstream Retry-After/backoff, and stale-result labels. Never cache candidate data in the shared index. Reverify the exact requisition before packaging/transmission. |
| P1 | `job-agent-worker` processes at most three runs per invocation (default one); current cron is twice daily. | Add a queue consumer with continuous bounded draining, fair tenant scheduling, leases and recovery. Measure queue delay and drain capacity; do not increase cron frequency alone and assume capacity. |
| P1 | Controlled-pilot admission supports at most ten invited users. | Build/review a separate subscription admission policy with signed entitlement and billing lifecycle tests; retain pilot restrictions until that release is verified. |
| P1 | Live Vercel, Redis/database, and AI quotas, regions, provider billing limits, and signed-user capacity are unverified. | Record exact quotas and approved cost ceilings; exercise synthetic signed users in isolated staging before expanding admission. |
| P2 | Existing global discovery default is 5,000 requests/day. Approved historical monetary profile was $5/day; current values were not inspected. | Model per-user usage and reconcile actual operator-approved budgets. At 2,000 users, 5,000 discovery calls allow only 2.5 calls/user/day; a $5 budget is $0.0025/user/day. These are arithmetic examples, not current capacity measurements. |
| P2 | Browser regression covers retry, not all subscriber flows under load. | Run the complete signed-user onboarding, persistence, package, billing, revocation and reload suite against the release candidate. |

## Staging acceptance proposal (requires an isolated target and cost approval)

Distinguish 2,000 open sessions from 2,000 simultaneous AI generations. Target the
former with a realistic mix, and test the latter as an overload/backpressure case.

1. Synthetic providers first: ramp 50 → 200 → 500 → 1,000 → 2,000 sessions.
   Hold the peak for 30 minutes; include cold starts, reconnects and a traffic burst.
2. Proposed mix: 70% public navigation, 20% authenticated state reads, 8% discovery,
   2% package requests. Report arrival rate and think time, not just virtual users.
3. Proposed acceptance: public p95 <1 second, state p95 <2 seconds, queue admission
   p95 <2 seconds, unexpected 5xx <0.5%, no lost/duplicate jobs or tenant leakage.
   Record 429/503 deferrals separately so rejecting users cannot count as throughput.
4. Inject Redis/provider failure, provider 429, expired leases, duplicate requests,
   and worker termination. Verify recovery, fair service and no ambiguous paid retries.
5. Run a separately capped real-provider sample; capture p50/p95/p99 latency,
   queue depth/wait/drain, function concurrency, database connections, Redis commands,
   AI RPM/TPM, reserved/settled spend, and content-free error counts.
6. Stop on tenant leakage, duplicate external actions, uncontrolled spend, sustained
   unexpected errors, or queue growth without drain. Retain signed capacity evidence
   using the repository's existing verifier before requesting release approval.

## DeepSeek

No DeepSeek API key is required for this architecture. `lib/ai-provider.js` supports
Anthropic, OpenAI-compatible, Cloudflare and optional DeepSeek. Discovery is model-free.
DeepSeek routing requires its own key plus explicit enabled/approved/version controls,
and is limited to routine tasks; candidate-sensitive document tasks cannot use that
route. A cheaper model does not resolve queue, database or upstream-feed capacity.
No provider configuration was changed or provider quality benchmark claimed.

# Analytics and observability plan

## Current evidence

Public app configuration reported analytics disabled during this audit. Therefore feature usage, funnel timing, application actions, and time saved are unknown. The product has content-free operational metrics modules, but protected live worker/dependency evidence was not accessible anonymously.

## Privacy-safe product events

| Event | Required properties | Never include |
| --- | --- | --- |
| `setup_started/completed` | anonymous/session cohort, step count, duration, resume path | resume text, email |
| `first_verified_job_shown` | elapsed time, source family, freshness bucket | title/employer tied to person |
| `job_rejected_by_policy` | rule code, source family | candidate values |
| `package_started/ready/needs_you` | duration, QA codes, model tier, cache hit | document text |
| `human_action_opened/resolved` | action type, age, resolution path | question/answer text |
| `adapter_fill_started/completed` | adapter/version, field counts, duration, safe failure code | field values, URL path if identifying |
| `submission_attempted` | adapter/version, attempt ID, outcome class | candidate values |
| `receipt_verified` | evidence channel, delay | raw receipt |
| `application_outcome` | user-confirmed/authoritative source, stage | sensitive notes |
| `authorization_revoked` | capability, policy version | reason text unless explicitly supplied |

## Core business metrics

- Time to first verified suitable job.
- Time to first Package Ready.
- Time to receipt-verified Submitted.
- Qualified jobs per verified source scan.
- Package Ready / qualified job.
- Needs You actions per application and median age.
- Human active minutes and actions per application.
- Receipt-verified submissions, interviews, offers, and accepted offers.
- Duplicate prevention and stale/closed-job rejection rate.
- Adapter fill success, partial, schema-changed, and outcome-unknown rates by version.
- Fact correction rate and generated-claim rejection rate.
- AI calls/tokens/cost per qualified job and per Package Ready.
- Queue delay, lease recovery, retry, provider circuit, and spend-reservation reconciliation.

## Human time saved

Estimate from measured baseline task durations, then subtract actual active user time. Show ranges and method. Never claim saved time from background status alone. Example:

```text
time_saved = baseline_median_for_completed_tasks - observed_active_user_time
```

## Trust dashboard

Track receipt-only Submitted integrity, unverified claim blocks, cross-tenant test results, ambiguous outcome backlog, extension/server version mismatch, stale jobs, and revoked permissions. These are release and safety metrics, not marketing counters.

## Retention and access

- Keep telemetry content-free, pseudonymous, tenant-partitioned where needed, and retention-limited.
- Separate subscriber analytics from operator security evidence.
- Document opt-out/deletion behavior and include telemetry references in account export where legally required.

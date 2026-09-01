# Job Agent continuous improvement

## Architecture

The controlled learning layer extends the existing signed-user, Upstash Redis, encrypted-envelope, and cron-worker architecture. It does not replace the Applicant Vault, campaign tracker, application state machine, receipt verifier, or public ATS adapters.

1. A verified direct-employer discovery run completes independently.
2. Its content-free source summary is recorded in the tenant's encrypted learning profile.
3. The daily leased worker reviews verified signals, source performance, and any pending proposal.
4. Low-risk proposals are evaluated against the fixed safety dataset before promotion.
5. High-risk proposals remain in the Learning Center until explicit user approval.
6. Scheduled discovery applies active, user-confirmed preferences before creating the next run.

Discovery remains authoritative if learning is unavailable. Learning never submits an application, transmits candidate data, enables employer-browser execution, or changes the meaning of `Submitted`.

## Persistence

The beta implementation uses `1ststep:job-agent-learning:v1:tenant:<tenant-id>` with AES-256-GCM envelope encryption, tenant-specific additional authenticated data, compare-and-set versions, idempotency records, a due index, and recoverable leases. Records expire after 365 days unless updated or explicitly deleted.

`migrations/002_job_agent_continuous_improvement.sql` defines the production relational projection for preferences, corrections, source performance, verified signals, proposals, evaluations, and policy versions. Tenant tables force row-level security. Shared source identities contain hashes rather than candidate values.

## Signals

Accepted signals must be user-confirmed, direct-employer verified, provider-confirmed, or backed by an authoritative receipt. Demo activity, protected traits, unverified outcomes, abandoned forms, credentials, OTPs, CAPTCHA answers, government identifiers, and unnecessary medical data are rejected.

## Promotion and rollback

- Auto-promotion is limited to query weights, title synonyms, source priority, retry windows, and freshness weights.
- Every fixture and safety assertion must pass; one failure blocks promotion.
- Candidate facts, hard filters, compensation, geography, remote rules, screening answers, legal certifications, privacy, transmission, submission authority, attestations, and signatures require human approval.
- `JOB_AGENT_LEARNING_ENABLED=false` is the global execution kill switch.
- `JOB_AGENT_LEARNING_AUTO_PROMOTION_ENABLED=false` independently blocks automatic promotion.
- User pause, one-click rollback, automatic regression rollback, export, and deletion are available through the authenticated Learning Center.

## Source expansion

Greenhouse, Lever, Ashby, and SmartRecruiters remain the only operational public adapters. Exhaustion first proposes missing reviewed public adapters. Workday, iCIMS, Eightfold, Rippling, and SilkRoad remain `operator-review-required`; the system does not scrape or activate them from a model suggestion. Third-party leads must resolve to an active direct-employer requisition before packaging.

## Local verification

```powershell
npm run test:continuous-improvement
npm run test:web-release
npm run test:browser:vault
```

The implementation does not require paid APIs or external applications for these tests. Production activation requires an approved environment change, migration review/application, retention/privacy review, and a controlled preview followed by Evan's deployment approval.

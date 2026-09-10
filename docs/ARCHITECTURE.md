# 1stStep.ai Architecture

## Source topology and deployment targets

`https://github.com/1ststepai/1ststep-resume` is the source of truth for the four product surfaces.

| Product | Source | Production target | Current verified release state on 2026-09-10 |
|---|---|---|---|
| App and APIs | Repository root, `api/`, `lib/`, `client/`, `concierge.*`, `app.*` | Vercel `1ststep-resume`; alias `app.1ststep.ai`; output `.public-web` | Ready production deployment observed; current runtime dependencies not authenticated in this pass |
| Chrome extension | `1ststep-extension/` plus controlled-build scripts and app APIs | Chrome Web Store item `gnbjcmennlcbkmakameknfcnioohnjkp` | Store v1.3.2; main v1.5.0; PR #72 v1.6 source assembled on the consolidated release branch |
| Resume site | `resume-tailor-landing/standalone/` | Vercel `1ststep-resume-landing`; alias `resume.1ststep.ai` | Ready static production deployment observed |
| Partner site | `partners-landing/` plus authenticated `/partner`, `api/partner.js`, and `lib/partner-account.js` | Vercel `1ststep-growth-finder` for the public landing; authenticated role workflow ships with `1ststep-resume` | Public production landing observed; authenticated partner workflow is release-candidate source only and is not production-verified |

The nearby `main-website` and `comission` repositories are not release sources for these four surfaces. `release-job-agent-20260907` has no valid HEAD and is not authoritative. Dated worktrees are candidate history, not deployment truth.

## Runtime components

- Static browser clients are built by `build-public-web.mjs` into the allowlisted `.public-web` directory.
- Vercel functions in `api/` expose authentication, subscription/access, Job Agent runs, applicant vault, application packages/sessions, account lifecycle, readiness/operations, webhooks, and supporting routes.
- Domain and infrastructure boundaries live in `lib/`; browser-facing presentation/domain helpers live in `client/`.
- Upstash Redis is the current encrypted operational store for opaque sessions, vault/job-agent records, queues, indexes, idempotency, rate limits, and short/medium-retention workflows.
- PostgreSQL/Neon migrations define the canonical tenant identity, applicant profile/facts, discovered jobs, applications, document versions, human actions, workflow operations/events, and audit records. RLS is enabled and forced for tenant tables using the transaction-local `app.tenant_id` and restricted `job_agent_backend` role.
- Private generated artifacts may use configured Vercel Blob or Cloudflare R2 boundaries; paid storage, malware scanning, and isolated rendering remain explicit gates.
- Clerk verifies browser identity. Stripe, Resend, GoHighLevel, Tally, AI providers, and optional browser/render/storage providers are isolated behind server routes and approval/configuration gates.

Checked-in schema and migration parity do not prove that production has the role, RLS, schema, grants, backfill, or usable credentials. Those facts require isolated runtime evidence.

## Authentication flow

1. The app loads public Clerk configuration from the server and uses the fixed `clerk.1ststep.ai` origin.
2. Clerk completes sign-in and returns a token to the login page only.
3. `POST /api/user-session?action=clerk-exchange` verifies issuer/audience/origin, applies pre-auth rate limits, derives a pseudonymous tenant ID, and binds the Clerk subject to that tenant in PostgreSQL.
4. The server creates a random opaque session backed by an encrypted Redis record and returns a host-only Secure HttpOnly SameSite cookie. JavaScript receives only minimized session/capability state.
5. App APIs recheck exact origin, session, entitlement/pilot admission, policy/consent level, tenant ownership, input shape, idempotency, and rate limits.
6. Current-device and all-device sign-out revoke server sessions. Sensitive lifecycle actions require a recent opaque session.
7. The extension content script on `app.1ststep.ai` may synchronize minimized capabilities through Chrome messaging; it never receives or stores the cookie/token.

Legacy signed tier bearer tokens remain a server-side migration compatibility path in some APIs. The consolidated browser client no longer stores, exports, or transmits that credential; Job Agent data routes require the opaque session.

## Extension capture flow

### Released/main behavior

The user invokes capture on a supported page. The content script extracts bounded job data, sends it to the background worker, and receives an exact capture ID. The background worker serializes storage mutations and opens an app URL containing that ID. The app-origin bridge posts only the matching capture into the page. Main currently persists the handoff in session storage before acknowledgement; this survives refresh in the tab but is not account-backed cross-session persistence.

### Consolidated v1.6 candidate behavior

Before acknowledgement, the app sends the exact capture to authenticated `/api/captured-jobs`. That route requires an opaque session and data-consent policy, rate-limits requests, verifies a supported public ATS source when possible, encrypts the record in a tenant-scoped Redis key, and atomically makes capture-ID replay return the existing record. A verified listing is promoted into the existing direct-employer discovery/My Jobs flow with a stable `capture_<id>` idempotency key. The app can restore the exact durable capture after the transient extension copy is gone. Records expire after 90 days and participate in account export/deletion.

PR #72's durable-capture source is preserved in `release/consolidated-job-agent-v1.6-20260910` together with current main, trust remediation, security fixes, and release documentation. The candidate must not be called released until a real signed-in capture is verified through My Jobs, refresh, sign-out/sign-in, duplicate replay, failure behavior, deployment parity, controlled artifact digest, and Chrome Web Store publication.

## Data ownership and authorization boundaries

| Data class | Durable owner | Isolation and controls |
|---|---|---|
| Identity and session | Clerk plus app session store; Postgres identity binding | Opaque cookie, encrypted record, subject-to-tenant HMAC, rate limits, revocation |
| Confirmed applicant facts and reviewed resume | Applicant vault | Tenant-scoped encryption, versioning, optimistic concurrency, explicit consent, export/deletion, prohibited-secret rejection |
| Jobs, packages, application sessions, actions, receipts | Job Agent durable stores; canonical Postgres model when independently activated | Tenant-scoped IDs, exact source/version binding, idempotency, encrypted payloads, append-audit, receipt-only Submitted |
| Extension capture | Temporary Chrome storage until durable app acknowledgement; PR #72 app record afterward | Exact capture ID, app-origin bridge, no auth token in extension, encrypted tenant record, bounded retention |
| Generated files | Tenant-owned private artifact boundary | Integrity hashes, signed downloads, malware/render gates, no public cache |
| Partner role and application | Encrypted `partner:v2:*` Redis records keyed by an HMAC of the verified Clerk subject | Separate from applicant vault, résumé, My Jobs, entitlement, and payout data; explicit existing-user or affiliate-only consent; administrator-only approval; included in account export/deletion |
| Partner prospect drafts | Public partner landing localStorage | Browser-local and non-authoritative; no identity, approval, referral-code issuance, job-seeker access, or commission state |
| Public copy and commercial terms | Version-controlled maintained sources plus verified live deployments/store listing | Human approval for legal, pricing, billing, payout, and publication changes |
| Operational telemetry | Content-free metrics, heartbeats, and signed evidence | No candidate/job/employer identifiers or source text; unavailable telemetry is `unknown` |

## API boundaries

- Public/static: homepage, pricing, terms, privacy, public app config, resume site, partner site.
- Signed user: opaque-session routes for vault, captured jobs, runs, schedules, packages, sessions, learning, notifications, account lifecycle, and the isolated partner role. Affiliate-only identity verification does not create Job Agent data or entitlement.
- Internal worker: cron-bearer routes and bounded durable queues.
- Service-to-service: signed receipt/webhook boundaries with timestamp, nonce/idempotency, exact source, and raw-body verification.
- Admin: server-confirmed owner identity plus separate secrets where required; responses remain redacted/content-free.

No browser may choose a tenant ID, mark an application Submitted, provide a precomputed receipt, authorize its own entitlement, or pass secrets through candidate/job payloads.

## Environment variables by system

Values belong only in the deployment/provider secret stores. This list records names and responsibilities, never values. The exact executable inventory is enforced by `lib/job-agent-production-environment-report.js` and the release/security scripts; update this section when those contracts change.

| System | Principal variables |
|---|---|
| Identity and sessions | `CLERK_IDENTITY_ENABLED`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `TIER_SECRET`, `RATE_LIMIT_HASH_SECRET`, `ALLOWED_EXTENSION_IDS`, `OWNER_ACCESS_EMAILS`, `OWNER_ACCESS_SECRET` |
| Redis and encryption | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `BETA_DATA_ENCRYPTION_KEY`, `BETA_DATA_ENCRYPTION_KEY_ID`, `BETA_DATA_DECRYPTION_KEYS` |
| PostgreSQL/Neon | `DATABASE_URL`, `JOB_AGENT_POSTGRES_ENABLED`, `JOB_AGENT_ISOLATED_SUPABASE_PROJECT_REF`, `JOB_AGENT_PRODUCTION_SUPABASE_PROJECT_REF`, `JOB_AGENT_ISOLATED_TARGET_KIND`, `JOB_AGENT_ISOLATED_TARGET_CONFIRMATION` |
| Job Agent policy/admission | `JOB_AGENT_ACCESS_POLICY_VERSION`, `JOB_AGENT_CONTROLLED_BETA_INCLUDED_TIERS`, `JOB_AGENT_PILOT_ENFORCEMENT`, `JOB_AGENT_PILOT_MAX_USERS`, `JOB_AGENT_PILOT_ALLOWED_TENANTS`, `JOB_AGENT_TERMS_VERSION`, `JOB_AGENT_PRIVACY_VERSION`, `JOB_AGENT_AUTHORIZATION_VERSION`, `JOB_AGENT_CONSENT_ENFORCEMENT` |
| Workers, readiness, and evidence | `CRON_SECRET`, `HEALTH_CHECK_SECRET`, `JOB_AGENT_READINESS_URL`, `JOB_AGENT_READINESS_DRILL_CONFIRMATION`, `JOB_AGENT_LAUNCH_EVIDENCE_SECRET`, `JOB_AGENT_RELEASE_RUNTIME_SHA256`, `JOB_AGENT_BACKUP_RESTORE_EVIDENCE`, `JOB_AGENT_RECOVERY_DRILL_EVIDENCE`, `JOB_AGENT_SCHEDULE_ENABLED`, `JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS` |
| AI routing and budgets | `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_FAST_MODEL`, `AI_ROUTINE_PROVIDER`, `AI_ROUTINE_MODEL`, `AI_DOCUMENT_PROVIDER`, `AI_DOCUMENT_MODEL`, `AI_QUALITY_MODEL`, `AI_FALLBACK_PROVIDER`, `AI_FALLBACK_MODEL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `AI_GATEWAY_API_KEY`, `JOB_AGENT_GLOBAL_DAILY_BUDGET_CENTS`, `PACKAGE_GLOBAL_DAILY_UNITS` |
| Billing and lifecycle | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_IDEMPOTENCY_SECRET`, `BETA_MODE`, `BETA_CODE`, `BETA_EMAILS` |
| CRM/forms/email | `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`, `GHL_STAGE_*`, `TALLY_SIGNING_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED`, `JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS` |
| Extension and assisted Greenhouse | `JOB_AGENT_EXTENSION_HANDOFF_ENABLED`, `JOB_AGENT_EXTENSION_HANDOFF_SECRET`, `JOB_AGENT_GREENHOUSE_EXTENSION_APPROVED`, `JOB_AGENT_GREENHOUSE_EXTENSION_REVIEW_VERSION`, `JOB_AGENT_GREENHOUSE_EXTENSION_SHA256`, `JOB_AGENT_ASSISTED_APPLICATION_APPROVED`, `JOB_AGENT_ASSISTED_APPLICATION_APPROVAL_VERSION`, `JOB_AGENT_ASSISTED_EXECUTION_MODE` |
| Private objects and rendering | `BLOB_READ_WRITE_TOKEN`, `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET`, `JOB_AGENT_OBJECT_STORAGE_ENABLED`, `JOB_AGENT_MALWARE_SCANNER_*`, `DOCUMENT_RENDER_SANDBOX_ENABLED`, `DOCUMENT_RENDER_SANDBOX_SNAPSHOT_ID`, `DOCUMENT_RENDER_ACCOUNT_DAILY_UNITS`, `DOCUMENT_RENDER_GLOBAL_DAILY_UNITS` |
| Disabled employer/receipt execution | `EMPLOYER_BROWSER_*`, `JOB_AGENT_RECEIPT_*`, `JOB_AGENT_FINAL_SUBMISSION_*` |
| Operations/audit/support | `JOB_AGENT_ALERT_*`, `JOB_AGENT_AUDIT_*`, `JOB_AGENT_INCIDENT_*`, `JOB_AGENT_SUPPORT_*`, `JOB_AGENT_MONETARY_BUDGET_*` |

Wildcard families are documentation shorthand only; deployment checks validate exact names. No extension, resume-site, or partner-site bundle may contain server secrets.

## Test and release verification flow

1. Confirm a clean worktree based on current `origin/main`; inspect relevant open PRs and deployment aliases.
2. Run the smallest focused tests for the changed contract.
3. Run `npm run smoke` and `npm run build` for shared web changes.
4. Run `npm run test:extension-release` and `npm run build:extension:controlled` for extension changes.
5. Run database reconciliation/evidence and security/release gates for auth, storage, worker, schema, or API changes. Configuration-name checks are not runtime proof.
6. Use a Preview for browser verification when authorized. Verify source commit/assets and failure paths.
7. Record exact results, update roadmap/changelog, and commit clean work.
8. Production deployment, main merge that triggers production, provider activation, and Chrome Web Store publication require explicit approval.
9. After release, verify custom-domain aliases, response headers, exact user journey, persisted state, runtime evidence, and store version. Roll back on trust-boundary or data-loss failures.

# Job Agent permissions model

This is the controlled-beta authorization contract. Route discovery never grants access, a browser origin is not authorization, paid status is neither Job Agent entitlement nor administrator status, and pilot admission is independent of billing tier.

| Principal | Authentication | Permitted scope | Explicitly prohibited |
| --- | --- | --- | --- |
| Guest | No account; rate-limited pseudonymous request | Public preview AI and direct-employer discovery only | Durable profile, packages, applications, schedules, account data, operations, readiness |
| Signed subscriber | Revocable opaque `Secure`, `HttpOnly`, host-only session | Own tenant data only; export/delete/revoke remain available | Other tenants, audit console, readiness, worker and receipt endpoints |
| Admitted pilot subscriber | Signed subscriber plus explicit server-issued Job Agent grant, pseudonymous pilot allowlist, and active versioned consent | Own durable discovery, package preparation, schedule, Needs You queue, no-submit browser handoff | Administrator evidence, unrestricted automation, final submission without exact action-time approval |
| Administrator | Signed opaque session whose normalized subject is in server-only `OWNER_ACCESS_EMAILS` | Content-free operations, verified audit access, protected readiness probes | Candidate passwords, OTPs, CAPTCHA answers, silent submission, bypassing tenant/audit checks |
| Scheduler | Exact `Authorization: Bearer <CRON_SECRET>` over server-to-server HTTPS | Background worker and readiness invocations only | Subscriber routes, arbitrary tenant selection, browser use |
| Receipt worker | Timestamped, nonce-bound HMAC request signed with `JOB_AGENT_RECEIPT_SECRET`; browser origins rejected | Exact authoritative-receipt verification mutation | Subscriber reads, fabricated Submitted transitions, replay |
| Stripe/Tally/Resend webhook | Provider signature over raw request body | Provider-specific event processing only; Resend may create only recipient-free Job Agent email suppression | Subscriber/admin routes; unsigned production delivery; application mutation |

## Route classes

- Subscriber tenant routes: `/api/account-data`, `/api/applicant-vault`, `/api/concierge-state`, `/api/job-agent-consent`, `/api/job-agent-notifications`, `/api/job-agent-runs`, `/api/job-agent-schedule`, `/api/application-packages`, `/api/application-package-artifact`, `/api/application-package-render`, `/api/application-sessions`, and `/api/employer-browser-session`. These require an opaque session and derive the tenant from the authenticated subject. Browser input cannot select a different tenant.
- Administrator routes: `/api/application-audit`, `/api/job-agent-operations`, and `/api/job-agent-readiness`. Audit and operations require an administrator opaque session. Readiness additionally permits the exact cron bearer for protected scheduler verification. A paid subscriber is not an administrator.
- Service-only routes: `/api/job-agent-worker` requires the cron bearer. `/api/application-receipts` rejects browser origins and requires replay-resistant HMAC worker authentication. `/api/job-agent-email-events` is provider-facing only: it accepts the untouched raw body under the configured Svix/Resend signature and can only create an encrypted pseudonymous suppression record after exact product, sender, and tenant correlation.
- Public/guest routes are separately bounded and cannot mutate Job Agent tenant state. Preview smoke is unavailable in production.

`node scripts/job-agent-permissions-test.mjs` executes the unauthenticated subscriber/admin denials, opaque administrator and non-administrator distinction, legacy bearer rejection, exact cron-secret behavior, worker denial, and browser denial for receipt mutation. `node scripts/job-agent-entitlement-test.mjs` proves that a legacy paid tier alone cannot grant Job Agent access and that the controlled-beta policy creates no checkout or charge. The broader security suite separately covers cross-tenant isolation, webhook signatures, idempotency, replay protection, and fail-closed runtime configuration.

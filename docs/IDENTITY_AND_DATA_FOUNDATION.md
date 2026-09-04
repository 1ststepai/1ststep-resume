# Identity and data foundation

## Implemented boundary

This release source contains an opt-in foundation for Clerk identity, Neon Postgres, and Cloudflare R2. It does not provision providers, migrate users, enable object storage, change Stripe entitlements, or deploy anything.

- Clerk proves who the user is. It never grants a paid tier.
- Stripe and the existing entitlement policy remain authoritative for product access.
- Neon is the planned authoritative store for tenant records, applicant facts, job state, document metadata, human actions, and audit events.
- Cloudflare R2 is an optional private object provider behind the existing encryption, malware-scanning, monetary-budget, and activation gates.
- Upstash remains the queue, rate-limit, lease, idempotency, and short-lived session layer.

## Activation order

1. Create separate development resources in Clerk, Neon, and Cloudflare R2.
2. Apply `migrations/001_job_agent_authoritative_store.sql` to the development Neon database.
3. Create a least-privileged application database role that does not have `BYPASSRLS`; do not use the Neon owner role at runtime.
4. Configure the development environment variables listed in `.env.example` through the provider/Vercel secret stores.
5. Set only `CLERK_IDENTITY_ENABLED=true` and `JOB_AGENT_POSTGRES_ENABLED=true` for the first synthetic test.
6. Verify sign-in, tenant isolation, revocation, export, and deletion with synthetic users.
7. Configure a private R2 bucket and malware scanner, restore the object-storage budget controls, then set `JOB_AGENT_OBJECT_STORAGE_PROVIDER=cloudflare-r2` and `JOB_AGENT_OBJECT_STORAGE_ENABLED=true` in development only.
8. Run a retained backup/restore and deletion drill before requesting any Production activation.

## Required safeguards

- Keep Clerk secret keys, Neon credentials, and R2 access keys server-only.
- Store no passwords, OTPs, CAPTCHA answers, government identifiers, or raw authentication tokens in Postgres or R2.
- Store candidate documents only as application-encrypted ciphertext with opaque object keys.
- Never expose a public bucket or public object URL.
- Use the existing short-lived HTTP-only application session after Clerk verification.
- Preserve action-time confirmation before employer transmission or submission.
- Ensure every tenant-bound database transaction sets `app.tenant_id`; RLS is enabled and forced by the migration.
- Keep a separate database migration role. The runtime role must have only the table and sequence privileges its APIs require.

## Current gaps before user-facing activation

1. Provider accounts and development credentials have not been provisioned.
2. The migration has not been executed against a real Neon development branch.
3. A least-privileged Neon application role and grants must be created and verified.
4. The current static frontend still uses the existing email-code access interface; Clerk UI has not been connected because that requires the real Clerk publishable configuration and a reviewed CSP/source bundle.
5. Existing encrypted Redis records have not been migrated or reconciled into Postgres.
6. R2 has not been exercised against a real private bucket, and object-storage activation remains intentionally disabled.
7. Production privacy/subprocessor disclosures must be updated and approved before real applicant data is sent to any new provider.

## Validation

Run:

```text
npm run smoke
npm run test:concierge
```

Focused tests:

```text
node scripts/clerk-identity-test.mjs
node scripts/postgres-tenant-store-test.mjs
node scripts/cloudflare-r2-private-storage-test.mjs
```

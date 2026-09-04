# Sherlock seven-prompt security review

Source reviewed: https://www.sherlockforensics.com/blog/security-prompts-every-vibe-coder-needs.html

Run `npm run security:sherlock-review` before every controlled-beta release. The command is read-only and fails closed when a new API route lacks an explicit access policy or when any checked invariant regresses.

## Applied controls

1. **Authentication** — 1stStep does not store user passwords. Job Agent data requires an opaque, revocable, encrypted server session. Cookies are `HttpOnly`, `Secure` in production, host-only, and `SameSite=Lax`; logout revokes the server record and expires the cookie. Legacy signed access proofs cannot exceed 24 hours. Restore and AI entry points are rate limited.
2. **Authorization** — every deployed API route has an explicit signed-user, guest, service-signature, cron-secret, webhook-signature, or deliberately public policy. Tenant resource APIs derive ownership from the authenticated subject. Browser-supplied tenant IDs are rejected; the sole tenant-ID input is the HMAC-authenticated internal receipt worker.
3. **Secrets** — tracked non-example environment files and private-key files are rejected. High-confidence production-source secret patterns are rejected. Server-only environment names are forbidden in the public app configuration, concierge bundle, and controlled extension.
4. **Injection** — this build has no SQL or document-database client. Durable records use bounded Redis keys and fixed Lua scripts, not caller-built queries. The gate rejects future unreviewed database clients and interpolated raw-query calls.
5. **Security headers** — deployment requires HSTS, CSP, clickjacking protection, content-type protection, and a referrer policy. The Job Agent route has a stricter path CSP with no inline script execution or framing. Tracked production source maps are rejected.
6. **Dependencies** — every direct production and development dependency is pinned exactly and reproduced by npm lockfile v3. Git, URL, and local-file dependencies are rejected. `npm audit --omit=dev` remains a separate release check because vulnerability intelligence changes over time.
7. **Error handling** — client responses cannot interpolate raw exception messages. Logs cannot include raw upstream bodies, person-linked email/customer values, passwords, OTPs, CAPTCHA answers, or access-token material. Content-free event type, status, count, and exception class are retained for operations.

## Remediations made during the review

- Removed person-linked emails, CRM/contact identifiers, payment customer identifiers, raw webhook/provider bodies, and raw exception messages from legacy API logs and responses.
- Made beta-expiry cron comparison timing safe and require a 32-character secret.
- Made production Tally webhook verification fail closed unless its signing secret is at least 32 characters.
- Pinned all direct package versions and added this review to the full concierge pretest.

## Limits

This is a deterministic source and configuration gate, not a penetration test. Registry reputation, newly published vulnerabilities, deployed TLS, runtime environment values, cloud IAM, webhook delivery, restore behavior, and business-logic attacks still require current external evidence and human security review before launch.

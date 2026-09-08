# Clerk dashboard setup

Application: `1stStep.ai` (`app_3IxluEQpECujSS16prO4ILVuWb7`).
Development instance: `ins_3Ixlu9jY678IVA1WkkJnDTItYiP`.
Production instance: `ins_3Ixm19k7UPHDu8D09jBShWXIiRs`.
Application home: `https://app.1ststep.ai`.

Created with consumer authentication, required verified email, email one-time codes, and Google. Organizations were not enabled. Production cloned development settings. This is provider configuration, not a deployed application integration.

## DNS prerequisite

Authoritative nameservers observed: `hgns1.hostgator.com`, `hgns2.hostgator.com`.
User saved all five CNAME records in HostGator on September 6. HostGator rows and public DNS lookups confirm the exact targets below; Clerk reports application 2/2 and email 3/3 verified. SSL certificates now show Issued for Frontend API and Account portal.

| Host | Target |
| --- | --- |
| clerk | frontend-api.clerk.services |
| accounts | accounts.clerk.services |
| clkmail | mail.fed35t1qkvqj.clerk.services |
| clk._domainkey | dkim1.fed35t1qkvqj.clerk.services |
| clk2._domainkey | dkim2.fed35t1qkvqj.clerk.services |

Account Portal paths are `https://accounts.1ststep.ai/sign-in` and `/sign-up`. Recheck certificate readiness before activation.

## Google production prerequisite

Google OAuth client `1stStep.ai Clerk Login` was created in existing Google Cloud project `gen-lang-client-0902006170` (1stStepdotAI), after explicit user approval. Client ID: `793776994680-jpb771a4qdr9ekn4b0f2f068hg6lpsvo.apps.googleusercontent.com`. Its generated secret was transferred directly through the browser to Clerk production and not written to source or displayed in chat. Clerk now shows Google Enabled / Used for sign-in.

JavaScript origin: `https://app.1ststep.ai`. Redirect URI: `https://clerk.1ststep.ai/v1/oauth_callback`. Requested scopes remain openid, email, and profile only. Branding was saved with the app homepage, `/privacy`, `/terms`, authorized domain `1ststep.ai`, and contact `evan@1ststep.ai`. Google now reports **In production** after the user's go-live authorization.

## Application release

Production deployment `dpl_j1XiLQZD9GNtdpwYxLmKNn6FxrsE` (`https://1ststep-resume-6050coi20-1ststep.vercel.app`) was deployed and aliased to `app.1ststep.ai` on September 6 at approximately 19:08 UTC. Previous production rollback target before this task: `dpl_9T8eyz5KVLPhzCgM2ZW34Ku72DDy` (`https://1ststep-resume-dcp96ys24-1ststep.vercel.app`).

The scoped release snapshot is `output/clerk-production-20260906`, based on `7a57fd7652e3633f84c0aaab2049ff5a94dc2c04`. It excludes the unrelated pending vault, CSS, and analytics-CSP changes. No source commit or merge was made.

- Production Clerk secret, public JWT verification key, publishable key, and enable flag were saved directly to Vercel environment settings. No secret values appear in source or this document.
- `/login.html` uses the verified `accounts.1ststep.ai` portal, returning to the app for a server-verified session exchange. The initial embedded form stalled during new-account OAuth; the hosted portal exposes the required bot-verification step clearly.
- Clerk exchange uses only its server-verified primary email with the existing Stripe/owner subscription resolver. Active/trialing subscriptions retain their existing tier. Stripe outages return 503 without overwriting an existing paid cookie with a free session.
- The browser stores only the existing display cache, never Clerk tokens. API authorization remains an encrypted, revocable HttpOnly app session. Sign-out clears app and browser Clerk sessions.
- The production email tab shows required verified email and one-time codes enabled. Sign-up-with-password was turned off; optional add-password remains enabled. Confirm the persisted hosted-form behavior after configuration propagation.

Validation: scoped candidate Clerk identity, subscription, client-flow, API security, session isolation/revocation, app config, and concierge tests passed. Required smoke test passed with zero failures and six existing warnings. Public `/login.html` returns 200 with its scoped CSP; `/api/app-config` reports Clerk ready; `/api/health/ready` returns healthy/ready. The temporary environment export was removed; it omitted sensitive variables and was not treated as evidence of production misconfiguration.

**Founder login verified live:** On September 6 at approximately 19:24 UTC, production deployment `dpl_Ej7YAfZytwa9VtieNx7QoD7QPLEk` fixed the Clerk exchange handoff losing Node IncomingMessage headers during object spread. Retrying the user's existing Clerk session redirected to `/app`, restored saved procurement-manager criteria, and showed active Job Agent access and founder admin controls. The server's existing verified-primary-email owner rule grants `evan@1ststep.ai` the complete tier without a Stripe purchase. No origin check or consent gate was disabled. A regression test uses a real IncomingMessage to reproduce and prevent the dropped-header bug. Paid-user restore and live logout remain unverified.

The subsequent live discovery request initially returned a retry state without completed results. Content-filtered worker diagnostics identified `UpstashError: ERR null args are not supported` at the first heartbeat. An omitted result envelope was passed as an undefined EVAL argument. The heartbeat now serializes the missing envelope as the JSON string `null`; the regression test rejects null/undefined Redis arguments and covers a record with an omitted envelope.

**Live discovery verified:** Production deployment `dpl_6FSMYJxeGxAw3f98ao9487du8qTc` (`https://1ststep-resume-nz4zwp2vv-1ststep.vercel.app`) was aliased to `app.1ststep.ai` at approximately 19:47 UTC. The founder's authenticated app then completed a procurement-manager, remote-US, full-time search with a $100k salary preference. It returned two Found roles from 37 feeds: Avery Dennison Regional Procurement Manager and ServiceNow Sr Strategic Sourcing Mgr. These are review candidates, not verified salary/eligibility claims or submitted applications. No employer application was submitted. Daily background discovery and email alerts remain disabled in this beta. Saved Info showed an active encrypted backup with one master-resume document, zero confirmed answers, and active Job Agent authorization.

Validation: real-request Clerk origin regression, Clerk identity/subscription tests, durable-run regression, worker API tests, and required smoke checks passed (zero failures, six existing warnings). Final public configuration/login/CSP/dependency health checks passed. Founder-only support codes and filtered worker diagnostics improve investigation without logging the Redis command payload. Temporary environment exports and ad hoc diagnostic scripts were removed.

A browser reload retained active founder access and both matches in My Jobs. The restored completed run showed all 37 sources healthy and 39 public-feed requests. Remaining UI issue observed: the conversation's initial readiness message can request a role even though the restored mission summary and saved results show the role; this was not fixed in the authentication/heartbeat patch. Application-package generation and employer submission were not exercised. The My Jobs dialog was left open for the founder.

**Paid public Job Agent launch is not activated:** the app still has its existing controlled-beta admission policy and dedicated billing off-switches. The $39/month copy states billing is inactive. Checkout plus its dedicated entitlement and cancellation path still need implementation/verification before charging users. Do not label this an unrestricted paid Job Agent launch.

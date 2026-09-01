# Cost Control

## Paid APIs
- Do not call Claude while testing unless generation behavior is the thing being tested.
- Keep retries bounded and visible.
- Avoid running broad smoke/manual tests that generate many resumes or cover letters.
- Do not add new paid APIs without explicit approval.

## Cost evidence before pricing

- `/api/ai`, the authenticated legacy Claude proxy, and durable application-package generation record only aggregate provider-completed requests and provider-reported input/output tokens in the admin-only content-free operations ledger.
- The admin console also displays the configured global daily ceilings as weighted request units. These units are enforcement controls, not dollars.
- Dollar cost remains `unknown` until the matching provider invoice/export is reconciled. Never convert tokens to revenue, margin, or a customer price using an unreviewed hardcoded rate.
- Before publishing dedicated Job Agent pricing, run an approved synthetic/no-submit pilot, reconcile provider tokens and request counts to AI, email, storage, rendering, and browser invoices, then calculate observed cost distributions without candidate content.
- Missing usage or invoice evidence is `unknown`, never zero.

## Hard monetary reservation control

`lib/job-agent-spend-ledger.js` adds a separate USD-cent safety boundary. It does not estimate prices from tokens. Operators approve a fixed global daily ceiling plus category daily and worst-case per-operation ceilings for AI, package AI, document rendering, employer browser sessions, email, and object storage. Reservations are atomic in Redis and use only HMAC operation IDs. No tenant, candidate, prompt, job, or provider credential enters the ledger.

Deployed `/api/ai` calls now require this control before contacting a hosted provider. Each call reserves the approved worst-case amount. Because a provider response does not reliably expose invoice cost, the reservation settles at its maximum unless an independently trusted actual-cent value is available. A timeout remains charged at the maximum; only work proven not to have reached the provider may release a reservation. Global or category exhaustion fails closed before the provider call. This bounds spend conservatively while invoice cost remains `unknown`.

The generic and legacy AI routes, package generator, isolated renderer, remote browser-session creation, Needs You email delivery, and private artifact persistence now reserve their category maximum before first provider contact. The controlled-beta launch manifest fails closed unless the full ledger is enabled, version-approved, and configured for USD with valid global, category, and per-operation caps. Local disabled-provider and deterministic fixture paths do not reserve spend.

The admin-only operations response exposes eight days of content-free `reservedCents`, `settledCents`, and `releasedCents` totals globally and by category. A timeout or provider-unknown outcome stays settled at the maximum. A nonzero reserved balance can represent in-flight work or a process that stopped before settlement and requires operator reconciliation; it must never be presented as invoice-confirmed spend. The ledger does not establish profitability or customer pricing, and provider invoices must still be reconciled.

Reservations enter a tenant-free due index for crash recovery. The hourly worker examines at most a bounded batch after 15 minutes and settles an abandoned record at its full approved maximum. It never releases stale capacity automatically, never retries the provider action, and rejects or repairs malformed/early index entries. This converts ambiguous in-flight exposure into conservative settled exposure without understating cost.

## Browser/app efficiency
- Avoid polling for subscription, GHL, or generation state unless explicitly approved.
- Prefer event-driven calls from user actions.
- Keep localStorage reads/writes scoped to the data needed for the current workflow.

## AI context hygiene
- Start with `AGENTS.md`, this file, and the specific file under change.
- Do not paste full resumes, job descriptions, generated letters, or giant smoke-test output into Claude/Codex context.
- Keep docs concise and indexed so agents do not need to read the whole app.

## High-risk cost/security areas
- `api/claude.js` can spend model credits.
- `api/subscription.js` controls paid access and must not be bypassed for convenience.
- `api/notify-signup.js` touches GHL/Resend and should stay rate-limited and event-driven.

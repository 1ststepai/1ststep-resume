# 2026-08-31 — Marketing homepage, storage-gate narrowing, spend-ledger fix

## Deployed
`dpl_EvRqJjwQi5DCp2AEx4z1BzS5WU1e` → https://app.1ststep.ai (production, READY).

## Routing change (important)
The former `index.html` (workspace shell) is now **`app.html`**, served at `/app`.
The new marketing homepage is **`index.html`**, served at `/`.

A `{"source": "/", "destination": "/home.html"}` rewrite was tried first and rejected:
Vercel applies rewrites *after* the filesystem check, so a root `index.html` would have
shadowed it. Serving the homepage as the actual `index.html` removes that ambiguity.

`home.js` forwards `/` → `/app` (query string and hash preserved) when a passthrough
parameter is present (`jobCaptureId`, `mode`, `welcome`, `restore`, `token`, `session`,
`ref`) or any returning-user localStorage signal exists. **This is what preserves the
Chrome extension contract** — `background.js` opens `/?jobCaptureId=…&mode=…`.
`?home=1` forces the homepage. Covered by `scripts/homepage-viewport-qa.mjs`.

## Spend ledger — root cause
`paid-provider-spend-boundary-test.mjs` expected `settledCents: 165`, got `115`.

`inspectApplicationPackageArtifacts` was the only paid path that did not accept a `now`
parameter, so its ledger keys used wall-clock time instead of the caller's clock. The
50-cent document-render charge landed in the **2026-08-31** bucket while the other three
operations landed in **2026-08-30**; the test read one day and missed it. Verified by
dumping per-day buckets: 08-31 → 50, 08-30 → 115, total 165. No money was lost or
double-counted. The test only ever passed when run on 2026-08-30 UTC.

Fixed the implementation (injectable clock threaded through to `reserveConfiguredJobAgentSpend`),
not the expectation, and added regression assertions naming the invariant:
document-render 50 + employer-browser 100 + email 5 + object-storage 10 = 165,
`reservedCents` 0, `releasedCents` 0, denied reservation contributes nothing.

## Object-storage gate
Verified the narrowing is safe and added `scripts/object-storage-boundary-test.mjs`:
non-blob account state stays available without a blob provider; every blob-backed
operation fails closed **before** provider contact (asserted via a counting blob client);
no candidate bytes or public URL leak into failures; production never falls back to inline
storage; launch readiness still reports `PRIVATE_DOCUMENT_STORAGE_NOT_CONFIGURED` and
`DURABLE_RUNTIME_NOT_CONFIGURED`.

## Homepage robustness fix found during QA
Scroll-reveal held all below-fold content at `opacity: 0` until JS ran — meaning a JS
failure would leave the page permanently blank below the hero. The hidden state is now
gated behind a `.js` class set by an inline head script, so the page renders fully without
JavaScript. Regression-tested with `javaScriptEnabled: false`.

## Stale test corrected
`scripts/concierge-test.mjs` asserted `api/session-capabilities.js` contains
`OWNER_ACCESS_EMAILS`, but that check was centralized into `lib/admin-subject.js`. Now
asserts the delegation *and* that `admin-subject.js` reads the allowlist, so coverage is
preserved rather than dropped.

## Legal — intentionally still closed
`docs/legal-drafts/` contains counsel-review drafts only. `JOB_AGENT_COUNSEL_APPROVED`
is **unset**, the three policy version variables are **unset**, live `terms.html` and
`privacy.html` are **unmodified**, and the pinned digests in `lib/job-agent-policy-bundle.js`
are **untouched**. Job Agent consent granting remains fail-closed.

## Validation
- `npm run smoke` — 0 failures, 6 known allowlisted warnings
- `npm run test:concierge` — full chain passes (now includes the object-storage boundary test)
- `scripts/homepage-viewport-qa.mjs` — all checks pass locally and against production at
  1440 / 1024 / 390 / 360, plus reduced-motion, no-JS, and the forward-guard cases
- Production: `/`, `/app`, `/concierge`, `/pricing`, `/terms`, `/privacy`, `/funnel` all 200;
  `/api/session-capabilities`, `/api/applicant-vault`, `/api/job-agent-consent`,
  `/api/application-packages`, `/api/account-data` all 401 unauthenticated

## Known follow-up
The homepage is dark (midnight navy) and the preserved onboarding at `/app` is light. The
transition is functional but visually discontinuous. Restyling the onboarding was out of
scope because it carries protected DOM IDs and product-choice behavior.

# 2026-08-31 — Owner login unblocked; object-storage gate narrowed

## Production login fix (deployed)
`BETA_DATA_ENCRYPTION_KEY_ID` was missing from Production. `lib/data-encryption-keyring.js`
throws without it when `VERCEL_ENV=production`, so `userSessionRuntimeConfiguration()`
returned null and emailed-code login failed closed with 503.

Added `BETA_DATA_ENCRYPTION_KEY_ID=beta-2026-08-v1` (non-secret version label for the
existing key) and redeployed unchanged code as `dpl_5hPGjgySbdU4vbyZDzFduS7RSDLC`,
aliased to app.1ststep.ai. Owner login now succeeds.

Verification note: a logged-out GET of `/api/session-capabilities` returns 401 whether or
not the session runtime is configured — the 503 branch is only reached when an `s1.` cookie
is present. Probe with a bogus `__Host-1ststep_session=s1.…` value to tell the two apart.

## Object-storage gate narrowed (NOT yet deployed)
`jobAgentRuntimeConfiguration()` returned null in production whenever private object
storage was unready, which blocked Job Agent consent and the confirmed-fact vault even
though neither writes a blob — `lib/job-agent-consent-store.js` has zero objectStorage
references.

Removed that coarse gate and added `jobAgentArtifactStorageReady(config)`. Endpoints that
actually touch blobs now refuse upfront:
- `api/application-packages.js` (POST only)
- `api/application-package-render.js`
- `api/application-package-artifact.js`

This opens no hole: every helper in `lib/job-agent-object-storage.js` already throws
`PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED` independently, the account-data export paths guard
on `ready && mode === 'vercel-blob-private'`, and `api/job-agent-readiness.js:87` keeps its
own upfront production check. `scripts/production-security-gate.mjs` still requires storage
for launch, which is correct.

## Still blocked (by design)
Consent needs `JOB_AGENT_TERMS_VERSION`, `JOB_AGENT_PRIVACY_VERSION`,
`JOB_AGENT_AUTHORIZATION_VERSION`, and `JOB_AGENT_COUNSEL_APPROVED=true`. None are set in
Production. `terms.html` has no Job Agent coverage at all and `privacy.html` has none
specific to it, so counsel review is genuine work, not a formality. Editing either document
requires updating the pinned digests in `lib/job-agent-policy-bundle.js` or
`scripts/verify-job-agent-policy-bundle.mjs` fails.

## Validation
- `npm run smoke`: 0 failures, 6 known allowlisted warnings
- 23/23 remaining `test:concierge` scripts pass; api-security, security-regression,
  data-encryption-keyring, job-agent-launch-manifest, production-environment-shape all pass
- Pre-existing failure, unrelated to this work: `scripts/paid-provider-spend-boundary-test.mjs`
  expects `settledCents: 165`, gets `115`. Reproduced identically with the original gate
  restored; the test does not import the changed module.

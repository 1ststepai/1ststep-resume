# 2026-09-17 — Owner-reviewed R3 cloud-browser ceiling

## Changed
- Owner-reviewed capability ceiling now fail-closes `employerBrowserSessionProviderConfiguration` with `OWNER_REVIEWED_CAPABILITY_CEILING`.
- `/api/employer-browser-session` cannot create or resume a usable remote-stream/cloud-browser session when that ceiling applies, even if remote-stream flags look valid.
- Ordinary non-owner-reviewed remote-stream behavior is unchanged.

## Files Touched
- `lib/employer-browser-session-provider.js`
- `api/employer-browser-session.js`
- `scripts/job-agent-owner-reviewed-policy-test.mjs`
- `scripts/job-agent-owner-reviewed-browser-ceiling-test.mjs`
- `scripts/security-regression-test.mjs`
- `package.json`

## Verification
- Owner-reviewed adversarial tests, remote-stream regression, concierge pretest/test, and smoke.

## Risks / Follow-Up
- Independent targeted re-audit of this SHA. Do not Preview-deploy, enable tenants, set counsel approval, or deploy Production.

# 2026-09-17 — Owner-reviewed R2 fail-closed audit fix

## Changed
- Owner-reviewed eligibility is Preview-only and cannot satisfy Production signedBeta readiness.
- Owner-reviewed + `JOB_AGENT_COUNSEL_APPROVED=true` fails closed and cannot report `approvalSource: counsel`.
- Owner-reviewed mode hard-disables schedule, email, fill, receipts, object storage, and rendering.
- DATA_CONSENT now requires exact served Terms/Privacy digests, not versions alone.

## Files Touched
- `lib/job-agent-owner-reviewed-policy.js`, `lib/job-agent-consent-domain.js`, `lib/job-agent-consent-store.js`
- `lib/job-agent-launch-manifest.js`, `lib/job-agent-launch-plan.js`, `api/job-agent-readiness.js`
- `lib/job-agent-policy-levels.js` and owner-reviewed capability-ceiling configs
- `scripts/job-agent-owner-reviewed-policy-test.mjs`, `scripts/job-agent-policy-level-test.mjs`

## Verification
- Owner-reviewed adversarial tests plus concierge pretest/test and smoke.

## Risks / Follow-Up
- Independent re-audit of the new SHA. Do not Preview-deploy, enable tenants, set counsel approval, or deploy Production.

## Suggested Next Prompt

Paste this next:

```txt
Read CLAUDE.md, docs/AI_MEMORY.md, and docs/SESSION_RETROS/2026-09-17-owner-reviewed-r2.md. Independently re-audit the new successor SHA. Do not modify PR #86, do not set JOB_AGENT_COUNSEL_APPROVED, do not enable beta users, and do not deploy.
```

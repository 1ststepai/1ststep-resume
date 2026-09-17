# 2026-09-17 — Owner-reviewed controlled-beta successor

## Changed
- Isolated successor from frozen SHA `bbb6ee31bffdd6c84729639c29d1d94c5ddb320e` (PR #86 unchanged).
- Served owner-reviewed Terms/Privacy and in-app disclosure; pinned exact versions and SHA-256 digests.
- Added `JOB_AGENT_OWNER_REVIEWED_POLICY` so owner acknowledgment cannot masquerade as `JOB_AGENT_COUNSEL_APPROVED`.
- Owner-reviewed invite uses encryption/consent/5-user allowlist without signedBeta, submission, fill, email, receipts, or object storage.

## Files Touched
- `terms.html`, `privacy.html`, `lib/job-agent-policy-bundle.js`, `lib/job-agent-owner-reviewed-policy.js`
- `lib/job-agent-consent-domain.js`, `lib/job-agent-consent-store.js`, `lib/job-agent-launch-manifest.js`, `lib/job-agent-launch-plan.js`
- `api/job-agent-readiness.js`, `.env.example`, `package.json`
- `scripts/job-agent-owner-reviewed-policy-test.mjs`, `docs/OWNER_REVIEWED_CONTROLLED_BETA.md`

## Verification
- Owner-reviewed policy, digest pin, consent, 5-user allowlist, launch-manifest, and concierge pretest/test gates.

## Risks / Follow-Up
- Do not set `JOB_AGENT_COUNSEL_APPROVED=true`. Do not enable invited tenants yet. Do not deploy Production. Preview only after independent audit.

## Suggested Next Prompt

Paste this next:

```txt
Read CLAUDE.md, docs/AI_MEMORY.md, and docs/SESSION_RETROS/2026-09-17-owner-reviewed-controlled-beta.md. Audit successor SHA independently. Do not modify PR #86, do not set JOB_AGENT_COUNSEL_APPROVED, do not enable beta users, and do not deploy Production.
```

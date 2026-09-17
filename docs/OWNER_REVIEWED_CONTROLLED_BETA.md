# Owner-reviewed controlled beta

Frozen engineering baseline: `bbb6ee31bffdd6c84729639c29d1d94c5ddb320e` (PR #86).  
This successor serves owner-reviewed Terms/Privacy and an owner-acknowledgment gate. It does **not** represent outside-counsel approval.

Do **not** set `JOB_AGENT_COUNSEL_APPROVED=true`.

## Policy pin

`lib/job-agent-owner-reviewed-policy.js` binds `JOB_AGENT_OWNER_REVIEWED_POLICY` to exact Terms, Privacy, authorization, and disclosure versions/digests. Changing served legal bytes without updating the pin invalidates acknowledgment.

## Required env for this invite (Preview only; users not enabled yet)

- `JOB_AGENT_OWNER_REVIEWED_POLICY=true`
- `JOB_AGENT_OWNER_REVIEWED_POLICY_VERSION=owner-reviewed-beta-2026-09-17`
- `JOB_AGENT_TERMS_VERSION=terms-owner-reviewed-beta-2026-09-17`
- `JOB_AGENT_PRIVACY_VERSION=privacy-owner-reviewed-beta-2026-09-17`
- `JOB_AGENT_AUTHORIZATION_VERSION=authorization-owner-reviewed-beta-2026-09-17`
- `JOB_AGENT_CONSENT_ENFORCEMENT=true`
- `JOB_AGENT_COUNSEL_APPROVED` unset or `false`
- `JOB_AGENT_PILOT_ENFORCEMENT=true`
- `JOB_AGENT_PILOT_MAX_USERS=5`
- `JOB_AGENT_PILOT_ALLOWED_TENANTS` empty until the owner names five tenant IDs

`signedBeta` remains a separate, stricter bundle and is not required for this invite. Submission, assisted fill, background search, email, receipts, object storage, and PDF/DOCX rendering stay fail-closed.

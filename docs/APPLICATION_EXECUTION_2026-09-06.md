# Application execution implementation

Scope: connect discovery to private application preparation and complete the hosted employer execution path. Founder authorization to implement and deploy is in the current conversation. A hosting-provider choice and spending cap are pending; no new paid hosting resources have been provisioned.

## Implemented

- Found direct-employer matches can enter private drafting without an administrator first promoting them to Verified. Drafts preserve Found status and unresolved eligibility requirements. They cannot become Package Ready or Submitted through this path.
- A completed foreground discovery continues sequentially into preparation for its eligible, non-duplicate matches when current server-returned consent explicitly authorizes AI document preparation and a reviewed master resume exists. Each request uses existing server freshness, tenant, idempotency, consent, rate and spend gates. Existing package runs, closed/submitted roles and disqualified matches are skipped. The batch stops on pause, missing identity, pending work or an error. This is a foreground continuation, not a new background scheduler.
- Saved match cards expose Prepare application, existing drafts open for review, and Package Ready roles expose Start application before the draft-review fallback.
- Opening a package closes the overlapping My Jobs dialog. Error reporting does not claim that a resume was created merely because a run was queued.
- SmartRecruiters employer-slug casing is normalized for identity binding while employer, title and requisition identity remain required. Other provider paths remain case-sensitive. Freshness compares the same privacy-filtered description; newly persisted jobs preserve salary currency. Existing snapshots without currency do not fabricate one for comparisons.
- Reload no longer infers Verified status from the existence of a package run. A saved Found match remains Found while its private draft is prepared.
- OpenAI Responses document generation requests a strict JSON schema, uses compact document instructions and omits reasoning tokens without increasing the existing 3000-token output ceiling. Refused, incomplete, empty and invalid responses are rejected. A recoverable failed run exposes an explicit Retry preparation action; merely checking progress does not rerun the provider. Unknown errors are not mislabeled as invalid JSON.

## Infrastructure not activated

The production environment listing contained no employer-browser, document-render, object-storage, blob-token or malware-scanner variables. Listings alone cannot establish every provider's readiness, but these missing integrations have no deployable configuration in the current project.

The repository already contains an isolated browser runner, snapshot/hash verification, document-render sandbox integration, approved-field transmission, application sessions and receipt gates. Completing the hosted path requires a provisioned browser/snapshot service, private document storage with scanning, and an interactive handoff for credentials/challenges. SmartRecruiters is a discovery provider; the shipped extension's supported filling adapter remains Greenhouse. No SmartRecruiters autofill or unattended submission is claimed.

Do not enable external execution by changing flags alone. Validate actual document production, scanned private storage, rendering, resumable form inspection/filling, exact approvals, provider reconciliation and authoritative receipts. Do not treat a draft or HTTP success as Submitted.

## Validation

Preparation policy tests cover current authorization, revoked/stale consent, already-prepared work, disqualified and terminal roles. Domain tests verify that drafts do not promote a Found role to Package Ready or Submitted. A mocked browser integration test exercises Found → Prepare application → reviewable private draft → reopen the existing draft without regeneration. It is synthetic and not evidence of a live AI/provider call. Required smoke tests passed with zero failures and six existing warnings.

Live verification and final deployment identity are recorded below as they become available.

The initial live Avery Dennison preparation produced a durable Failed run. No draft or application receipt was claimed. The updated response-format/parser tests and existing provider/package tests passed; the browser fixture and required smoke checks passed after these changes. Hosted browser execution, file storage/scanning and final employer submission remain unverified and disabled pending the required infrastructure.

The saved failure was subsequently classified as AI_PROVIDER_NAME_INVALID (the initial generic UI mapping incorrectly labeled all unrecognized errors as invalid responses). Production AI_DOCUMENT_PROVIDER was corrected to openai-compatible through a value-only Vercel API update, preserving its existing sensitive metadata and the existing API key. No global/routine provider setting or spending limit was changed. The Vercel CLI env-update path failed because it attempted to include the sensitive variable key; the value-only PATCH succeeded.

Live retry on deployment dpl_BxvRr6aqnxXMcSmtvbD58df361HW succeeded: the authenticated Avery Dennison review contained 3594 characters of resume text and 1873 characters of cover-letter text. It correctly entered Waiting for You with ATS_TABLE_OR_TAB_RISK and UNMAPPED_OUTPUT_CLAIM; five resume lines used vertical bars. This is a real private provider-generated draft, not a synthetic fixture. No files were produced and no employer transmission/submission occurred. The live login and dependency-health check returned 200/healthy.

Review editing was corrected to accept an existing Waiting for You package as well as Finished. The tenant-scoped base lookup, version, source map, document checks and fresh generation of a private revision remain required. Failed, running, paused and other-task bases remain ineligible. Unit boundary tests passed.

Final production deployment: dpl_BdBTsEVMh63JPGF1hBvQCSgV7JNH, https://1ststep-resume-at3bs4oqw-1ststep.vercel.app, aliased to https://app.1ststep.ai. On the real review screen, only vertical-bar separators were changed to em dashes and saved as a private revision without another AI generation. After reload, resume/cover lengths remained 3594/1873, vertical bars were absent, and only UNMAPPED_OUTPUT_CLAIM remained. The original version was retained. This verifies durable draft creation, review editing and persistence, not complete factual approval, document-file generation or employer execution. Login and dependency readiness returned 200/healthy at 2026-09-06T20:49:27Z. The live review was left open for the founder.

Outstanding required user input: hosted-browser provider and monthly spending cap. No new metered browser/storage service was provisioned. Complete hosted application execution and its final receipt verification remain unfinished.

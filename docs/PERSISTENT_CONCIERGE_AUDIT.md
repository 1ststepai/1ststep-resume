# Persistent Concierge audit and implementation map

## Verified architecture and release boundary

- The product is a static Vercel application in `1ststep-resume-deploy`.
- `vercel.json` rewrites `/concierge` to `concierge.html`.
- `.vercel/project.json` links the checkout to Vercel project `1ststep-resume`.
- On 2026-08-28, `https://app.1ststep.ai/concierge` returned HTTP 200 from Vercel. The inspected production deployment was `dpl_63oSxWQp8CfLg1odNyK5j6Az4arh`, status READY. READY establishes deployment health, not campaign execution capability.
- Production remains unchanged by this implementation. The release gate is an isolated preview deployment followed by explicit promotion approval.

## Existing capability classification

| Capability | Current behavior | Classification |
| --- | --- | --- |
| Resume Tailor, Job Search, Tracker, Bulk Tailoring, LinkedIn | Existing self-service tools linked from the Concierge rail | Preserved, user-triggered |
| Application chat | Job-only assistant with explicit AI processing consent and redaction | Preserved, user-triggered |
| Resume intake/build | PDF/DOCX/TXT browser extraction plus truth-safe guided generation | Preserved; local/session data |
| Application records | Truth profile, reusable answers, roles, batches, actions, audit replay | Preserved secondary tool; browser-local |
| Managed employer workspace | Clearly labeled redacted/synthetic workflow | Mock/demo only |
| External applications | Disabled; authoritative receipt required before Submitted | Not connected |
| Campaign scheduling | No scheduler or durable worker exists | Integration Required |
| Background/overnight execution | No service, queue, lease, or heartbeat exists | Integration Required |
| Generic persistent campaigns | Not present before this slice | Implemented locally in Design mode |

## Requirement map

| Requirement | Implemented slice | Remaining production work |
| --- | --- | --- |
| Operator console | Campaign contract, truthful zero metrics, Human Action, Run Ledger, evidence timeline | Server-backed multi-tenant data and live worker telemetry |
| Guided creation | Eight steps covering type/objective, cadence, targets, rules, authorization, human gates, evidence/reporting, stop conditions | Server validation and organization policy controls |
| Explicit operating contract | Structured campaign schema; editable, pausable, stoppable, exportable | Version approvals and signed policy changes |
| Generic work-item states | Discovered through Verified Complete, Blocked, Closed | Connectors that create and advance real items |
| Evidence gate | Executed and Verified Complete reject missing authoritative metadata | Evidence authenticity/retention service |
| Isolated blockers | Human-action queue changes one item only | Distributed queue isolation and retries |
| Scheduler honesty | Real run and Active status throw `Integration Required` without a scheduler | Durable scheduler, worker leases, idempotency, retries |
| Privacy boundary | Persistent config rejects private keys, email/phone patterns, and supplied secrets; session-only private lane declared | Encrypted user-owned vault, tenant isolation, retention/export/deletion APIs |
| Analytics safety | Explicit allowlist for operational counts/categories only | Wire to an approved analytics sink with server enforcement |
| Templates | Generalized Job Search, Vendor Sourcing, Competitor Monitoring, Website QA | Admin template lifecycle and versioning |

## Privacy migration decision

No legacy browser data is deleted or silently migrated in this slice.

- **Required persistent data:** campaign operating contract, status, timestamps, operational item/run counts, blocker category, evidence references, and transitions.
- **Optional persistent data:** additional non-private campaign descriptions and report formatting preferences.
- **Unnecessary in campaign configuration:** raw prompts, chat transcript, resume text, identity/profile facts, credentials, form contents, uploaded document contents, and private execution state.
- **Session-only execution context:** resume/profile material used during an active task, page state, private answers, credentials, OTP/CAPTCHA, and form inputs.
- **Future user-owned secure storage:** encrypted tenant-scoped vault with explicit consent, least privilege, deletion/export, and retention controls. It does not exist yet.
- **Legacy compatibility:** existing job mission/desk localStorage remains untouched because deleting or changing it would be a destructive migration. It is visually separated as the legacy job workflow, not treated as the new campaign store.

## Status and evidence rules

- `Ready` means prepared for an authorized action; it is not completion.
- `Executed` requires evidence type, reference, source, and verification method.
- `Verified Complete` requires the same authoritative evidence metadata and is the only status counted as completed.
- An integration failure or human gate pauses the affected item, records its blocker, and leaves unrelated items eligible to continue.
- No preview or fixture run may be represented as a real run.

## Verification gate

Before production promotion: run the domain and smoke suites, exercise creation/edit/pause/resume/stop/export in desktop and mobile browsers, confirm existing job tools still open, inspect the preview deployment, and recheck that production remains on its prior deployment.

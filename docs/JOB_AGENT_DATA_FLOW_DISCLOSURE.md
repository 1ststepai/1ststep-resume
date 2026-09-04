# Job Agent — Data Flow Disclosure

**Prepared for:** external legal counsel, for use in revising `terms.html` and `privacy.html`
**Prepared by:** engineering (factual description only)
**Date prepared:** 2026-09-01
**Codebase inspected:** `1ststep-resume-deploy`, working tree as deployed to `app.1ststep.ai`
**Published policies referenced:** `terms.html` and `privacy.html`, both dated *Last updated: April 13, 2026*

## Purpose and limits of this document

This document describes, factually, what the 1stStep.ai Job Agent does with user data. It was produced by reading production code paths, not by reading the existing Privacy Policy, and in several places it contradicts that policy. Those contradictions are catalogued in the Policy Gap Appendix rather than resolved here.

This document contains **no legal conclusions and no proposed policy language**. It does not assert that any practice is or is not compliant, adequate, or permitted. It states only what the software does. Every claim below is traceable to a named source file, and file/line references are given so counsel's questions can be checked against the code directly.

Two statements of scope matter for reading everything that follows:

1. The product described as currently operating is **human-in-the-loop (HITL)**. No autonomous submission of an application to an employer is enabled.
2. The codebase **contains** substantially more capability than is enabled — including employer interaction and application submission. Those capabilities are described in Section 5 and are, at the time of writing, disabled by configuration. They are included because counsel should know what the system is built to do, not only what it does today.

---

## 1. Summary of the material facts

For counsel's orientation, the five facts most likely to affect a policy revision:

1. **Confirmed career data is stored server-side, encrypted, for up to 365 days.** The "applicant vault" (`lib/applicant-vault-store.js`) persists user-confirmed career facts and document text in Upstash Redis under AES-256-GCM envelope encryption with a rotating keyring. The published Privacy Policy §3 states the opposite.
2. **Upstash and Vercel Blob are undisclosed subprocessors.** Neither appears in the Privacy Policy §4 provider table. Upstash holds essentially all durable Job Agent state.
3. **The vault schema explicitly contemplates legally sensitive fields** — including citizenship, criminal history, disability, veteran status, clearance, and demographics — as a category the code calls "consequential fields." The code applies specific restrictions to them (Section 2.5).
4. **Revoking a fact or document is a soft delete.** Prior versions remain inside the encrypted record. Only full vault deletion or TTL expiry removes the underlying values.
5. **An external, retention-locked audit archive is designed into the system** with a 365–3650 day retention floor and a legal-hold policy version, and it is deliberately excluded from the user-deletion routine. It is currently disabled.

---

## 2. Data collected

Legend for the columns used throughout:
**Provider** = the infrastructure operator holding the data. **AI provider?** = whether this data is transmitted to an AI model vendor. **Employer?** = whether this data is transmitted to an employer or applicant-tracking system.

### 2.1 Account information

| | |
|---|---|
| **Data** | Email address, display/first/last name, plan tier, entitlements |
| **Source** | User at signup; Stripe at checkout |
| **Purpose** | Authentication, entitlement, billing, lifecycle CRM |
| **Where processed** | Vercel serverless functions (`api/user-session.js`, `api/subscription.js`, `api/beta.js`) |
| **Where stored** | Upstash Redis session records; GoHighLevel CRM contact record; Stripe customer record |
| **Provider** | Upstash, GoHighLevel, Stripe, Vercel |
| **Protection** | Session payloads AES-256-GCM encrypted with per-session AAD (`lib/user-session-store.js:103`); opaque session tokens |
| **Retention** | Session record 7 days (`SESSION_TTL_SECONDS`). CRM and Stripe records persist independently of the app |
| **Deletion** | Session deletion is implemented. **GoHighLevel and Stripe records are not deleted by the in-app deletion routine** |
| **AI provider?** | No. `api/claude.js` logs only `hasEmail: Boolean(userEmail)`; the address itself is not sent to the model or written to logs |
| **Employer?** | No |
| **Required?** | Required |

### 2.2 Uploaded résumé file

| | |
|---|---|
| **Data** | The PDF or DOCX file the user selects |
| **Source** | User upload |
| **Purpose** | Text extraction to seed the profile |
| **Where processed** | **In the user's browser.** PDF text extraction runs client-side via pdf.js (`app.js`, `concierge.js`, `funnel.html`) |
| **Where stored** | Not stored. The file itself is never transmitted to the server |
| **Provider** | None |
| **Protection** | n/a — never leaves the device as a file |
| **Retention** | n/a |
| **Deletion** | n/a |
| **AI provider?** | No — the binary file is not sent. Extracted *text* may be (see 2.3) |
| **Employer?** | No |
| **Required?** | Optional — the user may type their history instead |

### 2.3 Parsed résumé content / career story text

| | |
|---|---|
| **Data** | Plain text extracted from the uploaded file, or typed by the user |
| **Source** | Client-side extraction, or direct entry |
| **Purpose** | Fact extraction and résumé generation |
| **Where processed** | Browser → Vercel function (`api/claude.js`, `callType: profileExtractor`) → AI provider |
| **Where stored** | Not persisted server-side *at this stage*. Persisted only if the user confirms facts into the vault (2.4) |
| **Provider** | Vercel (transit), Anthropic (processing) |
| **Protection** | HTTPS in transit; server-side system prompt cannot be overridden by the client (`api/claude.js:274–299`); response is screened for prohibited secrets before return |
| **Retention** | Transient for the request. Vercel logs record **metadata only** — `promptLen`, `msgCount`, `model`, token counts — not content (`api/claude.js:420–428`) |
| **Deletion** | n/a at this stage |
| **AI provider?** | **Yes** |
| **Employer?** | No |
| **Required?** | Required to use generation features |

### 2.4 Confirmed career facts (the "applicant vault")

| | |
|---|---|
| **Data** | Normalized fact records: `fieldKey`, value, provenance, confidence, verification state, sensitivity, version history |
| **Source** | User confirmation only. `verificationState` must be `user-confirmed` or `document-verified` (`lib/applicant-vault-domain.js:100`) |
| **Purpose** | Reusable source of truth for résumé and application generation |
| **Where processed** | Vercel functions (`api/applicant-vault.js`) |
| **Where stored** | **Upstash Redis**, key `1ststep:vault:v1:<tenantId>` |
| **Provider** | **Upstash** — not disclosed in the current Privacy Policy |
| **Protection** | AES-256-GCM envelope encryption, per-tenant AAD bound to the storage key, rotating keyring of up to 4 keys (`lib/data-encryption-keyring.js`). Tenant ID is an HMAC-SHA256 of the subject, truncated to 40 hex chars — the raw email is not the storage key |
| **Retention** | **365 days** (`VAULT_TTL_SECONDS`), refreshed on write |
| **Deletion** | Full vault delete is implemented (`DELETE /api/applicant-vault`) and is invoked by account deletion. **Individual fact revocation is a soft delete**: status becomes `revoked`, but the value remains in `versions[]` until the whole record is deleted or expires (`lib/applicant-vault-domain.js:125–133`) |
| **AI provider?** | **Yes** — confirmed facts are supplied to the model inside `<verified_candidate_facts>` for résumé generation |
| **Employer?** | Not in the current HITL product |
| **Required?** | Optional; gated behind explicit in-vault consent (`requireConsent`) |
| **Limits** | 100 facts, 30 documents, 500 audit events, 12,000 chars per fact value, 750,000 bytes per vault |

### 2.5 Consequential and legally sensitive fields

The vault schema defines a `CONSEQUENTAL_FIELDS` set (`lib/applicant-vault-domain.js:17–21`) covering: `authorization`, `sponsorship`, `outsideEmployment`, `background`, `drugHealth`, `formerEmployerConflict`, `references`, `licenses`, `driving`, `demographics`, `citizenship`, `clearance`, `exportControl`, `criminalHistory`, `disability`, `veteranStatus`, `referrals`, `restrictiveAgreements`.

Code-level restrictions currently applied to these:

- **Auto-reuse is forced off.** `autoReuse` is hard-set to `false` for any consequential field, so such a value cannot be silently reused across applications (`lib/applicant-vault-domain.js:106`).
- **Demographics are restricted to two literal values.** A `demographics` fact is rejected unless its value is `leave optional demographics unanswered` or `prefer not to answer` (`lib/applicant-vault-domain.js:102–104`). No actual demographic response can be stored.
- **Credential-shaped keys are rejected outright.** Any `fieldKey` matching password/OTP/CAPTCHA/MFA/token/cookie/API-key patterns is refused (`lib/prohibited-secret.js`).
- **Every write is audited** with a `consequential: true` flag on the audit event.

Counsel should note that the remaining fields in that set — citizenship, criminal history, disability, veteran status, clearance — **can** hold user-supplied values today, subject to the same 365-day encrypted storage as any other fact.

### 2.6 Employment history and job preferences

| | |
|---|---|
| **Data** | Employers, titles, dates, skills, education, licenses, uncertainties; desired role, location, remote preference |
| **Source** | AI extraction from 2.3, confirmed by the user; direct entry |
| **Purpose** | Résumé generation, job matching, fit scoring |
| **Where processed** | Vercel functions; AI provider for extraction |
| **Where stored** | Vault (2.4) once confirmed; browser `localStorage` before confirmation |
| **Provider** | Upstash; the user's own browser |
| **Protection** | As 2.4 |
| **Retention** | 365 days server-side; indefinite in the browser until cleared |
| **Deletion** | Vault delete; browser clear |
| **AI provider?** | **Yes** |
| **Employer?** | Not in the current HITL product |
| **Required?** | Required for matching |

### 2.7 Job descriptions

| | |
|---|---|
| **Data** | Public job posting text and metadata |
| **Source** | JSearch/RapidAPI (`api/jobs.js`); public ATS boards — Greenhouse, Ashby (`lib/public-ats-discovery.js`); user paste |
| **Purpose** | Analysis, fit scoring, tailoring |
| **Where processed** | Vercel functions; AI provider |
| **Where stored** | Job *metadata* in the campaign store (2.9). Full description text is not persisted server-side |
| **Provider** | Upstash (metadata) |
| **Protection** | Encrypted campaign state |
| **Retention** | 90 days for metadata |
| **Deletion** | Campaign state delete |
| **AI provider?** | **Yes** |
| **Employer?** | n/a — this is data *from* employers |
| **Required?** | Required |
| **Note on outbound content** | `api/jobs.js` enforces a strict parameter allowlist (`ALLOWED_PARAMS`, lines 7–11): `query`, `page`, `num_pages`, `date_posted`, `remote_jobs_only`, `employment_types`, `job_requirements`, `country`, `radius`, `job_id`, `extended_publisher_details`. **No résumé content and no user identity is transmitted to the job-search provider.** Public ATS fetches send only `Accept: application/json` |

### 2.8 Saved jobs and application status (tracking)

| | |
|---|---|
| **Data** | Job cards — id, employer, title, status, requisition ID, source provider, salary range, employment type, posted date, travel, schedule, remote/geography eligibility, timestamps |
| **Source** | User action on a discovered job |
| **Purpose** | Application tracking |
| **Where stored** | Upstash Redis, key `1ststep:beta:v1:<tenantId>:campaign` |
| **Provider** | **Upstash** — undisclosed |
| **Protection** | AES-256-GCM envelope encryption. **The store actively rejects private fields**: a `PRIVATE_KEY` guard refuses any key matching `firstName, lastName, fullName, email, phone, address, resume, resumeText, employmentHistory, candidateProfile, privateContext, credential, password, passcode, otp, captcha, mfa` (`lib/tenant-campaign-store.js:8, 26`). Tracking state is metadata-only by construction |
| **Retention** | **90 days** (`STATE_TTL_SECONDS`) |
| **Deletion** | `deleteTenantCampaignState`, invoked by account deletion |
| **AI provider?** | Job metadata may be included in analysis prompts |
| **Employer?** | No |
| **Required?** | Optional |

### 2.9 Generated résumés and cover letters

| | |
|---|---|
| **Data** | AI-generated tailored résumé text and cover letter text |
| **Source** | Generated from 2.4 + 2.7 |
| **Purpose** | The user's application materials |
| **Where processed** | Vercel functions; AI provider |
| **Where stored** | Returned to the browser. Optionally saved to the vault as a `tailored-resume` or `cover-letter` document (2.4). Rendered PDF/DOCX artifacts go to Vercel Blob **only when object storage is enabled** |
| **Provider** | Upstash (text), Vercel Blob (rendered files) |
| **Protection** | Vault encryption for text; Blob objects are private, path-derived from hashed tenant/run/artifact identifiers, and require a SHA-256 content hash |
| **Retention** | Vault text 365 days; **Blob artifacts 30 days** (`RETENTION_SECONDS`, `lib/job-agent-object-storage.js:7`) |
| **Deletion** | `deleteAllApplicationPackageArtifactsForTenant`, invoked by account deletion |
| **AI provider?** | Yes — they are model output |
| **Employer?** | Only if the user downloads and submits them. The system does not transmit them |
| **Required?** | Optional |
| **Current state** | Object storage is **disabled**. `lib/application-package-worker.js:147` sets `documentMode = 'text-only'` when it is not ready, and rendered artifacts are never produced |

### 2.10 Application preparation state (sessions)

| | |
|---|---|
| **Data** | Multi-step workflow state for preparing one application; per-step transitions and human actions |
| **Source** | System, driven by user actions |
| **Purpose** | Resumable preparation |
| **Where stored** | Upstash Redis |
| **Provider** | **Upstash** — undisclosed |
| **Protection** | Encrypted; idempotency-keyed writes |
| **Retention** | **365 days**, with a separate 365-day session audit trail (`lib/application-session-store.js:7–9`) |
| **Deletion** | `deleteAllDurableApplicationSessions`, invoked by account deletion |
| **AI provider?** | Content within a step may be |
| **Employer?** | Not in the current HITL product |
| **Required?** | Optional |

### 2.11 Interview-preparation data

At the time of inspection there is **no dedicated interview-preparation store**. Interview-related guidance is produced as conversational output through `api/claude.js` (`callType: concierge`) and is not persisted server-side beyond ordinary session state. If interview preparation becomes a persisted feature, this section must be rewritten before the policy is relied upon.

### 2.12 Usage, audit and operational data

| Store | Contents | Retention | Deleted on account deletion? |
|---|---|---|---|
| Vault audit events | Fact/document create, update, revoke; consequential flag | Inside the vault, 365 days | Yes (with the vault) |
| Application session audit | Step transitions, human actions | 365 days | Yes |
| Job Agent runs | Run status and outcome | 30 days | Yes |
| Notification delivery records | Send attempts | 30 days | Preference record yes; delivery records expire |
| Email suppression list | Bounce/complaint suppression | 30 days | **No** — retained for deliverability |
| Operational metrics | Aggregate counters, worker heartbeats | 8 days | **No** — not user-identifying |
| Monetary spend ledger | Reservation/settlement records, no candidate values (`containsCandidateValues: false`) | 8 days | **No** |
| Stripe webhook idempotency | Event IDs | 35 days | **No** |
| Rate-limit partitions | Hashed subject/IP counters | Per-window | **No** |
| Vercel request logs | Timestamps, status, model, token counts, prompt *length* | Per Vercel retention | **No** |
| External audit archive | Signed audit head exports | **365–3650 days, retention-locked** | **No — by design** |

---

## 3. Subprocessors and infrastructure, as found in code

Determined by enumerating outbound network destinations and infrastructure clients in `api/` and `lib/`.

| Processor | Role | Data received | In Privacy §4 today? |
|---|---|---|---|
| **Vercel** | Hosting, serverless compute, request logs | All request traffic; logs contain metadata only | **Yes** |
| **Vercel Blob** | Private object storage for rendered documents | Encrypted/derived-path application artifacts | **No** |
| **Upstash Redis** | Primary durable store for all Job Agent state | Vault, sessions, tracking, runs, consent, schedules, ledger, rate limits | **No** |
| **Anthropic** | AI model provider (currently active) | Résumé text, career facts, job descriptions, prompts | **Yes** |
| **Stripe** | Payments | Name, email, payment details (Stripe-hosted) | **Yes** |
| **JSearch / RapidAPI** | Job search | Search terms only — allowlisted parameters, no résumé, no identity | **Yes** |
| **GoHighLevel** (`services.leadconnectorhq.com`) | CRM and lifecycle marketing | Email, first/last name, lifecycle tags (`paid`, `converted`, `job_hunt_pass`, tier, beta/churn/power-user stages), pipeline opportunity | **Yes**, but purpose is described only generally |
| **Resend** (`api.resend.com`) | Transactional email | Recipient address, notification body | **Not named** |
| **Greenhouse** (`boards-api.greenhouse.io`) | Public job-board read | Outbound fetch only; `Accept` header, no user data | **No** |
| **Ashby** (`api.ashbyhq.com`) | Public job-board read | Outbound fetch only; no user data | **No** |
| **LinkedIn** (`api.linkedin.com/v2/userinfo`) | OAuth identity | OAuth token exchange, profile identity | **No** |

### 3.1 The AI provider is configuration-selected

`lib/ai-provider.js:3–14` selects among three provider families at runtime from environment variables alone, with no code change:

- `anthropic` → `api.anthropic.com`
- `cloudflare` → `api.cloudflare.com/client/v4/.../ai/run/...` (Cloudflare Workers AI)
- `openai-compatible` → `api.openai.com/v1` by default, **or any host set in `AI_BASE_URL`**

Production currently holds an Anthropic key and no Cloudflare or OpenAI credentials, so **Anthropic is the active provider today**. Counsel should be aware that the set of AI subprocessors is determined by configuration, and that any policy naming a single AI vendor will require an operational control to stay accurate.

### 3.2 Optional, currently disabled

| Processor | Role | Gate |
|---|---|---|
| External audit archive | Retention-locked WORM archive of signed audit exports | `JOB_AGENT_AUDIT_ARCHIVE_ENABLED` + `_APPROVED` + contract, approval and legal-hold policy versions + host allowlist + three ≥32-char secrets + retention 365–3650 days |
| Employer browser session provider | Remote browser used to interact with employer sites | `EMPLOYER_BROWSER_SESSION_PROVIDER`, `EMPLOYER_BROWSER_REMOTE_STREAM_*`, plus provider-cost approvals |
| Malware scanner | Required before object storage may operate in production | `malwareScannerConfiguration(env)` |

---

## 4. Data flows — internal HITL product

Notation: `[browser]` client-side, `[vercel]` serverless function, `[upstash]` Redis, `[ai]` AI provider, `[blob]` Vercel Blob.

### 4.1 Résumé upload → parsing → career facts → storage

```
User selects a PDF/DOCX
  → [browser] pdf.js extracts text locally; the file never leaves the device
  → [browser] POST /api/claude {callType:"profileExtractor"}
  → [vercel] server-side system prompt is forced; client system prompt is ignored
  → [ai]     returns strict JSON: contact, employment, education, skills,
             licenses, uncertainties  (model is instructed not to infer)
  → [browser] user REVIEWS and CONFIRMS each extracted fact
  → [browser] POST /api/applicant-vault  (requires DATA_CONSENT policy level)
  → [vercel] AES-256-GCM envelope encryption, AAD = tenant storage key
  → [upstash] 1ststep:vault:v1:<hmac(subject)>   TTL 365 days
```

Two properties worth flagging to counsel. Nothing enters durable storage without an explicit user confirmation step. And the raw uploaded file is never transmitted at all — only text the user has seen.

### 4.2 Job discovery → job description → analysis and scoring

```
User enters search criteria
  → [vercel] GET /api/jobs  — parameter allowlist applied
  → JSearch/RapidAPI   (search terms only; no résumé, no identity)
     and/or
  → [vercel] public ATS fetch: Greenhouse, Ashby  (no user data outbound)
  → [browser] results rendered
  → [vercel] POST /api/ai  (capability ANALYSIS)
  → [ai]     fit scoring against confirmed facts
  → [browser] score and rationale displayed
```

### 4.3 Career facts + job → AI → tailored materials → storage/download

```
[upstash] confirmed facts  ─┐
[browser] job description  ─┴→ [vercel] POST /api/claude
                                        {callType:"resumeBuilder"}
                                        facts wrapped in <verified_candidate_facts>
  → [ai]  generates tailored résumé / cover letter text
  → [vercel] output screened for prohibited secrets
  → [browser] user reviews and edits
  → optionally: POST /api/applicant-vault  → [upstash] as a vault document, 365 days
  → optionally: package run → [vercel] render → [blob] 30 days
                *** CURRENTLY: object storage disabled → documentMode = "text-only";
                    no rendered artifact is produced and none is stored ***
  → user downloads the file themselves
```

**No path in this flow transmits anything to an employer.** The final step is a download by the user.

### 4.4 Job → application tracking

```
User marks a job as saved / applied
  → [vercel] POST /api/concierge-state
  → PRIVATE_KEY guard rejects any personal field
  → [vercel] encrypt metadata-only job card
  → [upstash] 1ststep:beta:v1:<tenantId>:campaign   TTL 90 days
```

### 4.5 User deletion → affected storage systems

`lib/account-data-deletion.js` invokes fourteen deletion operations:

```
account exports · package artifacts (Blob) · follow-up reminders · runs ·
application sessions · employer-browser tasks · submission tasks ·
receipt tasks · applicant vault · campaign/tracking state · consent record ·
schedule · notification preferences · residual idempotency keys
```

**Not reached by this routine**, and therefore surviving a user deletion request:

- GoHighLevel CRM contact and lifecycle tags
- Stripe customer and payment records
- Email suppression list entries (30-day self-expiry)
- Operational metrics and spend-ledger records (8-day self-expiry; no candidate values)
- Stripe webhook idempotency records (35-day self-expiry)
- Vercel request logs
- **The external audit archive, which is retention-locked by design**

---

## 5. Future / disabled external agent capabilities

> **These capabilities are NOT enabled. No user of the product today is subject to them.** They are documented because the code implements them and because a policy revision made without knowing they exist may need revising again shortly.

`lib/job-agent-capabilities.js` declares seven capabilities. Their policy levels:

| Capability | Policy level | External? | Enabled today |
|---|---|---|---|
| DISCOVERY | none | No | **Yes** |
| ANALYSIS | none | No | **Yes** |
| DOCUMENT_GENERATION | none | No | **Yes** |
| TRACKING | none | No | **Yes** |
| SCHEDULED_DISCOVERY | authorization | No | No |
| EXTERNAL_INTERACTION | external | **Yes** | **No** |
| APPLICATION_SUBMISSION | external | **Yes** | **No** |

### 5.1 What the disabled capabilities are designed to do

- **Employer browser sessions.** A remote browser provider is used to open an employer's application page, with a streaming view. Session state has a 24-hour TTL; task records 30 days.
- **Application submission.** Multi-step submission with explicit human confirmation checkpoints — `request-final-review`, `refresh-final-approval`, `confirm-submission`, `confirm-transmission`, `record-post-submission`, `confirm-external-step`, `reconcile-employer-failure` — each classified as requiring the EXTERNAL policy level.
- **Receipt evidence capture.** Post-submission evidence of what was transmitted.
- **Scheduled discovery.** Recurring background job search on a stored schedule (365-day TTL).

If enabled, these would transmit user-supplied application content to third-party employers and ATS platforms — the first data flow in the entire system that sends candidate data to an employer.

### 5.2 The specific gates currently holding them closed

Each is independently sufficient; all are presently in the closed state.

| Gate | Variable(s) | Current |
|---|---|---|
| Counsel approval | `JOB_AGENT_COUNSEL_APPROVED` | Not set |
| Authorization instrument | `JOB_AGENT_AUTHORIZATION_VERSION` | Not set |
| Final submission execution | `JOB_AGENT_FINAL_SUBMISSION_EXECUTION_ENABLED` / `_APPROVED` / `_APPROVAL_VERSION` / `_EVIDENCE` | Not set |
| Durable submission execution | `JOB_AGENT_FINAL_SUBMISSION_DURABLE_EXECUTION_ENABLED` / `_APPROVED` / `_APPROVAL_VERSION` | Not set |
| Employer browser provider | `EMPLOYER_BROWSER_SESSION_PROVIDER`, `EMPLOYER_BROWSER_REMOTE_STREAM_*` | Not set |
| Employer browser spend | `JOB_AGENT_EMPLOYER_BROWSER_DAILY_BUDGET_CENTS` / `_MAX_SESSION_CENTS` | **Deliberately unset — fails closed** |
| Audit archive | `JOB_AGENT_AUDIT_ARCHIVE_ENABLED` and 7 further variables | Not set |

The design is fail-closed: an unset variable disables the capability rather than defaulting it on.

---

## 6. Policy gap appendix

Conflicts and omissions between the published documents and the behaviour described above. Quotations are the minimum needed to identify the passage.

### 6.1 Direct conflicts — `privacy.html` §3, "How Your Data Is Processed"

**Conflict 1 — server-side storage of résumé content.**
The section states: *"We do not permanently store your resume content on our servers."*
It further states that *"account name, email, and usage counts"* are the only data retained beyond the session.
Contradicted by: the applicant vault (§2.4 above) stores confirmed career facts and full document text — including `master-resume`, `tailored-resume` and `cover-letter` documents up to 120,000 characters each — in Upstash Redis for 365 days.

**Conflict 2 — session data leaving the device.**
The same section states that browser-stored session data *"never leaves your device unless you explicitly submit it through the app."*
Contradicted by: durable application sessions, campaign/tracking state, run records and schedules are all persisted server-side in Upstash. Whether the user's in-app actions constitute the "explicit submission" carve-out is a question for counsel, not an engineering determination; flagging it because the sentence reads as a general assurance.

**Conflict 3 — the retained-data list is incomplete.**
Same section, same sentence as Conflict 1. Beyond name, email and usage counts, the system durably retains: career facts, document text, job-card metadata, application session state and audit trails, run records, consent records, schedules and notification preferences.

### 6.2 Omissions — `privacy.html` §4, "Third-Party Services"

The provider table lists Anthropic, Stripe, Vercel, JSearch/RapidAPI and GoHighLevel. Missing:

- **Upstash Redis** — holds effectively all durable user data
- **Vercel Blob** — object storage for rendered documents, listed separately because it is a distinct storage product with its own 30-day retention
- **Resend** — transactional email, receives recipient addresses
- **Greenhouse and Ashby** — outbound only, no user data transmitted; listed for completeness
- **LinkedIn** — OAuth identity
- **Cloudflare Workers AI / OpenAI-compatible endpoints** — not active, but selectable by configuration alone (§3.1)

### 6.3 Omissions — `privacy.html` §5, "Data Retention"

The section commits to removing personally identifiable information *"within 30 days"* of a deletion request, and describes retention only of *"account information (name and email)."* Not addressed:

- Retention periods for vault (365 days), sessions and session audit (365 days), tracking (90 days), runs (30 days), Blob artifacts (30 days), schedules (365 days), consent (365 days)
- That fact and document *revocation* is a soft delete leaving prior versions in the encrypted record
- That GoHighLevel, Stripe, email suppression and Vercel logs are not reached by the in-app deletion routine
- That the audit archive, when enabled, is retention-locked for 365–3650 days and is intentionally excluded from deletion

### 6.4 Omissions — `privacy.html` §1, "Information We Collect"

The collection table does not describe: confirmed career facts as a distinct category; the consequential-field set including citizenship, criminal history, disability, veteran status and clearance (§2.5); saved jobs and application status; application preparation state; or audit records.

### 6.5 Omissions and inaccuracy — `terms.html`

- **§4, Subscription Plans and Payment** — describes the paid tier as including a *"Chrome extension workflow."* That offering has been de-listed. This is a factual inaccuracy about what is being sold.
- **§1 / §4** — the product is described as résumé tailoring and job search. The Job Agent, application tracking, application sessions, and document storage are not described anywhere in the Terms.
- **§6, Your Content** — states *"We do not use your resume content to train AI models."* This appears consistent with the code, which sends content to the provider's inference API only. Flagged for counsel to confirm against the current vendor agreement rather than the code.
- **§7, AI-Generated Outputs** — does not allocate responsibility for the accuracy of AI-generated application materials that the user then submits to an employer under their own name.
- **§9, Third-Party Services** — same subprocessor omissions as §6.2.
- **Not covered anywhere** — agent action taken on the user's behalf; scheduled/background execution; usage caps and the fact that a request may be refused with HTTP 429 when a spend cap is reached.

---

## 7. QUESTIONS REQUIRING LEGAL REVIEW

Checklist for counsel. Engineering has deliberately not answered any of these.

**Storage and the existing representation**

- [ ] Privacy §3 affirmatively tells existing users that résumé content is not stored on our servers. Given the vault, how should this be corrected, and does correcting it require notice to, or fresh consent from, users who accepted the current version?
- [ ] Is the change material enough that a silent update to the policy is not appropriate?
- [ ] Does the "unless you explicitly submit it through the app" clause in §3 cover in-app actions that persist state server-side, or does that sentence need to go?

**Subprocessors**

- [ ] Which of Upstash, Vercel Blob, Resend, LinkedIn, Greenhouse and Ashby must be named, and at what granularity?
- [ ] The AI provider is selectable by environment variable (§3.1). May the policy name a single AI vendor, and what operational control is needed to keep that statement true?
- [ ] Are data processing agreements in place with Upstash and Resend?

**Retention and deletion**

- [ ] Are the code-level retention periods (365 / 90 / 30 / 8 days) the intended commitments, and should they be stated in the policy or kept internal?
- [ ] Soft-deleted fact and document versions persist inside the encrypted record after the user revokes them. Is that consistent with the 30-day deletion commitment in §5 and with NJDPA/CCPA deletion rights?
- [ ] GoHighLevel and Stripe records survive an in-app deletion request. Is a manual or automated downstream deletion step required?
- [ ] What must the policy say about Vercel request logs, which retain prompt *length* and token counts but not content?

**Sensitive categories**

- [ ] The vault can store citizenship, criminal history, disability, veteran status and security clearance as user-confirmed facts. What consent, notice, minimization or outright prohibition should apply to each?
- [ ] Does storing these categories implicate EEO/OFCCP recordkeeping rules, state ban-the-box laws, ADA restrictions on disability inquiries, or state sensitive-data provisions?
- [ ] The code restricts `demographics` to "unanswered" or "prefer not to answer" only. Should that restriction be extended to other fields in the consequential set?
- [ ] Should any of these categories be removed from the schema entirely rather than disclosed?

**Terms**

- [ ] Terms §4 still sells a Chrome extension workflow that has been de-listed. How should that be corrected?
- [ ] Who bears responsibility for the accuracy of AI-generated application materials submitted by the user to an employer? Terms §7 is silent.
- [ ] Does the Job Agent need its own section, or can it be described within the existing product description?

**The audit archive**

- [ ] The archive is designed to be retention-locked for 365–3650 days and is excluded from user deletion. Is a retention-locked archive that survives a deletion request permissible, and under what stated basis?
- [ ] Should it remain disabled until the policy describes it?

**Consent architecture**

- [ ] Engineering is holding at NO-GO on creating DATA_CONSENT version identifiers, on the basis that versioning the current documents would record consent against text that describes storage practices the system does not follow. Does counsel agree that revision must precede versioning?
- [ ] The three consent scopes the system would gate are `confirmed-profile-storage`, `ai-document-preparation` and `application-workspace`. Should these be presented to users as separate consents or as one?

**Before external capability is ever enabled** (not needed now; listed so it is not discovered late)

- [ ] What authorization instrument must a user execute before the system may interact with an employer on their behalf?
- [ ] What disclosure is required about materials transmitted to employers and ATS platforms?
- [ ] Do any states restrict automated submission of employment applications on another person's behalf?

---

## Appendix A — Retention constants, verbatim from code

| Store | File | Constant | Value |
|---|---|---|---|
| Applicant vault | `lib/applicant-vault-store.js` | `VAULT_TTL_SECONDS` | 365 days |
| Application sessions | `lib/application-session-store.js` | `TTL_SECONDS` | 365 days |
| Session audit | `lib/application-session-store.js` | `AUDIT_TTL_SECONDS` | 365 days |
| Follow-up reminders | `lib/application-follow-up-store.js` | `TTL_SECONDS` | 365 days |
| Receipt tasks | `lib/application-receipt-task-store.js` | `TTL_SECONDS` | 365 days |
| Submission tasks | `lib/application-submission-task-store.js` | `TTL_SECONDS` | 365 days |
| Consent records | `lib/job-agent-consent-store.js` | `CONSENT_TTL_SECONDS` | 365 days |
| Schedules | `lib/job-agent-schedule-store.js` | `SCHEDULE_TTL_SECONDS` | 365 days |
| Notification preferences | `lib/job-agent-notification-store.js` | `PREFERENCE_TTL_SECONDS` | 365 days |
| Campaign / tracking state | `lib/tenant-campaign-store.js` | `STATE_TTL_SECONDS` | 90 days |
| Stripe webhook idempotency | `lib/stripe-webhook-idempotency.js` | `RETENTION_SECONDS` | 35 days |
| Blob artifacts | `lib/job-agent-object-storage.js` | `RETENTION_SECONDS` | 30 days |
| Job Agent runs | `lib/job-agent-run-store.js` | `RUN_TTL_SECONDS` | 30 days |
| Employer browser tasks | `lib/employer-browser-task-store.js` | `TTL_SECONDS` | 30 days |
| Notification deliveries | `lib/job-agent-notification-store.js` | `DELIVERY_TTL_SECONDS` | 30 days |
| Email suppression | `lib/job-agent-email-suppression.js` | `EVENT_TTL_SECONDS` | 30 days |
| Operational metrics | `lib/job-agent-operational-metrics.js` | `RETENTION_SECONDS` | 8 days |
| Spend ledger | `lib/job-agent-spend-ledger.js` | `RETENTION_SECONDS` | 8 days |
| User sessions | `lib/user-session-store.js` | `SESSION_TTL_SECONDS` | 7 days |
| Employer browser session | `lib/employer-browser-session-store.js` | `TTL_SECONDS` | 24 hours |
| Account export tasks | `lib/account-data-export-task.js` | `TTL_SECONDS` | 24 hours |
| Idempotency keys (all stores) | various | `IDEMPOTENCY_TTL_SECONDS` | 24 hours |
| Extension handoff token | `lib/extension-application-handoff.js` | `TOKEN_TTL_MS` | 2 minutes |
| External audit archive | `lib/application-audit-archive-provider.js` | `JOB_AGENT_AUDIT_ARCHIVE_RETENTION_DAYS` | 365–3650 days (enforced range) |

## Appendix B — How to re-verify this document

Every factual claim above can be re-checked without running the application:

- Retention values: `grep -rnoE "const [A-Z_]*(TTL|RETENTION)[A-Z_]* = [^;]+" lib/`
- Outbound network destinations: `grep -rhoE "https://[a-zA-Z0-9.-]+\.[a-z]{2,}" api/ lib/ --include=*.js | sort -u`
- Deletion coverage: `lib/account-data-deletion.js`, imports at lines 1–14
- Capability policy levels: `lib/job-agent-capabilities.js`
- Consequential field set: `lib/applicant-vault-domain.js:17–21`
- Tracking-store private-field guard: `lib/tenant-campaign-store.js:8`

---

**Document status:** factual engineering disclosure. Not legal advice, not a policy draft, and not an assertion of compliance. `terms.html` and `privacy.html` were not modified in the course of preparing it; both remain byte-pinned and their SHA-256 digests verify.

---

## Appendix C — Implementation status (appended 2026-09-01)

The findings in this document have been recorded as prioritized backlog items in `docs/JOB_AGENT_BACKLOG.md`. **None of them have been addressed.** They are open items:

| Ref | Item | Status |
|---|---|---|
| P0-1 | Protected-category fields in the vault schema (§2.5, §7) | Recorded — not started. Blocks durable career-profile storage |
| P0-2 | Revocation soft-deletes while retaining `versions[]` (§2.4, §6.3) | Recorded — not started. Blocks describing revocation as deletion |
| P0-3 | DATA_CONSENT versions remain unset (§6.1, §7) | Standing hold until Terms/Privacy are deliberately revised |
| P1-1 | AI provider selectable by environment variable (§3.1) | Recorded — not started. Allowlist control required before enabling additional providers |
| P1-2 | Retention-locked audit archive excluded from deletion (§3.2, §4.5) | Recorded — not started. Remains disabled |

Counsel should read this document as describing the system **as it currently behaves**, not as a description of intended future behavior. No mitigation has been applied to any conflict identified in the Policy Gap Appendix.

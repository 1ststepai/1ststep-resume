# AI Memory

## Operating Rules

- Use minimal context.
- Search before opening large files.
- Do not rewrite large files unless necessary.
- Prefer small PR-sized changes.
- Always run verification before claiming done.
- Keep final summaries short and action-oriented.

## 1stStep.ai Context

Primary app: https://app.1ststep.ai/
Resume builder landing page: https://resume.1ststep.ai/

1stStep is a job-application workflow product, not just an AI resume generator.

Core workflow:
- Upload resume
- Paste or capture job description
- Generate tailored resume
- Generate cover letter
- Review match score
- Track jobs in the Job Tracker
- Use Chrome extension to capture jobs from job boards and ATS pages
- Prep for interviews
- Preserve resume history

## Known Technical Context

- Hosted on Vercel.
- Uses GitHub PR workflow.
- Static QA checks and smoke tests may be required before merge.
- Do not touch production env vars from code.
- Never expose Stripe, Resend, Claude, Supabase, Vercel, or owner-access secrets.

## Shared Job Agent Architecture and Memory

This section is the shared operating contract for Claude, Codex, and any other agent building the Job Agent for `app.1ststep.ai`. Read it before changing discovery, matching, document generation, tracker, application-session, submission, receipt, or follow-up behavior. The detailed implementation contract remains `docs/JOB_AGENT_RUNTIME.md`; this section records the cross-agent invariants.

### Sources of truth

- Production product state belongs in the tenant-partitioned durable Job Agent stores, including discovered-job/campaign state, application sessions, receipts, actions, and audit records. Browser local storage and Markdown files are not authoritative production ledgers.
- The local search automation ledger at `C:\Users\evanp\.codex\automations\remote-job-search-agent\memory.md` is the detailed operational history for Evan's supervised search when that path is available. It must be reconciled into durable app records before the app treats a historical role or application as current.
- Never copy resumes, answers, credentials, OTPs, CAPTCHA values, identity documents, raw employer evidence, or other private candidate data into this file, agent prompts, logs, or source control.
- If a store or employer signal is unavailable, its state is `unknown`. Absence of evidence is not proof that a job is new, an application was not submitted, or a role is closed.

### Duplicate-prevention contract

Before creating a discovered job, package, application session, or submission task, perform a tenant-scoped lookup across active and historical Job Agent records, imported legacy tracker records, authoritative receipts, and the available supervised-search ledger.

Resolve identity in this order:

1. Exact ATS/provider plus employer requisition ID.
2. Exact normalized canonical employer application URL after removing tracking parameters and normalizing host/path rules.
3. Exact source provider plus source job ID when it has a verified mapping to the employer listing.
4. Normalized employer plus title plus location/workplace combination only as a possible-duplicate signal requiring reconciliation, never as permission to create a second application.

The server must enforce the same canonical identity with a durable tenant-scoped unique constraint or atomic idempotency operation. A read-before-write check alone is insufficient. On conflict, return and update the existing record, attach the new source observation, refresh `last_seen`/freshness evidence, and preserve its state history. Do not create another package or application.

Treat every existing non-deleted record as a duplicate candidate, including New, Package Ready, Needs You/Human Action Required, Preparing, Submitted, Interview, Rejected/Closed, Follow-up Due, and outcome-unknown states. Reapplication requires an explicit policy decision tied to a genuinely new requisition or an approved reopen event; a different source URL, title punctuation, location spelling, or refreshed posting date does not make a job new.

Each state-changing command must carry a stable idempotency key derived from tenant, canonical job identity, action type, and relevant version. Replayed commands return the prior result. Concurrent workers must not create parallel sessions, packages, final-action tasks, or receipts.

### Submission and state rules

- Package generation does not mean Applied or Submitted.
- Filling fields, clicking an employer control, receiving HTTP 2xx, or receiving a provider acceptance does not mean Submitted.
- Only an authoritative, verified employer receipt may move the application to Submitted and count it toward goals.
- A timeout, crash, transport failure, or otherwise ambiguous external result becomes outcome unknown. Preserve the exact attempt for reconciliation, block automatic retry, and create one focused Needs You action if authoritative verification cannot resolve it.
- OTP, CAPTCHA, identity verification, missing candidate facts, consequential questions, and final approval remain human gates. Never infer or fabricate answers.
- State changes are append-audited. Do not silently move a terminal or receipt-backed state backward, and do not erase prior source observations when a listing changes or closes.

### Model-efficiency and scale contract

Model usage is an exception, not the default execution path. The Job Agent must remain economically viable when many tenants run daily searches.

- Keep discovery polling, ATS normalization, canonical identity, duplicate checks, hard-filter evaluation, scheduling, permissions, state transitions, receipts, and audit writes entirely deterministic and model-free.
- Do not call a model for roles rejected by salary, location, workplace, employment type, travel, blocked-employer, active-path, or exact-duplicate rules.
- Reduce every surviving role to a compact structured representation before model use. Retrieve only relevant verified candidate facts by reference/version instead of repeatedly sending the full resume, complete profile, raw posting HTML, or prior conversation.
- Route work through the least expensive capable path: deterministic rules first, a small/low-cost model for bounded semantic classification, and a larger model only for an approved high-value document or genuinely ambiguous decision that the smaller path cannot resolve.
- Batch bounded role summaries for ranking when practical, then generate documents only for the highest-ranked roles that pass policy. Do not run one unconstrained agent conversation per discovered job.
- Cache encrypted tenant-scoped results by task type, canonical job version/fingerprint, candidate-profile version, policy version, prompt version, and model tier. Reuse matching evaluations and packages until one of those inputs materially changes.
- Give every model operation a stable idempotency key. Never repeat a paid call after a timeout or unknown provider outcome unless persisted provider evidence proves the original call did not start.
- Enforce per-run, per-tenant, per-day, and global limits for calls, input tokens, output tokens, and estimated cost. Reserve the worst-case approved amount before provider contact and fail closed or defer work when a limit would be exceeded.
- Require compact structured output with explicit field and token limits. Do not request or store chain-of-thought, verbose explanations, duplicate summaries, or raw model transcripts.
- Run expensive evaluation, shadow, and quality-review workloads on a bounded sample or explicit release test, not on every production application.
- Record content-free model telemetry: task type, model tier, input/output token counts, estimated/settled cost, latency, cache hit, retry outcome, and policy version. Never include resume text, profile facts, job text, or applicant answers in cost logs.

Scale targets: at least 95% of discovered roles should complete normalization, deduplication, and hard filtering without a model call; a surviving search batch should normally require no more than one bounded low-cost ranking call; and each canonical job/profile version should produce at most one paid package-generation result unless a verified material input changes.

### Cross-agent synchronization workflow

1. Read this file and `docs/JOB_AGENT_RUNTIME.md` before Job Agent work.
2. Load the tenant's durable job/application state before discovery or application creation.
3. When available for Evan's supervised workflow, reconcile the local automation ledger before declaring a role new.
4. Use the same canonical identity and idempotency key at discovery, package, session, task, and receipt boundaries.
5. Write every accepted observation and state transition to the durable app ledger with source, timestamps, evidence classification, and audit event.
6. Update this section whenever the canonical identity algorithm, status semantics, or source-of-truth architecture changes so Claude and Codex remain aligned.

Latest known supervised-search snapshot, recorded from the local automation ledger on 2026-09-04 at 08:31 ET: 20 roles reviewed in that run, 0 newly qualified roles, 11 Package Ready total, 13 Human Action Required total, 0 Submitted with verified receipts, and no Interview or Follow-up Due changes. This snapshot is historical context, not confirmed current product state; reconcile it before use.

## Common Verification

Use available scripts from `package.json`.

Likely useful commands:

```bash
node --check app.js
node scripts/smoke-test.cjs
npm run build
npm run lint
```

If a command is missing, inspect scripts first and choose the closest safe check.

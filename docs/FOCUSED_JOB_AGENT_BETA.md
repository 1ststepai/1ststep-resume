# Focused Job Agent Beta

## Customer journey

`/concierge` is the primary customer surface. The legacy resume, search, tracking, bulk-tailoring, and LinkedIn tools are no longer linked from the Job Agent experience; their code remains available as internal capabilities while the focused product is validated.

1. Add or build one truthful resume.
2. Compare job paths against the connected direct-employer feeds.
3. Choose work setting, employment type, salary floor, and optional exclusions.
4. Restore controlled-beta access and start the agent.
5. Follow one run state: Searching, Preparing, Waiting for You, Paused, or Finished.
6. Review simple job cards and one Needs You queue.
7. After an authoritative employer receipt is verified, record Interview, Rejected/Closed, or an in-app follow-up reminder with one click.

The initial Saved Info interview asks only for 15 reusable core facts and can begin from resume-derived drafts. Ten employer-specific or consequential questions are deferred to the exact application that needs them, so exact address, conflicts, screening, references, account creation, and employer terms do not create unnecessary setup work. Protected-trait demographics default to unanswered or “prefer not to answer.”

Post-submission tracking never changes or replaces the authoritative receipt. Outcomes are saved only after the job seeker explicitly confirms them, and follow-up reminders never create or send employer outreach. A due reminder appears both under Follow-ups and in the same Needs You queue; completing it records only that the user handled the reminder.

Free visitors may compare job paths. Continuous runs, encrypted cross-session progress, and the Needs You workflow require the server-verified `jobAgentAccess` capability. Existing paid Job Hunt Pass tiers receive controlled-beta access. The focused access screen does not start checkout or create a charge; a separate Job Agent price must not be published until measured operating costs are approved.

## Authentication handoff

Passwords, passkeys, OTP values, CAPTCHA answers, reset secrets, and employer session tokens never enter chat, the reusable-answer vault, campaign persistence, analytics, or audit metadata.

One shared server-side detector protects every durable and transport boundary, including natural-language forms such as “my password is …” or “the verification code was …,” not only `key=value` syntax. Missions, campaign metadata, applicant facts, application sessions, package content, browser-runner messages, receipt evidence, and AI requests reject the value before encryption or provider contact. Public job text is redacted before a discovery result can be stored.

For an authenticated Job Agent account, the encrypted tenant store and durable run/application APIs are authoritative. Mission, daily target, job cards, Needs You metadata, and run state are restored from the signed account; stale browser records are cleared before hydration and are never allowed to override another tenant. Unsigned preview drafts use only the current tab (`sessionStorage`). Résumé content is likewise held only in the current tab until the user enables the encrypted applicant vault; it is never written to `localStorage` by the Job Agent concierge.

The lightweight account view retains only bounded, allowlisted job provenance and checkpoint identifiers. On another device, the concierge uses those identifiers to rehydrate the employer description from the encrypted tenant-owned discovery run and reconnect any existing durable package run. It does not duplicate candidate facts, résumé text, generated documents, or arbitrary client fields into the job-card record. An existing package checkpoint can be checked or retried even if the tab-local résumé cache is unavailable; starting a new package still requires the reviewed résumé from the encrypted vault and the verified discovery record.

When an employer requires authentication:

1. The application becomes Waiting for You and its current step remains preserved.
2. The UI shows the verified employer hostname and opens the exact HTTPS employer URL in a separate browser tab.
3. The user signs in, uses a password manager/passkey, completes OTP, or solves CAPTCHA on the employer site.
4. The user returns and reports that the secure step is complete.
5. The agent resumes from redacted workflow context. This report does not prove authentication, transmission, or submission.

Direct-employer discovery now runs through an encrypted, tenant-isolated durable control plane with idempotent launch, leases, heartbeats, retries, pause/resume, terminal failure, and daily recovery. The current managed-application workspace remains an explicitly labeled simulation. It models the handoff and recovery contract but does not control the employer tab, preserve employer cookies, fill live forms, or submit applications.

## Production browser replacement

Before enabling real employer-form execution, add a tenant-isolated browser worker with:

- per-application cookie and storage partitions with short expiry;
- an automation-suspended credential-entry mode;
- direct-employer domain allowlists and redirect validation;
- network and SSRF controls;
- screenshot, DOM, console, and activity redaction;
- encrypted session handles without password or OTP retention;
- leases, heartbeats, retry checkpoints, and dead-letter recovery;
- action-time confirmation before personal-data transmission and final submission;
- employer-receipt capture and reconciliation before Submitted.

Runtime details and verification commands are in `docs/JOB_AGENT_RUNTIME.md`.

## Validation

```powershell
npm run test:concierge
npm run smoke
```

Design references:

- `docs/design/focused-job-agent-concept-v2.png`
- `docs/design/secure-employer-handoff-concept-v1.png`

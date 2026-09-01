# Job Agent — Prioritized Backlog

Source: `docs/JOB_AGENT_DATA_FLOW_DISCLOSURE.md` (2026-09-01).
Status of every item below: **RECORDED — NOT STARTED.** Nothing here has been designed, implemented, or mitigated. These are open items, not resolved ones.

---

## P0-1 — Protected-category fields in the applicant vault

**Blocks:** durable career-profile storage for real users.

**Finding.** `lib/applicant-vault-domain.js:17–21` defines a `CONSEQUENTAL_FIELDS` set that includes `criminalHistory`, `disability`, `veteranStatus`, `drugHealth`, `citizenship`, `clearance`, `background`, `sponsorship`, `authorization`, `exportControl`, `restrictiveAgreements`, `demographics` and others. Any of these may be written as a user-confirmed fact and stored encrypted for 365 days.

Existing mitigations already in code, for reference — they are partial, not sufficient:
- `demographics` is restricted to two literal values (`prefer not to answer` / `leave optional demographics unanswered`).
- `autoReuse` is forced `false` for every consequential field.
- Credential-shaped keys are rejected outright.

**Required before durable storage is enabled**

- Review whether protected-category fields should exist in the schema **at all**.
- Do **not** enable durable storage of `criminalHistory`, `disability`, `veteranStatus`, `drugHealth` or similar protected/sensitive categories merely because the schema supports them. Schema support is not a decision.
- Determine the **minimum** field set actually necessary for job matching, and treat that as the allowlist rather than trimming from the current set.
- Design work-authorization and citizenship handling **separately and minimally** — these have a legitimate matching purpose that the others do not, and should not inherit the general fact-storage design by default.
- `DATA_CONSENT` remains **disabled** until Terms and Privacy are deliberately updated and reviewed. See P0-3.

**Do not:** treat the existing `demographics` restriction as a template that makes the other fields acceptable.

---

## P0-2 — Revocation is a soft delete

**Blocks:** representing revocation to users as deletion.

**Finding.** `revokeVaultFact` (`lib/applicant-vault-domain.js:125–133`) and `revokeVaultDocument` set `status: 'revoked'` and stamp `revokedAt`, but the prior values remain in the record's `versions[]` array. The underlying value survives inside the encrypted record until the entire vault is deleted or its 365-day TTL expires.

Full vault deletion (`deleteApplicantVault`) does remove everything, and is correctly wired into `lib/account-data-deletion.js`. The gap is per-item revocation only.

**Required**

- Reconcile the architecture with the intended deletion behavior **before** any UI, policy, or support response describes revocation as deletion.
- Decide deliberately whether version history is a feature worth keeping (audit integrity, undo) or an artifact to remove — and if kept, what the user is told.
- Check the outcome against the 30-day deletion commitment in `privacy.html` §5 and against NJDPA/CCPA deletion rights.

**Do not:** change the revocation semantics as a quick fix. Version retention may be load-bearing for the audit trail; this needs a decision, not a patch.

---

## P0-3 — DATA_CONSENT stays disabled

**Standing hold, carried from the coverage audit.**

No `JOB_AGENT_TERMS_VERSION` or `JOB_AGENT_PRIVACY_VERSION` value may be configured until `terms.html` and `privacy.html` have been deliberately revised and reviewed. Versioning the documents as they stand would record user consent against text that describes storage practices the system does not follow (`privacy.html` §3).

Both documents remain SHA-256 byte-pinned. Digests verify. They are not to be edited except as part of a deliberate revision.

---

## P1-1 — AI provider governance

**Finding.** `lib/ai-provider.js:3–14` selects among three provider families from environment variables alone, with no code change and no allowlist:

- `anthropic` → `api.anthropic.com`
- `cloudflare` → Cloudflare Workers AI
- `openai-compatible` → `api.openai.com/v1` by default, **or any host set in `AI_BASE_URL`**

Production currently holds only an Anthropic key, so Anthropic is the active provider. But setting `AI_BASE_URL` and `OPENAI_API_KEY` would route résumé content and career facts to an arbitrary third party without a deploy, a code review, or any record.

**Required before additional providers can be enabled**

- Introduce an approved-provider allowlist or equivalent configuration control, so an environment-variable change cannot silently introduce a new data processor.
- The control should fail closed, consistent with the rest of the Job Agent's gating design.
- Whatever the policy ends up saying about AI subprocessors, this is the mechanism that has to keep it true.

---

## P1-2 — Audit archive

**Finding.** `lib/application-audit-archive-provider.js` implements a retention-locked external archive: HTTPS host allowlist, bearer auth, signed acknowledgements, and an enforced retention range of **365–3650 days**. It is deliberately excluded from the 14-store deletion routine in `lib/account-data-deletion.js`.

**Current state: disabled.** Requires `JOB_AGENT_AUDIT_ARCHIVE_ENABLED`, `_APPROVED`, `_APPROVAL_VERSION`, `_CONTRACT_VERSION`, `_LEGAL_HOLD_POLICY_VERSION`, `_URL`, `_ALLOWED_HOSTS`, `_BEARER_TOKEN`, `_ACK_SECRET`, `JOB_AGENT_AUDIT_EXPORT_SECRET`, `_RETENTION_DAYS`. None are set.

**Required**

- Do **not** enable retention-locked / WORM archival until its retention, deletion and legal-hold behavior has been deliberately reviewed.
- The specific question for that review: whether an archive that survives a user's deletion request is permissible, and on what stated basis.

---

## Not in this backlog

Items already resolved or deliberately parked elsewhere, listed so they are not re-opened by mistake:

- **Monetary budget configuration** — approved as a private-beta profile; blocked only on Upstash runtime verification. Not a backlog item.
- **Employer interaction and final submission** — fail closed by design across seven independent gates. Intentional, not debt.
- **Object storage and email spend categories** — deliberately unconfigured. The package worker degrades to `text-only`.
- **Chrome extension** — de-listed; non-release-critical.

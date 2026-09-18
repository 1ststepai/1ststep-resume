# Controlled beta status

Implemented locally:

- User-invoked job capture on regular web pages, with structured-data and generic page extraction and no form-value reading.
- Direct, acknowledged save into the account-backed My Jobs workflow; unsaved captures remain recoverable for up to 24 hours.
- Focused popup and side panel with job-detail confirmation and no copy/paste requirement.
- Exact Greenhouse requisition and host binding.
- Opaque signed-user session, explicit Job Agent entitlement, active consent, and tenant-isolated durable session checks.
- Single-use action-time sharing approval consumed before transient values are released.
- Reuse only of active, standard-sensitivity, high-confidence, auto-reusable, user-confirmed or document-verified facts with an exact semantic key.
- Schema-only scanning, blocked consequential fields, value-free completion, partial-fill recovery, and no submission.
- No raw profile, résumé, tier token, local Applied status, or invented fit score in extension storage.

Not production-enabled:

- Extension handoff environment settings and reviewed beta release approval.
- Chrome Web Store packaging/review.
- Live employer acceptance test; only synthetic fixtures are authorized in this build.
- Cover-letter or other file-upload automation, final submission, and authoritative receipt capture. The exact approved résumé PDF is supported through a transient integrity-checked handoff.
- ATS adapters beyond Greenhouse.

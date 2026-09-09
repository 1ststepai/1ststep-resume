# Controlled beta status

Implemented locally:

- Exact Greenhouse requisition and host binding.
- Opaque signed-user session, explicit Job Agent entitlement, active consent, and tenant-isolated durable session checks.
- Single-use action-time sharing approval consumed before transient values are released.
- Reuse only of active, standard-sensitivity, high-confidence, auto-reusable, user-confirmed or document-verified facts with an exact semantic key.
- Schema-only scanning, blocked consequential fields, value-free completion, partial-fill recovery, and no submission.
- Toolbar, keyboard, and context-menu capture share one temporary active-tab path; a per-tab badge reports capture success without background browsing.
- Greenhouse fill progress stays visible and highlights required fields that still need the applicant.
- No raw profile, résumé, tier token, local Applied status, or invented fit score in extension storage.

Not production-enabled:

- Extension handoff environment settings and reviewed beta release approval.
- Chrome Web Store packaging/review.
- Live employer acceptance test; only synthetic fixtures are authorized in this build.
- Cover-letter or other file-upload automation, final submission, and authoritative receipt capture. The exact approved résumé PDF is supported through a transient integrity-checked handoff.
- ATS adapters beyond Greenhouse.

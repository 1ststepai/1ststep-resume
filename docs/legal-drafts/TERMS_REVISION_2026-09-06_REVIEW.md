# Proposed terms revision — review pending

The exact proposed document is `terms-proposed-2026-09-06.html` in this directory.
SHA-256: `146f80a5777a181b51be143c267ee89f9d7be2479cb0621a81f03f6b63afe016`.
This is a preserved copy of the staged candidate, not a statement of counsel approval.
It is excluded from the public build. The runnable candidate retains the existing
digest-pinned `terms.html`; the original checkout's staged revision remains intact.

## Changes to review

- Last-updated date changes from September 4 to September 6, 2026.
- Section 4 describes existing subscriptions and unavailable new Job Agent beta checkout.
  Any future paid plan, its price, and included functionality would be disclosed and
  separately agreed before purchase. The draft does not hard-code a future price.
- New Section 4A explains that targets and allowances are not promised application
  counts; suitable openings, qualifications, supported workflows, approvals and plan
  limits constrain volume, potentially to zero.
- Section 4A distinguishes preparation from receipt-verified submission, prohibits
  duplicate attempts to meet a quota, and preserves the separate submission approvals.
- Section 8 links to Section 4A. The proposed subsection says it does not alter the
  existing cancellation/refund provisions or applicable consumer rights.

## Market-practice and legal-review flags

- The prior draft labeled its renewal disclosure with `N.J.S.A. 56:8-129 et seq.`.
  That citation belongs to New Jersey's no-telemarketing-call-list law, so this review
  draft removes the citation rather than implying that it governs subscriptions.
  Counsel should identify any applicable automatic-renewal authority and confirm the
  disclosure, reminder, cancellation, price-change, and refund language as a whole.
- AIApply uses service-specific auto-application terms alongside its general terms and
  expressly says it is a technology provider rather than an employment agency. Nearby
  New Jersey AI job-search businesses reviewed did not provide a strong like-for-like
  auto-application terms model. Counsel should decide whether 1stStep should add a
  comparable technology-tool or non-employment-agency statement.
- Competitor pages can disagree about application caps and retention periods. This
  supports keeping changeable limits in the product or checkout and using the Terms to
  explain what a target, allowance, prepared application, and verified submission mean.
- The current public `terms.html` remains digest-pinned pending counsel approval. It
  still contains the citation discussed above; activating any correction must follow
  the exact-document approval and consent-version process below.

## Integration after review

Follow `JOB_AGENT_COUNSEL_REVIEW_CHECKLIST.md`, Part 4. Obtain approval of the exact
wording and final version label first. A proposed label is `terms-2026-09-06-v1`;
it is not configured or approved by this document.

Then update the served document, its checked-in digest, and `JOB_AGENT_TERMS_VERSION`
together through an explicitly authorized release. Do not change the digest alone:
the internal data-consent gate also relies on the version label. Verify old-version
consent requires renewal and renewed consent binds the exact new document digest.
Do not set or infer `JOB_AGENT_COUNSEL_APPROVED` from passing tests or owner access.

No environment variables, secrets, approvals, production documents, or consent records
were changed while preparing this review copy.

# Career Ops compatibility review

Reviewed upstream: [santifer/career-ops](https://github.com/santifer/career-ops) at commit `619a834dd7868092d8faa8a83add3b2c7afc6298` (2026-08-30).

License: MIT. No upstream source code is copied into 1stStep by this review. Product naming and branding remain 1stStep-owned.

## Adopted product requirements

- Keep discovery cheap and deterministic: prefer public, no-auth employer ATS endpoints before using an LLM or browser.
- Re-check posting liveness immediately before packaging or opening an application workspace.
- Normalize every provider into one job schema, enforce HTTPS host allowlists, reject redirects during server-side retrieval, bound pagination, honor `Retry-After`, and test SSRF protections per adapter.
- Run a form preflight before filling. Hard or consequential questions become **Needs You** items; optional demographic questions remain unanswered.
- Fill only ordinary, exact, user-confirmed facts. CAPTCHA, OTP, credentials, checkboxes, attestations, identity verification, and final submission stay with the user.
- Query fresh form elements after dynamic ATS re-renders and preserve a copyable proposed-answer list when a browser checkpoint cannot continue.
- Verify document facts, page geometry, page count, and ATS text extraction before a package becomes ready.
- Keep runs resumable and idempotent, with bounded retries and per-job failure isolation.
- Use outcome analytics only from authoritative submitted receipts and verified downstream outcomes; show sample size and `unknown` when evidence is insufficient.

## Job-path coverage

Career Ops provides customizable primary/secondary/adjacent archetypes and examples for AI/ML, engineering, product, automation/RevOps, healthcare, finance/operations, marketing, sales, customer success, and dual-track engineering/teaching profiles. It is a configuration model, not a fixed general-purpose sector catalog.

1stStep now exposes 19 selectable paths across six sectors: Business & Revenue; Operations & Corporate; Technology & Product; Healthcare & Education; Industry & Field Work; and Public & Community. The first view remains a six-path resume-informed shortlist so users get more choice without a long onboarding form. Selecting a sector reveals its paths in one click.

## Already implemented in the controlled beta

- Greenhouse, Lever, Ashby, and SmartRecruiters public-feed discovery with exact direct-employer requisition verification.
- Hard filters, duplicate checks, protected-trait-neutral fit scoring, and pre-package freshness verification.
- Provenance-bound applicant facts, confidence, version history, revocation, encrypted tenant storage, and prohibited-secret rejection.
- ATS-safe resume and cover-letter generation with claim-to-source mapping and rendered-document verification.
- Durable run/application state machines, retries, leases, idempotency, isolated browser workers, and one **Needs You** queue.
- A no-submit browser protocol that cannot return field values, retains no credentials or challenge values, and requires current transmission approval.
- Authoritative receipt reconciliation before an application is counted as submitted.

## Prioritized deltas

1. **Delivered:** the three public ATS implementations now expose a shared versioned provider descriptor and bounded JSON transport with exact-host enforcement, redirect rejection, timeout limits, structured transient failures, and `Retry-After` metadata.
2. **Delivered:** required eligibility-screening questions now carry explicit **Needs You** risk metadata and truthful skip guidance. The product never recommends changing or fabricating an answer.
3. **Partially delivered:** the isolated runner now re-queries the live DOM before every ordinary field and retries once after an ATS re-render. React Select support remains deferred because it requires consequential click controls and provider-specific fixtures.
4. **Delivered:** public ATS request success/failure and zero-LLM request counts are content-free operational metrics. Monetary cost remains unknown until infrastructure invoices are reconciled.
5. Add posting-legitimacy evidence as an advisory flag; never label a role a scam or ghost job without authoritative evidence.

## Explicitly not adopted

- Do not suggest email aliases to bypass ATS candidate merging or duplicate detection.
- Do not automate final submission, CAPTCHA, OTP, credentials, attestations, demographic answers, or consequential screening responses.
- Do not import Career Ops' local-file architecture into the multi-tenant SaaS; 1stStep keeps encrypted tenant-isolated persistence, audit records, and durable queues.
- Do not copy its technology-role scoring assumptions into a general job-seeker product. Calibration must use 1stStep's verified, role-family-specific outcomes.

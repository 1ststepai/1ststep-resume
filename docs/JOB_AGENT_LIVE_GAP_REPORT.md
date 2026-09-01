# Job Agent live gap report

Snapshot: 2026-08-30. This is a read-only, content-free comparison. It contains no candidate values, secret values, tenant identifiers, or external application actions.

## Current evidence

- Canonical branch: `codex/application-concierge-pilot` at `8dc0d6ac4cd16554b470e8d8ca59ff46cf7d0fd6`, with preserved unstaged and untracked work. The release signer must continue to refuse this tree until an operator reviews and intentionally creates a clean release candidate.
- Live `/concierge`, `/concierge.html`, `/concierge.js`, and `/persistent-concierge.css` do not match the canonical runtime hashes. The deployed page still uses the older broad CSP, inline style allowances, and CDN scripts without the canonical SRI attributes.
- The older deployed readiness route returns a readiness body when a caller supplies only `Origin: https://app.1ststep.ai`. The canonical route requires an opaque administrator session or the exact cron secret; a regression test now covers the forged-origin case.
- Public `/api/app-config` reports `betaMode: false`. Public health and readiness requests without an allowed origin return `403`; this is access-control evidence only, not proof of runtime readiness.
- Production Vercel environment-variable **names** show Redis, encryption, audit, and bounded AI/discovery controls. Names and encrypted placeholders do not prove values or runtime behavior. Required signed-beta variables for encryption-key identity, private document storage/scanning, consent, scheduling, notifications, launch evidence, monetary budgets, pilot admission, access policy, extension approval, operator alerts, and support ownership are not all present.
- The local production-rules report remains Preview with external application execution and submissions disabled.

## Release order

1. Do not promote the current live build or dirty worktree. Review the preserved changes, create a clean release candidate, run the deterministic release preflight, and bind the signed release record to its exact runtime hash.
2. Configure approved production variables in Production scope only. Keep preview credentials and storage isolated; never copy production secrets into tracked files.
3. Complete counsel, cost, pilot-admission, support/incident, extension, employer-terms, browser-worker, and receipt-provider approvals. Keep final submission disabled.
4. Run the synthetic production readiness, private-object lifecycle, recovery, backup/restore, notification, alert, and browser-session drills. Retain only signed, content-free evidence.
5. Deploy the exact signed candidate only after explicit authorization. Immediately rerun live asset parity, strict CSP/SRI boundary checks, unauthenticated readiness denial, signed-user lifecycle, and rollback verification.
6. Admit at most the approved pilot tenants. Monitor content-free budgets and queues; pause on any receipt ambiguity, isolation failure, or unknown submission outcome.

No deployment, variable mutation, provider activation, charge, email, employer navigation, personal-data transmission, or submission was performed while creating this report.

# Application control center

The application control center combines the existing encrypted fact vault, durable application sessions, package evidence map, browser checkpoint, exact approvals, and employer receipt verification into one simple review surface. It does not create a second store or expose decrypted vault values in the browser.

## What the job seeker sees

The application dialog leads with three facts: location, compensation, and travel. A warning card appears only when a deterministic check finds a material conflict or missing evidence. The expandable sharing section lists the exact package version, source-map count, personal-data field count, and every masked proposed answer. The existing action button remains the only approval control.

Approval remains scoped to the exact employer, requisition, direct-employer URL, verified listing evidence, document version, and approved fact references. A changed scope requires a new approval. The final submission has its own separate action-time confirmation.

## Canonical ledger

The existing durable application session remains the authoritative record. The Markdown export combines discovery roles and sessions, deduplicates by employer plus requisition ID, and keeps the most advanced verified state:

`Discovered -> Screened -> Package Ready -> Approved -> Awaiting Employer Receipt -> Receipt Verified`

`Awaiting Employer Receipt` deliberately does not say Submitted. Only an authoritative employer confirmation page, employer confirmation email, or employer ATS response can produce `Receipt Verified` and count as submitted.

## Verified listing evidence

Package creation now carries a small allowlisted evidence object from the freshly reverified direct-employer posting into the durable session. It contains location, remote/workplace type, employment type, disclosed salary range and basis, disclosed travel language, conservative leadership/category-management signals, and the verification time. Full job text is not duplicated in the public session summary.

The listing evidence is part of the transmission approval scope. Material changes therefore invalidate the old approval instead of silently flowing into a later application.

## Conflict checks

Conflict detection is local and deterministic. It flags:

- a remote listing followed by required onsite, hybrid, or relocation form language;
- pay disclosed as OTE or total compensation instead of verified base salary;
- a travel question when the verified listing facts contain no travel disclosure;
- direct people-leadership language;
- category-management language;
- explicit salary, travel, or qualification discrepancy actions from the browser workflow;
- a missing package source-map count.

These rules consume no model tokens. Existing ATS feeds, caching, mission filters, and requisition deduplication remain the first stage. Model use stays limited to finalist analysis and package generation.

## Browser and receipt boundaries

The existing worker continues to preserve a field-schema hash and recheck staged field keys and the exact attached document version after upload. One final submission reservation is allowed for an approval. If the outcome is unknown, the worker does not retry. The ledger remains unsubmitted until authoritative receipt evidence is verified.

## Validation

Run:

```powershell
node scripts/application-control-center-test.mjs
node scripts/discovery-package-binding-test.mjs
node scripts/application-session-test.mjs
npm run smoke
```

No production deployment is part of this implementation.

# Shared package duplicate protection

Implemented locally; not deployed or enabled as unattended daily preparation.

The shared package run-creation boundary now reconciles retained tenant package runs, application sessions (including receipts and terminal states), and subscriber campaign cards before creating a non-revision package. Matching package requests reuse the same run even with new request keys or discovery-card IDs. Existing candidate revisions, ambiguous identities, missing retained records, and oversized history hold generation with `PACKAGE_HISTORY_RECONCILIATION_REQUIRED`. The API returns a content-free 409; unavailable history is not interpreted as an empty history.

An atomic Redis Lua transaction reserves hashed normalized employer/requisition and canonical application URL aliases together with queue insertion. Tracking parameters are removed; identity query parameters and case-sensitive paths are preserved. The tenant identity ledger lasts one year after its last write, beyond the 24-hour HTTP idempotency key and 30-day private run payload. A deleted/expired target cannot silently become a new paid generation. Account-wide run deletion removes that tenant's identity ledger. Explicit candidate document revisions retain their existing separate workflow.

Validation includes JS integration cases and execution of the production Lua using fakeredis with Lua support: 24 concurrent requests create one queued run; repeated requests, request-key conflicts, URL aliases, legacy package backfill, tenant isolation, encrypted payloads, missing history, imported campaign history, and account cleanup are covered. This is local evidence, not production Redis or employer-submission proof.

Completed checks: identity integration and production-Lua tests passed; existing package generation, run lifecycle, and package-response tests passed; browser preparation/reopening passed after updating its obsolete button-label expectation; public build passed (64 assets); smoke passed (zero failures, six existing warnings). No production changes or real employer/model requests were made.

Commands:

```text
node scripts/application-package-identity-test.mjs
python -m pip install --target output/package-identity-test-deps "fakeredis[lua]"
node scripts/application-package-identity-lua-test.mjs
node scripts/application-package-test.mjs
node scripts/job-agent-run-test.mjs
npm run smoke
```

Remaining before connecting scheduled discovery to private drafts: durable continuation/recovery; current saved-profile qualification; shared foreground/background plan accounting; import/reconciliation of histories not yet in durable app stores; and recovery for expired history entries. The pilot history scan is bounded at 250 retained runs and 250 sessions and deliberately holds rather than overlooking older work. This change does not claim a complete cross-store uniqueness constraint for independently created application sessions, and it does not add employer execution or submission.

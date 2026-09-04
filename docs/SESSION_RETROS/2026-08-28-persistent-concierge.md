# Persistent Concierge implementation retro

## Scope

Converted the primary Concierge surface from a job-chat landing page into a generic campaign operations console while preserving the application assistant and existing self-service tools as secondary capabilities.

## Decisions

- Kept the implementation in Design mode because the repository has no durable scheduler or execution worker.
- Added a separate persistent campaign store instead of silently repurposing legacy job mission and desk records.
- Enforced evidence for `Executed` and `Verified Complete` in the domain model rather than relying on UI wording.
- Kept private execution context out of the campaign model and allowlisted analytics metadata.
- Preserved legacy local data to avoid a destructive migration without a reviewed server-side replacement.

## Verification

- `npm run test:concierge`
- `npm run smoke`
- JavaScript syntax checks and `git diff --check`
- Desktop/mobile browser verification and preview inspection are required before handoff.

## Follow-up

A production-capable version needs authenticated tenant storage, a durable scheduler, idempotent workers, connector-specific execution, evidence retention, and explicit approval of the secure private-context vault design.

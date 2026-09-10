# Legacy `/app/resume` strategy

## Verdict

Keep the capability layer; demote the current UI to optional advanced tooling while migration proceeds. Do not delete `/app/resume` until legacy browser data is reconciled and every high-value capability has a Job Agent entry point.

| Capability | Capability value | Current UI value | Decision | Target |
| --- | --- | --- | --- | --- |
| Resume upload/parser | Very high | High for first use | EXTRACT/REUSE | Career Profile ingestion |
| Quick resume builder | High | High for users without a file | REFACTOR/REUSE | Progressive profile setup |
| LinkedIn PDF import | High | Medium | REUSE | Career Profile source import |
| Master resume/vault | Very high | Split/unclear | MERGE | Career Profile + document versions |
| Resume history/versions | High | Medium | MERGE | Application package history |
| ATS optimization | High | Medium | ABSORB INTO AGENT | package QA |
| Job-description comparison | High | Low as manual step | ABSORB | decision/package strategy |
| Keyword/match score | Medium | Risky if arbitrary | REFACTOR | evidence coverage explanation |
| Career Positioning | High logic | Low as separate destination | EXTRACT SERVICE | application strategy |
| Extra Context | Medium | High typing burden | REPLACE | verified fact prompts |
| Tailoring/What Changed | Very high | High review value | ABSORB + KEEP DIFF | package review |
| Cover letter | Medium-high | Contextual | ABSORB | package policy |
| Interview prep | Medium-high | Contextual | MOVE | submitted/interview job action |
| Job Search | High logic | Duplicate UI | MERGE | Job Agent discovery |
| Tracker/applications | Very high | Duplicate/browser-only | MERGE | canonical My Jobs |
| LinkedIn optimizer | Medium | Optional | KEEP OPTIONAL | Career Profile output |
| Bulk Apply | Low as current concept | Negative trust signal | DEPRECATE | qualified batch review |
| Templates/downloads | Medium | Useful advanced control | KEEP OPTIONAL | package/artifact detail |
| Extension integration | High | Fragmented | REFACTOR | Job Agent capture/execution task |

## Why the current UI should not remain primary

- Desktop exposes Resume Workspace, Job Search, Job Tracker, Application Concierge, Tracker, LinkedIn, and Bulk Apply; several are overlapping concepts.
- The live first-use page adds a product-choice dialog and a nine-step “Progress to apply” checklist before value.
- Core state remains in localStorage/browser backup, while the Job Agent has a separate encrypted vault and durable application state.
- `app.js` is a 9,000+ line monolith that combines UI, storage, AI calls, jobs, tracking, auth migration, billing copy, and exports.

## Safe deprecation sequence

1. Add read-only Career Profile and My Jobs projections over existing stores.
2. Import browser state into a server reconciliation queue; preserve original backup.
3. Route new Job Agent users to contextual resume/package actions.
4. Hide duplicate legacy navigation for migrated users behind “Advanced tools.”
5. Observe support/adoption and provide rollback flag.
6. Remove legacy write paths only after parity, reconciliation, and export verification.

## Data preservation

- Never overwrite local resume/tracker data during migration.
- Imported `applied` labels become unverified historical records.
- Preserve document hashes, source, creation time, and user edits.
- Keep the backup/export path until production cross-device restore and deletion are proven.

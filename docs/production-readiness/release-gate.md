# Production release gate

## Workflow

1. Run `npm run audit:in` at the start of a release-hardening cycle. It writes a content-free, ignored snapshot to `.production-readiness/audit-in.json`.
2. Record findings in the scorecard. Unknown evidence stays `Unknown`; it is never inferred from source intent.
3. Remediate isolated controls without weakening existing auth, billing, consent, extension, or external-action contracts.
4. Run `npm run release:gate`. This executes the complete local web and controlled-extension suites, database and scorecard checks, AI use-case gate, deterministic 13-layer checks, untracked-source inventory, and the clean-worktree release preflight.
5. Add staging and production evidence only after performing the approved verification against the exact commit/deployment.
6. Run `npm run audit:out`. It compares the current scorecard with the cycle's entry snapshot and writes `.production-readiness/audit-out.json`.
7. Run `npm run audit:production-approval` only for an actual production review. It fails while any unaccepted Critical remains.

## Commands

| Command | Purpose | Mutation/external effect |
|---|---|---|
| `npm run audit:in` | Capture the entry scorecard and deterministic control state | Writes one ignored local JSON artifact only |
| `npm run release:gate` | Run every available deterministic release-gate check, including controlled-extension reproducibility, untracked-source classification, and clean-worktree preflight | Local build/tests only; no deployment |
| `npm run test:database-evidence` | Verify migration digests, database-surface evidence, public-bundle service-role boundary, and adversarial test-pack presence | Static/local only; never connects to a database |
| `npm run audit:database-evidence` | Print the content-free repository migration and database-surface inventory | Read-only; never connects to a database |
| `npm run audit:ai-use-cases` | Validate every major AI feature assessment | Read-only |
| `npm run audit:compare-entry` | Compare the checked-in entry and current scorecards | Read-only |
| `npm run audit:out` | Compare the cycle entry snapshot with the current audit | Writes one ignored local JSON artifact; exits 2 while Critical remains |
| `npm run audit:production-approval` | Enforce the final no-Critical condition | Read-only; does not deploy |

## CI policy

`.github/workflows/production-readiness.yml` uses locked dependencies, Node 24, pinned GitHub Action revisions, read-only repository permission, concurrency cancellation, and a 25-minute timeout. It runs `npm run release:gate` for pushes and pull requests to `main`.

CI blocks deterministic Critical failures such as missing required documents, an incomplete scorecard, missing commands, mismatched Node version, unpinned direct dependencies, missing lockfile, missing no-store/CSP boundaries, absent RLS source controls or database-isolation evidence, absent health routes, absent rate-limit/source-boundary/recovery checks, or incomplete AI assessments.

CI cannot prove live configuration, staging behavior, production behavior, third-party delivery, database grants, backup retention, recovery, or on-call response. Those remain scorecard findings and block `audit:production-approval` when Critical.

## Failure behavior

- Exit `0`: deterministic controls pass. This is not production approval.
- Exit `1`: deterministic Critical control failed or assessment schema is incomplete.
- Exit `2`: the audit is structurally valid but one or more production Critical findings remain.

The gate never deploys, changes environment variables, applies migrations, contacts employers, submits applications, or sends user data.

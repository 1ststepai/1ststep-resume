# Database isolation and recovery evidence

## Outcome

The repository now has a deterministic migration inventory, a database-surface map, a role-aware adversarial pgTAP suite, and release-gate enforcement. This is implementation and static test evidence only. It is not staging or production verification.

No isolated Supabase environment could be proven. Supabase CLI 2.116.0 is available and created the canonical timestamped baseline, but Docker and `psql` are unavailable; there is no linked-project evidence or masked non-production project reference. No database was connected, migrated, queried, restored, or modified.

Status: **Critical — Human Action Required**.

## Environment proof

| Evidence | Result |
|---|---|
| Target identity | Unavailable |
| Masked project reference | Unavailable |
| Proof target is not production | Not established |
| Supabase CLI | 2.116.0; current `migration new` help inspected |
| Docker/local stack | Not installed |
| `psql` | Not installed |
| PostgreSQL/Supabase versions | Unknown |

The stop condition was applied before any connection or live command. An operator must first provide a disposable local stack or an isolated Supabase project and prove, using a masked project reference and project ownership record, that it is not production.

## Migration inventory and drift

| Order | Migration | SHA-256 | Canonical Supabase timestamp name |
|---:|---|---|---|
| 1 | `001_job_agent_authoritative_store.sql` | `a3fc1a5a671f4860593f1a8c30636bea1ac278a642961989f1038f272a0024e2` | Reconciled |
| 2 | `002_job_agent_continuous_improvement.sql` | `869289e31c561fa5b6c0d745615d7185a56554e69664dc3fc53e261a62934ec5` | Reconciled |
| 3 | `003_job_agent_resilience.sql` | `00eda238101c958534cac2c8e88de22fb175597f9250968f82f4ada24a5929bd` | Reconciled |

The CLI-generated canonical baseline is `supabase/migrations/20260901195545_job_agent_canonical_baseline.sql` with SHA-256 `3c61cb457d58180353ba19aa3669408c80f8f7bb349856d02d549ed1acf5c17a`. `npm run db:reconcile:check` fails if it drifts from the three reviewed sources.

The order is deterministic, prefixes are unique, and static analysis found no `DROP`, `TRUNCATE`, or unqualified `DELETE` statements. Applied history, missing or modified historical migrations, and schema drift are **Unknown** because no isolated database history was available.

The reviewed source files must not be applied ad hoc. The canonical timestamped baseline is the only migration candidate. After an isolated target is proven, compare local and staging migration history and review its digest before applying anything.

## Database surface

Static source analysis identified 20 `public` tables. All 20 enable and force RLS in source. No source-defined views, materialized views, functions, triggers, storage buckets, or storage policies were found.

This does not establish the live surface. Data API exposure, default privileges, extension-owned objects, dashboard-created objects, and target-specific schema remain **Unknown** until catalog inspection on the isolated target.

## Grants and RLS matrix

| Control | Source result | Runtime result | Verdict |
|---|---|---|---|
| RLS enabled | 20/20 tables | Unknown | Implemented, not verified |
| RLS forced | 20/20 tables | Unknown | Implemented, not verified |
| `PUBLIC` table/sequence revoke | Present | Unknown | Implemented, not verified |
| Explicit `anon` revoke | Present | Unknown | Implemented, not verified |
| Explicit `authenticated` revoke | Present | Unknown | Implemented, not verified |
| `service_role` boundary | No browser-bundle occurrence in deterministic check | Target grants unknown | Critical until live inspection |
| Policy roles | All policies explicitly target `job_agent_backend`; `job_sources` is backend-only | Unknown | Implemented, not verified |
| Policy operations | Explicit SELECT/INSERT/UPDATE/DELETE policies; UPDATE has USING and WITH CHECK | Unknown | Implemented, not verified |
| Tenant authority | `app.tenant_id` is set transaction-locally by the server adapter | Runtime behavior unknown | Critical until adversarial test |
| JWT authority | No `user_metadata` authorization reference found | Identity claims unknown | Warning |

Static analysis now finds zero non-tenant-scoped child-to-parent references. The six previously unsafe relationships and the workflow-event parent link use composite `(tenant_id, id)` or `(tenant_id, operation_id)` foreign keys. Runtime enforcement remains unverified until the adversarial suite runs against an isolated target.

## Adversarial test pack

`supabase/tests/job_agent_rls.test.sql` covers source expectations and two-tenant attack cases: anonymous and direct-authenticated denial, table privileges, policy roles/commands, own-tenant read, cross-tenant reads, filtering/ordering/pagination, cross-tenant parent references, allowed same-tenant references, joins, ownership transfer, delete isolation, tenant switching, and an invalid tenant context.

Execution status: **NOT RUN**. A passing SQL file on disk is not evidence. The suite must run through the current supported Supabase test workflow against the exact isolated migration digest, with redacted output, exit code, target proof, tool versions, timestamp, and commit retained.

Same-tenant collaborator access is not part of the current server-owned data model. Views, RPCs, security-definer functions, and Storage currently have no source-defined surface. These cases are **not applicable to the repository surface, not verified absent from staging**. They must be re-inventoried from the live catalog; if present, each object needs explicit adversarial tests before approval, including Storage path guessing and signed-URL expiry.

## Advisors

Security and performance advisors were **NOT RUN** because no isolated target was proven. Any future advisor result must be tied to the target, migration digest, timestamp, CLI/version, and exact command. Warnings must be remediated or entered into the time-bounded risk-acceptance process; their existence must not be silently converted to Pass.

## Current Supabase compatibility notes

The 2026-09-01 documentation review confirms that grants and RLS policies are separate controls, exposed tables require both, client roles should receive only intended operations, `service_role` bypasses RLS and must stay server-side, views require explicit review, and allow/deny tests should run with `supabase test db`. Current changelog items also reinforce why repository intent is insufficient: platform behavior around newly exposed tables, Realtime schema restrictions, credential resynchronization after restore, and backup edge cases can change independently of application source. The staging evidence must therefore record the actual CLI and database versions and be refreshed after relevant platform changes.

## Backup, PITR, and restore

Backup cadence, retention, PITR status, provider tier, recovery window, and encryption posture are **Unknown**. No paid feature was enabled.

Supabase's current PITR documentation lists hourly add-on pricing of approximately $100/month for 7 days, $200/month for 14 days, and $400/month for 28 days, subject to current provider terms. This is planning evidence only; the operator must verify current dashboard pricing before authorization. Restore-to-new-project also creates a separate billable project and must not be run without explicit approval.

No restore was performed. RPO, RTO, integrity counts, audit continuity, idempotency-key continuity, receipt linkage, and tenant-isolation reconciliation remain **Unknown**.

## Safe operator sequence

After a non-production target is supplied, first capture the installed tool's behavior rather than relying on stale commands:

```powershell
supabase --version
supabase --help
supabase migration --help
supabase migration list --help
supabase test db --help
supabase db --help
supabase db advisors --help
```

Then stop and review the target proof, supported flags, migration transformation, and execution plan before any link, push, reset, restore, or billable operation. Credentials must remain in the operator's secure process environment and must not be committed or included in evidence.

## Human Action Required

1. Provide and prove a disposable local Supabase stack or isolated staging project, with a masked project reference and explicit statement that it is not production.
2. Review the canonical migration digest and confirm the target-specific connection role can `SET LOCAL ROLE job_agent_backend`.
3. Apply only to the isolated target; run catalog inventory, pgTAP, and security/performance advisors.
4. Remediate any runtime grant, policy, relationship, or advisor findings; repeat until adversarial tests pass.
6. Separately approve any paid PITR setting or isolated restore resource.
7. Run a restore drill, reconcile content-free counts/links, measure RPO/RTO, and retain signed redacted evidence.

Until these steps are complete, Layers 3, 8, and 13 remain **Critical** and production approval remains blocked.

## References

- Supabase RLS: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase CLI: <https://supabase.com/docs/reference/cli/introduction>
- Supabase PITR: <https://supabase.com/docs/guides/platform/backups#point-in-time-recovery>
- Supabase restore to a new project: <https://supabase.com/blog/restore-to-a-new-project>
- Supabase changelog: <https://supabase.com/changelog>

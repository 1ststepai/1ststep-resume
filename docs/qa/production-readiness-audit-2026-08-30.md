# 1stStep.ai Job Agent production-readiness audit

Audited: 2026-08-30 UTC
Scope: read-only deployment, route, header, environment-name, and launch-manifest inspection
Production mutation: none
Deployment: none

## Verified current state

| Area | Evidence | Current conclusion |
| --- | --- | --- |
| Vercel identity | Authenticated CLI user `1ststepdotai`; linked project `1ststep/1ststep-resume` (`prj_Lo7pjU6rfjxa30mEFE6TFuU0ZTcI`) | Correct project linkage verified. |
| Production deployment | `dpl_QxXHqq91Ssp4EsKQeMbrSurViy2W`, target `production`, status `Ready`, created 2026-08-30 02:13:09 UTC | Deployment liveness only; it predates the latest local browser/recovery work. |
| Production alias | `https://app.1ststep.ai` points to the inspected deployment | Alias verified. |
| Concierge route | `GET /concierge` returned HTTP 200 with the expected static page and security headers | Public shell is reachable. |
| Public asset parity | At 2026-08-30 12:34 UTC, exact SHA-256 comparison found mismatches on `/concierge`, `/concierge.html`, `/concierge.js`, and `/persistent-concierge.css`; both HTML routes consistently returned the same older asset | Routing is internally consistent, but production is not the reviewed local candidate. A new read-only parity gate now makes this a deterministic acceptance failure. |
| CSP | At 2026-08-30 12:24 UTC, both production concierge routes still allowed `unsafe-inline`, broad third-party scripts/connections, Stripe frames/forms, and lacked script/style attribute denial and reviewed parser SRI | The alias serves the legacy shell, not the current strict Job Agent boundary. This is a release no-go; assisted application must remain closed. |
| Protected probes | With exact `Origin: https://app.1ststep.ai` and no authorization, operations and tenant-state returned 401 but `/api/job-agent-readiness` returned 200 with content-free infrastructure state | The deployed readiness endpoint predates the current administrator/cron authentication requirement. Treat this as a critical stale-deployment boundary failure, even though the exposed payload contained no candidate values. |
| Environment inventory | Core Redis, encryption-key material, tenant hash, audit/receipt names, AI/discovery budgets, Resend, cron, and existing product secrets are present by name | Presence is not value validation, delivery evidence, or runtime proof. |
| Content-free launch manifest | Evaluated under the Vercel production environment without a provider call or Redis mutation | `currentMode: preview`; signed beta, package ready, assisted application, and final submission are all ineligible. |
| Safety flags | Manifest returned `externalApplicationExecution: false` and `submissionsEnabled: false` | No application execution or submission is authorized. |

## Launch blockers

The older deployed production manifest reported these signed-beta blockers:

1. `DURABLE_RUNTIME_NOT_CONFIGURED`
2. `PRIVATE_DOCUMENT_STORAGE_NOT_CONFIGURED`
3. `COUNSEL_APPROVED_CONSENT_NOT_CONFIGURED`
4. `BACKGROUND_SCHEDULING_NOT_CONFIGURED`
5. `NEEDS_YOU_NOTIFICATIONS_NOT_CONFIGURED`
6. `NEEDS_YOU_DELIVERY_NOT_VERIFIED`
7. `AUDIT_EXPORT_NOT_CONFIGURED`
8. `OPERATOR_ALERTING_NOT_CONFIGURED`
9. `OPERATOR_ALERT_DELIVERY_NOT_VERIFIED`
10. `RECOVERY_DRILL_NOT_VERIFIED`
11. `BACKUP_RESTORE_NOT_VERIFIED`
12. `COST_LIMITS_NOT_APPROVED`
13. `RECEIPT_INGESTION_NOT_CONFIGURED`
14. `CONTROLLED_BETA_NOT_APPROVED`
15. `SUPPORT_AND_INCIDENT_OWNERSHIP_NOT_CONFIGURED`

Package readiness additionally lacks `DOCUMENT_RENDER_SANDBOX_NOT_CONFIGURED`. Assisted application additionally lacks the isolated-browser configuration, runner evidence, employer-terms review, explicit assisted-pilot approval, remote-stream readiness, and session-recovery evidence. Final submission remains independently hard-disabled and lacks authoritative receipt-capture activation.

At 2026-08-30 12:45 UTC, the latest local candidate evaluated under the downloaded production environment rules remained `preview` and produced 19 signed-beta blockers. This local evaluation made no external call or production write and is not authoritative runtime evidence because encrypted Vercel values may be unavailable to the CLI. In addition to the older deployed list, it fail-closed on `STRIPE_WEBHOOK_IDEMPOTENCY_NOT_CONFIGURED`, `MONETARY_SPEND_CONTROL_NOT_CONFIGURED`, `PILOT_ADMISSION_CONTROL_NOT_CONFIGURED`, and `JOB_AGENT_ACCESS_POLICY_NOT_CONFIGURED`. The last blocker prevents any legacy paid tier from implicitly granting Job Agent access; the session must contain an explicit server-issued grant under a reviewed policy.

## Prioritized no-go resolution

### P0 — controlled signed beta

- Configure a safe encryption key ID and verify the current encrypted keyring; do not rotate or replace key material during this audit.
- Provision private object storage and the exact-host malware scanner, then run isolated upload/read/delete and backup/restore drills.
- Obtain counsel-approved terms, privacy, and candidate-authorization versions before enabling consent enforcement.
- Configure bounded daily scheduling and verify the existing cron heartbeat with synthetic, content-free work.
- Configure generic Needs You delivery and operator alerting, then retain actual delivery evidence bound to the exact From identity and webhook host.
- Configure the separate audit-export secret and retention-locked destination.
- Perform the encryption recovery drill and provider backup/restore exercise; retain evidence bound to the active key ID.
- Approve invoice-backed cost ceilings, the 1-10 user pilot limit, named support owner, and incident-runbook version.
- Configure the reviewed no-charge controlled-beta Job Agent entitlement policy. Legacy paid tiers must not imply Job Agent access without an explicit encrypted session grant.
- Diagnose why the receipt-ingestion gate remains invalid even though a variable with that name exists. Check validity only; never print its value.

### P1 — package-ready beta

- Provision and independently verify the isolated document-render snapshot, malware scanning, storage lifecycle, ATS extraction, and page-level visual QA.

### P2 — assisted application

- Select a remote-stream provider and review employer/ATS/provider terms and cost exposure.
- Add only the exact approved provider origin to CSP after explicit security approval.
- Run same-host, cross-host denial, schema drift, timeout ambiguity, teardown, crash recovery, and no-submit drills.
- Retain runner snapshot/digest and provider-bound session-recovery evidence before enabling the assisted pilot.

### P3 — final submission

- Keep disabled until the separately approved execution path and the now-implemented receipt-capture connector are configured and supervised end to end. A click attempt, redirect, package preparation, connector HTTP response, or provider response is not a submission receipt.

## Safe operator command

```powershell
vercel env run -e production -- node scripts/production-launch-manifest-report.mjs
```

On this Windows host, invoke the command through `cmd /c` if PowerShell passes the `--` separator incorrectly. The script itself makes no external call and writes no production state. Do not run `npm run security:gate -- --confirm-synthetic-production-redis-drill` without explicit approval because that separate drill intentionally creates and deletes synthetic production Redis records. Without the exact flag, the gate exits before constructing the Redis client.

The read-only live boundary check makes no authenticated request, provider call, write, charge, or employer action:

```powershell
npm run security:live-boundary
```

It currently exits nonzero against `app.1ststep.ai`, correctly identifying the legacy CSP, missing parser SRI, and unauthenticated readiness 200. Do not override that result or accept a deployment until the alias returns strict CSP on both concierge routes and 401 for readiness, operations, and tenant-state when called with the exact production Origin but no credentials.

The separate public-asset parity check also makes no authenticated request or write and never retains asset bodies:

```powershell
npm run security:asset-parity
```

It currently exits nonzero because both HTML routes, the JavaScript bundle, and the CSS file differ from the reviewed local candidate. Require `ok: true` from the exact candidate checkout after deployment; status 200, route consistency, or a matching title does not prove source parity.

`npm run security:release-preflight` also exits nonzero. At the latest recorded check it found 32 unstaged tracked modifications and 202 untracked files. It computed a content-free digest over the 123-file runtime surface and verified the new `.vercelignore`, but correctly refused release until the intended candidate is curated into a reviewed commit or isolated clean release worktree. No file was staged, committed, pushed, or deployed during this check.

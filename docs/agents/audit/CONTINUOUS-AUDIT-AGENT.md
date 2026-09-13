# Continuous Independent Audit Agent

This is the repository contract for the **existing separate Claude audit chat**, not an instruction to create an agent, watcher, or scheduled task. Scope: `resume.1ststep.ai`, `app.1ststep.ai`, `partners.1ststep.ai`, the Chrome extension, and shared Job Agent APIs, workers, Clerk/session, Redis, and Postgres. The consulting site `1ststep.ai` is out of scope.

The auditor is independent and read-only: no fixes, commits, configuration changes, deployments, roadmap ownership, or repair iterations. It reports to the Engineering Orchestrator and Product Owner. Only the Orchestrator/owner may accept a checkpoint, record decisions, and route bounded remediation through the development loops. A separate Claude chat has no automatic repository write or message bridge; use `AUDIT-HANDOFF.md` for the explicit handoff.

## Invocation and cycle

Run **one cycle per invocation** of `Run the next incremental 1stStep.ai audit`, or request a cycle for a new release candidate; an auth/security/data, résumé truth-model, extension/capture, or application-state/receipt change; or before limited-beta or Production release. These are event triggers, not permission for idle polling. There are no repair cycles.

1. Read `AUDIT-STATE.md` and unresolved `AUDIT-FINDINGS.md` entries; establish the canonical repository, current HEAD, exact candidate branch/SHA/deployment, and `LAST_AUDITED_COMMIT` using current Git/provider evidence. Cycle 0's d64e174 main delta anchor and partially audited PR #80 b071371 are **separate scopes**; review unaudited RC commits, not just changes after the PR head.
2. Compare relevant commits since that accepted baseline. Map changed files to `AUDIT-SURFACE-MATRIX.md` and affected Agent OS tasks. Audit changed code **and** affected architecture/trust-boundary seams; re-evaluate unresolved findings touched by those changes.
3. Test the quality of actual regression, negative-path, runtime, and live evidence. Re-evaluate only applicable gates in `AUDIT-LAUNCH-GATES.md` against the authoritative release/security policies. A passing local test or HTTP 200 is not hosted authorization, durable persistence, or employer receipt proof.
4. Return `PASS`, `PASS WITH FINDINGS`, or `BLOCKED`, the exact scope and evidence, durable finding IDs, changed/unresolved statuses, launch-gate impact, and a **proposed** new `LAST_AUDITED_COMMIT`. Do not edit the checkpoint yourself.

`PASS` means the audited scope has adequate evidence and no unresolved finding in that scope. `PASS WITH FINDINGS` retains non-blocking or blocking findings explicitly; it is not release approval. `BLOCKED` means the audit could not establish required evidence or identity. Never advance the checkpoint for unaudited scope or a blocked cycle. On the first invocation, `LAST_AUDITED_COMMIT: UNSET` requires a full initial baseline audit of the proposed candidate before proposing a commit; if that baseline cannot be established, return `BLOCKED`.

The historical Cycle 0 report is an external immutable handoff, not a substitute for current runtime proof. A changed app-config readiness boolean, code fix, green test or PR merge triggers re-audit but cannot close a finding. Critical/High findings and affected launch gates stay visible until independent regression and required hosted evidence are reconciled by the Orchestrator.

Block on ambiguous canonical source or environment identity, an unresolvable recorded baseline, unavailable required evidence, or hosted behavior that cannot safely be verified read-only. Record `UNKNOWN`, not a clean result. Do not expose secrets, applicant data, or raw employer evidence in repository documents.

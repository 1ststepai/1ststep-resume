# Independent auditor → Orchestrator handoff

The existing Claude auditor returns its report in its own chat. Repository files do **not** automatically send a message to the Engineering Orchestrator. The Product Owner or operator explicitly relays the report; the Orchestrator verifies the exact source/evidence and updates these documents in a separate authorized repository change. The auditor remains read-only.

```text
Cycle date and trigger:
Canonical repository / worktree / HEAD:
Release candidate branch / SHA / deployment and environment:
Accepted LAST_AUDITED_COMMIT read from AUDIT-STATE.md:
Commits and changed files reviewed:
Surfaces, seams, and unresolved findings re-evaluated:
Tests and hosted evidence (exact result; unknowns):
Applicable launch gates:
Result: PASS / PASS WITH FINDINGS / BLOCKED
Findings: ID, severity, status, first/latest affected commit, evidence, remediation,
          regression and hosted proof, limited-beta/Production impact
First blocking evidence gap, if any:
Proposed LAST_AUDITED_COMMIT (or UNCHANGED with reason):
Requested Orchestrator/Product Owner decision:
```

The Orchestrator triages findings into bounded development tasks, not automatic fixes. After accepting a complete audit, it updates `AUDIT-STATE.md`, appends or updates durable IDs in `AUDIT-FINDINGS.md`, records its own decisions in `AUDIT-DECISIONS.md`, and updates surface/gate statuses only with direct evidence. A blocked/partial audit cannot silently advance the checkpoint or release gate. Resolved findings stay visible with resolution evidence.

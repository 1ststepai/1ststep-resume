# Task contract

Copy this into the task or PR before edits. Record facts, not aspirations. `UNKNOWN — VERIFY` blocks a claim requiring that evidence.

```text
OBJECTIVE:
CURRENT BEHAVIOR: (observed baseline, date, environment, source)
REQUIRED BEHAVIOR:
OWNER: (one task owner; subsystem owner; required read-only reviewers)
IN SCOPE:
OUT OF SCOPE:
ACCEPTANCE CRITERIA: (observable, numbered)
ENVIRONMENT: (pwd; repo root; worktree; branch; HEAD; status; target Preview/Production if applicable)
APPROVAL GATES: (who decides; what exact action is held)
REQUIRED EVIDENCE: (test, runtime, live path, security, receipt, rollback as applicable)
LOOP LIMIT: (named loop, current attempt / maximum, or one pass)
```

Before editing, check for overlapping active work in the same files/subsystem. Stop and hand off the conflict instead of overwriting it. Separate a newly discovered task rather than expanding the current contract. Use `docs/AI_HANDOFF.md` to report the result.

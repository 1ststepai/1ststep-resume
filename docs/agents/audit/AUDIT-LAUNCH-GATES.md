# Independent audit view of launch gates

This is a **separate evidence view**, not a replacement for `docs/production-readiness/release-gate.md`, `docs/JOB_AGENT_DEPLOYMENT_RUNBOOK.md`, or owner approval. The auditor reports; the Orchestrator reconciles statuses. A green deterministic gate is not a signed-user or Production pass.

| Gate | Minimum independent evidence | Initial audit status |
| --- | --- | --- |
| 1. Public informational surfaces | Exact deployment/source parity and truthful navigation, pricing, privacy, and capability copy for the three public subdomains. | NOT AUDITED — HTTP reachability alone is insufficient. |
| 2. Signed Job Agent limited beta | Controlled-user Clerk/session, durable tenant profile/My Jobs, consent, negative authorization, recovery, cost/ops, and exact Preview then Production acceptance. | EVIDENCE INCOMPLETE — signed path and hosted data unproven. |
| 3. Employer-browser assistance | Separate terms/owner approval, reviewed supported adapter and artifact, transient data, checkpoints, human gates, no autonomous submit. | NOT APPROVED / NOT AUDITED. |
| 4. Autonomous final application submission | Separate explicit policy/owner authority; idempotent final action, outcome-unknown recovery, kill switch, and authoritative employer receipt before `Submitted`. | NOT APPROVED / NOT AUDITED. |
| 5. Partner portal operational status | Verified partner identity, isolation, consent, admin approval, lifecycle, and honest public claims; payout/commercial gates separately approved. | NOT AUDITED — candidate tests are not live proof. |
| 6. Full production | Applicable prior gates, exact candidate/deployment evidence, independent audit disposition, security/DB/capacity/backup/support/rollback and human release decision. | EVIDENCE INCOMPLETE — not one global ready flag. |

For each cycle, report gate-specific `PASS`, `FINDINGS`, or `BLOCKED/UNKNOWN` with exact evidence and whether unresolved findings block that gate. Do not infer that a gate is ready because an unrelated surface is live. Production, employer actions, provider activation, and publication still require separate owner authorization.

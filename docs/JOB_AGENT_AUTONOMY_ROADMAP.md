# Job Agent Autonomy Roadmap

## Product target

Build 1stStep.ai toward **autonomous by default, supervised by exception**. The agent should search, verify, tailor, fill, checkpoint, recover, and monitor applications without repeated user prompting. Human involvement is reserved for genuine trust-boundary events.

## What may run unattended

- Search and deterministic job filtering/deduplication
- Role, salary, remote/NJ, recency, travel, and qualification verification
- Role-specific resume and cover-letter generation from verified facts
- Ordinary profile fields already approved by the user
- Previously approved screening answers when wording and meaning match
- Navigation, draft saving, document selection, upload, and checkpoint recovery
- Receipt-email and employer-dashboard reconciliation
- Bounded retries and connector failover

## Required human gates

Pause only for CAPTCHA or anti-bot challenges, OTP/login/identity verification, new or ambiguous facts, legal agreements, certifications, signatures, employer attestations, unusual background/credit requirements, or material compensation, travel, schedule, conflict, and outside-employment decisions. Never bypass or simulate these gates.

## Implementation sequence

1. **Execution foundation:** define an ATS adapter contract, capability matrix, application state machine, idempotency key, checkpoint model, and receipt evidence model.
2. **High-coverage adapters:** harden the existing Greenhouse, Lever, Ashby, SmartRecruiters, and Workable paths. Keep Workday human-assisted until behavior and receipt handling are independently verified.
3. **Answer memory:** store answer, source fact, date, confidence, wording match, scope, and explicit user approval. Reject reuse when semantic meaning differs.
4. **Risk-based automation:** auto-complete only ordinary verified fields; route all required human gates to a single actionable card with the exact blocker and suggested truthful response.
5. **Recovery:** persist browser/session checkpoints, verify uploads, detect stale sessions, use bounded retries, and resume without duplicating a submission.
6. **Evidence:** accept `Submitted` only after an authoritative employer confirmation page, email, or candidate-dashboard record. Form completion is never sufficient.
7. **Operations:** emit real event telemetry for searching, verifying, tailoring, filling, waiting, blocked, failed, closed, and submitted. The dashboard must never display simulated activity.
8. **Scale:** run search, verification, tailoring, and staging workers in parallel with tenant isolation, rate limits, cost controls, and connector health monitoring.

## UX contract for blockers

Every pause must identify the employer, role, requisition, current step, exact unresolved action, why it is required, source fact or uncertainty, and the next safe action. Preserve the live form state. Prefer batch approval for identical low-risk questions. After resolution, record the answer as reusable knowledge only when the user explicitly saves it.

## Release gates

Do not enable unattended submission until adapter tests, checkpoint/recovery tests, idempotency tests, receipt-only status tests, no-data-transmission-on-block tests, security review, and live employer-site verification pass. Preserve a kill switch, audit trail, and per-tenant automation policy.

## Non-goals

Do not bypass CAPTCHA, OTP, identity checks, employer terms, rate limits, or anti-bot controls. Do not infer qualifications, generate unsupported facts, claim submission without receipt evidence, or promise unlimited automatic applications.

## Definition of done

For a supported ATS, a user can start a qualified application run once; the agent completes all ordinary work, pauses only at a genuine trust boundary, resumes from the exact checkpoint, prevents duplicates, and records authoritative evidence for every final status.

## Continuous improvement operating loop

Continuous improvement is a product capability, not an instruction to invent activity. After every real run, record observed events, failures, user resolutions, ATS behavior, receipt evidence, cost, latency, and outcome. Convert observations into a bounded improvement candidate with a source, expected benefit, risk, affected connector, and rollback plan.

Prioritize improvements in this order: trust and data safety, submission correctness and recovery, blocker reduction, connector coverage, user effort, cost, then speed. The system may automatically tune thresholds, retries, routing, and known-safe field mappings only when changes are reversible, tested, tenant-scoped, and supported by observed evidence. It must never silently change a user's truth, consent, policy, or submission authority.

Each improvement cycle must: detect a repeated issue, measure its baseline, propose the smallest fix, run regression and security checks, canary the change, compare real telemetry, and either promote or roll back. Keep a changelog of the evidence and decision. No idle polling, simulated events, fabricated learning, or autonomous production deployments.

New chats and agents should read this roadmap before changing the job-agent services. Existing chats should treat it as the shared source of truth and link any implementation task to the relevant roadmap section.

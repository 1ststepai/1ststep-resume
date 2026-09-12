# Bounded development loops

Choose one loop per task. Every cycle records the baseline, hypothesis, changed files, exact test/live result, and remaining unknowns in the task handoff. A new hypothesis counts as another cycle; repeating the same attempt is not progress. **PASS** requires all listed acceptance evidence, **BLOCKED** is an honest stop, and **NEEDS DECISION** is a product/policy choice. No loop authorizes Production, Web Store publication, data migration, provider activation, or a real employer action. Follow `docs/AI_MEMORY.md`, `docs/JOB_AGENT_RUNTIME.md`, and `docs/JOB_AGENT_DEPLOYMENT_RUNBOOK.md` where applicable. Roll back only the task's isolated candidate change after reviewing its diff; never reset shared work or roll back Production without approval.

## 1. P0 Reliability — at most 3 materially different repair cycles

- **Trigger/objective:** A reproducible P0 blocks a safe core workflow; find the first divergence and repair it with the smallest change.
- **Owners:** Orchestrator assigns the affected specialist; QA validates; Security or Live Path Verification joins at their boundary.
- **Cycle/acceptance:** Reproduce → identify first divergence → regression test → smallest fix → focused tests → affected suite → isolated or live verification. Require the original failure gone and the affected path intact.
- **PASS/BLOCKED/escalate:** Pass on direct path and regression evidence. Block if reproduction or required environment is unavailable, risk increases, or cycle 3 fails. Escalate policy/trust-boundary choices to owner.
- **Gates/evidence/rollback:** No production mutation; save redacted reproduction, test results, before/after path evidence, exact diff, and a candidate-only revert plan.

## 2. Capture + Persistence — at most 2 repair cycles

- **Trigger/objective:** Captured role missing, disappearing, or duplicated; prove one durable canonical My Jobs record.
- **Owners:** Job Intelligence primary; ATS Adapter / Capture, Chrome Extension, Identity & Data, QA, Live Path Verification, and Security at their boundaries.
- **Cycle/acceptance:** A real supported job → extension → authenticated request → canonical identity → durable tenant record → exactly one My Jobs entry → refresh → still present → sign out/in → still present → same requisition captured again → still one canonical job/application. Test separate capture IDs; replaying one capture ID alone does **not** prove requisition deduplication.
- **PASS/BLOCKED/escalate:** Pass only with readback and duplicate-replay evidence for the same tenant. Block when auth/consent/store/live access is absent or after cycle 2. Escalate identity conflict or existing submitted/unknown state rather than creating another record.
- **Gates/evidence/rollback:** Real account consent and private data remain human-controlled; no employer submission. Keep redacted IDs/hashes, tenant-isolation and idempotency test output, path chronology, and isolated revert plan.

## 3. Extension Reliability — at most 3 cycles

- **Trigger/objective:** Extraction, message, worker, storage, auth bridge, retry, browser restart, stale session, permission, or package failure.
- **Owners:** Chrome Extension primary; ATS Adapter / Capture and Security review; QA and Live Path Verification validate.
- **Cycle/acceptance:** Reproduce supported host/version → inspect first failed hop → smallest fix → focused extension tests → install exact candidate package → repeat path including restart/stale state when implicated. Preserve host permission and app bridge contracts.
- **PASS/BLOCKED/escalate:** Pass with exact package/version and observed user-path proof. Block if installed build or browser evidence is unavailable, permission broadening is needed without approval, or cycle 3 fails. Escalate new host or store-claim scope.
- **Gates/evidence/rollback:** Publication and permission expansion require owner approval; retain package digest, version, minimal logs, test output, and reinstall/rollback artifact.

## 4. Autonomous Application — one real attempt per explicitly authorized test

- **Trigger/objective:** An owner explicitly authorizes one named real application test under current product and site policy; exercise ordinary authorized steps to authoritative receipt or a truthful stop.
- **Owners:** Application Execution primary; Content & Truth, Exception & Receipt, Security, and Live Path Verification at their boundaries.
- **Cycle/acceptance:** Verified candidate facts → verified job/hard filters → approved policy/consent → package → inspected form → ordinary supported fields → checkpoint → exception detection → human resolution only if required → permitted action → authoritative employer receipt → reconciled state. One attempt, no implicit retry.
- **PASS/BLOCKED/escalate:** Pass only when the authorized objective and receipt/state evidence match. Missing facts, CAPTCHA, OTP, login/identity, legal text, signature, attestation, ambiguous qualification, unsupported answer, anti-bot control, or outcome unknown means block/Needs You; unknown stays unknown. Escalate any consequential choice.
- **Gates/evidence/rollback:** Real submission requires exact action-time authorization and the existing launch gates; never bypass employer terms. Keep checkpoint and content-free audit/receipt evidence; a submitted application cannot be rolled back, so reconcile rather than repeat.

## 5. Application Exception — at most 2 automated resume attempts after human resolution

- **Trigger/objective:** A legitimate blocker interrupts an existing attempt; resume from its exact checkpoint once resolved.
- **Owners:** Exception & Receipt primary with Application Execution; Content & Truth for missing facts; Security for identity/legal boundaries.
- **Cycle/acceptance:** Classify blocker → preserve checkpoint and exact question → request only necessary user action → verify resolution and consent → resume without restarting or duplicating a submission. Verify unchanged host, form, and attempt ID.
- **PASS/BLOCKED/escalate:** Pass on verified resumed checkpoint and correct state. Block on stale/changed form, unresolved question, ambiguous outcome, or two failed resumes. Escalate new consequential/legal decisions; no inferred answer.
- **Gates/evidence/rollback:** Human solves CAPTCHA/OTP/identity/legal/attestation; retain redacted blocker, checkpoint version, resolution proof, resume result, and safe stop path. Never persist credentials or challenge answers.

## 6. Truth Verification — at most 3 revisions

- **Trigger/objective:** A résumé, letter, or application claim lacks clear support or a screening answer is unknown.
- **Owners:** Content & Truth primary; Exception & Receipt handles human question; QA checks artifacts.
- **Cycle/acceptance:** Map each material claim to a candidate-confirmed source and exact scope → remove, weaken, or ask for unsupported information → regenerate/reinspect document and source map. Reuse an answer only when wording, meaning, approval, and version match.
- **PASS/BLOCKED/escalate:** Pass when every material claim is supported and artifact QA passes. Block on missing fact or after revision 3. Escalate material ambiguity to the candidate; no fabricated metrics, qualifications, or match scores.
- **Gates/evidence/rollback:** Candidate approval of new facts/answers; keep source references/version and artifact QA without private values in source control. Revert candidate document version if needed; preserve audit history.

## 7. Auth / Persistence — at most 3 cycles

- **Trigger/objective:** Sign-in, cross-session state, or tenant read/write path fails; establish durable authorized retrieval.
- **Owners:** Identity & Data primary; Chrome Extension and Security at bridge/authorization boundaries; QA and Live Path Verification validate.
- **Cycle/acceptance:** Test new and existing sessions, expiration, refresh, sign out/in, extension bridge, tenant ownership, unauthorized request, and durable retrieval. Include two-tenant denial evidence where the claim concerns isolation; static SQL is insufficient for hosted RLS proof.
- **PASS/BLOCKED/escalate:** Pass only with the scoped runtime and denial evidence. Block on unavailable auth/store/consent, unknown hosted migration state, or cycle 3. Escalate production auth/data/config changes and protected-data decisions.
- **Gates/evidence/rollback:** No production Clerk, Redis, Postgres, or migration change without approval; retain redacted environment/deployment identity, negative tests, readback, and reversible candidate plan.

## 8. Security — at most 2 remediation cycles for release blockers

- **Trigger/objective:** Validated exploitable finding or release-blocking trust-boundary gap; close the scoped path.
- **Owners:** Security primary with affected subsystem owner; QA validates regression.
- **Cycle/acceptance:** Reproduce/validate impact → smallest boundary fix → attack-path regression → relevant security gate → recheck affected runtime when required. Prioritize exploitable paths and avoid whole-repo cleanup.
- **PASS/BLOCKED/escalate:** Pass on validated fix and negative-path proof. Block on missing runtime evidence, new exposure, or cycle 2. Escalate unresolved data/legal/production policy.
- **Gates/evidence/rollback:** No weakening auth, CSP, RLS, consent, receipt, or cost gates. Retain redacted finding, exact diff, tests, residual risk, and isolated revert plan.

## 9. Live Path — at most 3 cycles

- **Trigger/objective:** Source/tests suggest success but real user path is unproven or broken; find the first observed divergence.
- **Owners:** Live Path Verification primary; affected implementation owner repairs; QA records regression.
- **Cycle/acceptance:** Start from a sufficiently clean known version and fresh supported input → run full path → record first divergence → fix only that hop → rerun the **complete** path, including persistence and duplicate replay if relevant.
- **PASS/BLOCKED/escalate:** Pass only on complete observed path in the named environment. Block on stale/consumed capture, missing account/consent, environment outage, or cycle 3. Escalate any real employer action or policy conflict.
- **Gates/evidence/rollback:** Preview evidence does not prove Production. Retain version/deployment, redacted step chronology, screenshots/logs without applicant data, and isolated candidate rollback.

## 10. Release Candidate — at most 2 candidate cycles

- **Trigger/objective:** An exact candidate is proposed for release; prepare a decision packet under `docs/JOB_AGENT_DEPLOYMENT_RUNBOOK.md`.
- **Owners:** Release Manager primary; QA, Security, Live Path Verification, and affected domain owners review.
- **Cycle/acceptance:** Verify canonical repo/worktree/branch/SHA and clean/reconciled source; version/extension digest; exact-head CI/tests/security; Preview live path; current Production baseline and source parity; required signed runtime, database/RLS, capacity, recovery, support, and rollback evidence. Missing evidence stays unknown.
- **PASS/BLOCKED/escalate:** Output exactly **READY FOR HUMAN APPROVAL**, **NOT READY**, or **BLOCKED** with reasons. A green PR alone is not ready. Stop after two candidate cycles; escalate unresolved risk, config, merge, or scope decisions.
- **Gates/evidence/rollback:** Human separately approves merge, Production deployment, Web Store publication, production configuration/migration, and rollback. Retain exact candidate index, check URLs/results, deployment IDs, live baseline, rollback preflight, and approval record. Never deploy automatically.

## 11. Product Feedback / Continuous Improvement — one bounded experiment at a time

- **Trigger/objective:** Repeated **real observed** issue has a measurable baseline; improve one safe behavior under `docs/JOB_AGENT_CONTINUOUS_IMPROVEMENT.md`.
- **Owners:** Analytics / Learning primary with affected product owner; QA and Security review.
- **Cycle/acceptance:** Real baseline → hypothesis → smallest reversible change → test/canary → real measurement → keep or revert. State the observation window and limit before starting; no auto-renewing experiment.
- **PASS/BLOCKED/escalate:** Pass only with measured benefit and unchanged safety invariants. Block on insufficient data, failed safety fixture, missing consent, or exhausted window. Escalate candidate facts, hard filters, screening answers, privacy, transmission, submission authority, or legal changes.
- **Gates/evidence/rollback:** No simulated applications/success or idle polling. Retain aggregate evidence, version, cost, decision, and one-click or candidate revert path; product auto-promotion remains limited to the existing approved low-risk categories.

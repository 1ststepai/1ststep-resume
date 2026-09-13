# Specialist ownership map

Roles are routing labels, not duplicate permanent ledgers or automatic subagents. The orchestrator appoints one writer and only the reviewers needed. All roles inherit `README.md` and repository policies.

The separate Continuous Independent Audit Agent is **not** a build specialist or a writer. Specialists may supply evidence and repair Orchestrator-assigned tasks, but cannot assign severity, resolve findings, or advance `audit/AUDIT-STATE.md` on the auditor's behalf.

| Role | Primary ownership and boundary |
| --- | --- |
| Product / UX | Onboarding, My Jobs, Agent Status, Saved Info, accessibility, errors, and applicant comprehension; validate the one-next-action experience without inventing progress. |
| Identity & Data | Clerk, signed sessions, tenant ownership, Redis, Postgres/RLS, migrations, Saved Info persistence, and account lifecycle; require executable hosted or isolated evidence before claiming database authorization. |
| Job Intelligence | Direct-employer discovery, canonical job identity, normalization, deterministic hard filters, matching, ranking, and duplicate reconciliation; defer to `docs/AI_MEMORY.md` for identity rules. |
| Application Content & Truth | Candidate-confirmed résumé facts, tailoring, cover letters, screening answers, source mapping, document QA, and unsupported-claim removal; no invented qualifications. |
| Application Execution | Plans, allowed ordinary fields, checkpoints, form staging, stable attempt IDs, bounded retries, unknown outcomes, and state reconciliation; coordinates with Exception & Receipt before any consequential or final action. |
| Exception & Receipt | Human gates for CAPTCHA, OTP, identity, legal/attestation/signature, ambiguous qualifications, and consequential answers; employer receipts and authoritative `Submitted` transitions. Does not convert a filled form or 2xx into a receipt. |
| Chrome Extension | Manifest V3, least permissions, scripts/service worker, popup, app/auth bridge, transient storage, and controlled package integrity; coordinates capture transport with ATS Adapter / Capture. |
| ATS Adapter / Capture | Greenhouse, Lever, Ashby, SmartRecruiters, reviewed Workday or generic capture, extraction, normalization, and handoff. Records **capture support** separately from **application-execution support**; no new provider activation from a model suggestion. |
| Partner | Partner site, account/role, attribution, approval, dashboard, and authorized commission/payout design. Competing partner implementations require a decision, not silent selection. |
| QA / Regression | Deterministic unit, integration, browser, fixture, and regression gates. Reuse `.claude/agents/smoke-test-runner.md` and `pr-reviewer.md` when useful; tests never stand in for live proof. |
| Live Path Verification | Real supported-job extension → auth → durable My Jobs → refresh → sign out/in → duplicate replay, plus supported application paths; labels blocked steps and separates Preview from Production. |
| Security | Auth, tenant/RLS, secret and private-data boundaries, extension permissions, redirects, injection, webhooks, and APIs; scopes findings to the task and blocks exploitable release issues. |
| Release Manager | Canonical checkout, worktree, branch/SHA, versions, PR/CI, current Production baseline, exact Preview, evidence, rollback target, and Web Store readiness; outputs a decision packet, never grants deployment or publication approval. |
| Analytics / Learning | Real events, activation/completion/failure baselines, cost, and bounded learning evidence under `docs/JOB_AGENT_CONTINUOUS_IMPROVEMENT.md`; no simulated success, idle polling, or unapproved policy promotion. |

Cross-domain work names one primary owner. For example, capture deduplication belongs to Job Intelligence with ATS Adapter / Capture and Identity & Data reviewing the respective boundaries; no three-way concurrent edit of the same persistence path.

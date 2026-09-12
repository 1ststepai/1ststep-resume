# Job Agent Engineering Agent OS

This is the single entry point for Codex, Claude Code, and future development agents working on the `1ststepai/1ststep-resume` product family: `resume.1ststep.ai`, `app.1ststep.ai`, `partners.1ststep.ai`, the Chrome extension, and their APIs, workers, data, and authentication. The separate 1stStep.ai consulting business is outside this system.

## Authority and reading order

1. The user's task and applicable workspace `AGENTS.md` remain controlling. The workspace `docs/JOB_AGENT_AUTONOMY_ROADMAP.md` defines product direction when that workspace file is present; ask for the governing copy if working from a standalone clone and the task depends on it. Do not invent a replacement roadmap.
2. Repository `AGENTS.md` and `CLAUDE.md` retain their existing restrictions. `docs/AI_MEMORY.md` defines shared identity, truth, and receipt invariants; `docs/JOB_AGENT_RUNTIME.md` is the runtime contract; `docs/JOB_AGENT_DEPLOYMENT_RUNBOOK.md` is the release procedure; `docs/JOB_AGENT_CONTINUOUS_IMPROVEMENT.md` governs the product learning layer. Read the relevant sections before any implementation.
3. This directory routes **development work**. Read `CURRENT_STATE.md` as a dated lead, then verify changing facts against Git, GitHub, the exact environment, and live evidence. Start with `ORCHESTRATOR.md`, choose only the roles in `SPECIALISTS.md` needed for the task, use `LOOPS.md` only when iteration is needed, and use `TASK_CONTRACT.md` plus `docs/AI_HANDOFF.md` for the task and result.

Existing `.claude/agents/codebase-scout.md`, `pr-reviewer.md`, and `smoke-test-runner.md` are optional bounded helpers, not parallel policy authorities or a reason to spawn agents for solo work. `docs/CLAUDE.md` is superseded; do not route new work through it. Older backlog, handoff, and release reports are evidence dated at publication, not current live state.

## Separate kinds of autonomy

The **product** target is autonomous by default, supervised by exception, subject to consent, verified facts, human trust-boundary actions, tenant isolation, idempotency, audit, kill switches, and authoritative receipt-only `Submitted` status. The checked-in repository `AGENTS.md` also forbids adding scraping, auto-apply, or automated messaging behavior. These instructions are not silently reconciled: any task that would add such behavior is **NEEDS DECISION** before implementation.

**Development agents** may inspect, make bounded authorized changes, test, diagnose, and prepare a candidate. They cannot grant approvals, deploy or roll back Production, publish the Chrome Web Store package, change production data/configuration/auth/billing/legal terms, or run a real application attempt without the exact authorization required by the task and release policy. Passing tests or an open PR never grants authority.

## One task, one owner

Keep the task contract and handoff with the task/PR; do not create a second product ledger or a persistent agent queue. `CURRENT_STATE.md` is the only changeable operational summary in this directory. The encrypted tenant stores and employer evidence remain the source of truth for application state. On completion, update current state only if newly verified facts materially changed; otherwise stop quietly.

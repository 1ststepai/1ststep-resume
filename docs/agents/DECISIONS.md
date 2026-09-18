# DECISIONS — Job Agent (owner-reviewed worktree copy)

Canonical table also lives on `cursor/job-agent-ui-ux-polish-20260917` `docs/agents/DECISIONS.md`. Do not fork conflicting meanings.

## D-2026-09-18-product-boundary

Job Agent is `app.1ststep.ai` / `1ststep-resume` only. `1ststep.ai` consultancy + `/admin` Studio, `resume.1ststep.ai` acquisition, and `partners.1ststep.ai` affiliates are separate products.

## D-2026-09-18-action-first-ux

Every user-facing screen has a purpose and a clearly dominant next action. Do not remove consequential confirmation, consent, résumé authority, or beta gates to reduce clicks.

## D-2026-09-18-waitlist-not-beta

Public waitlist is demand only. It must not write `JOB_AGENT_PILOT_ALLOWED_TENANTS`.

## D-2026-09-18-r3-ceiling

R3 PASS on `cfa483c` is the capability ceiling for this release lane. UX `8d3ac08` is held until Director-authorized integrate. Preview and tenants remain blocked.

## D-2026-09-17-owner-reviewed-not-counsel

Owner-reviewed uses `JOB_AGENT_OWNER_REVIEWED_POLICY`, never `JOB_AGENT_COUNSEL_APPROVED`. Preview-only. Cannot satisfy Production signedBeta.

## D-2026-09-17-pr86-frozen

PR #86 frozen at `bbb6ee3`.

## D-2026-09-04-receipt-only

Only authoritative employer receipt evidence may produce `Submitted`.

## D-2026-09-04-greenhouse-only-extension

Controlled-release extension is Greenhouse-only.

## D-2026-09-17-handoff

Cursor and Codex are interchangeable workers. Git + `docs/agents/*` are truth. Chat is not.

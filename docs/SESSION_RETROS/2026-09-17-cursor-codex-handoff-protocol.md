# 2026-09-17 — Cursor ↔ Codex handoff protocol

## Changed
- Installed a repository-resident Cursor ↔ Codex handoff layer so a fresh agent can resume from Git without chat history.

## Files Touched
- `AGENTS.md`, `CLAUDE.md`, `package.json`
- `docs/agents/HANDOFF.md`, `CURRENT-STATE.md`, `NEXT-ACTIONS.md`, `DECISIONS.md`, `README.md`, `GIT-STATE.md`
- `scripts/agent-handoff-status.mjs`, `scripts/agent-handoff-status-test.mjs`
- `docs/AI_HANDOFF.md`, `docs/SESSION_RETROS/README.md`

## Verification
- `npm run test:agent-handoff`

## Risks / Follow-Up
- UX candidate `8d3ac08` remains local-only. Do not infer PUSHED/MERGED/DEPLOYED/HOSTED VERIFIED.
- Do not redesign Job Agent while carrying this protocol.

## Suggested Next Prompt

Paste this next:

```txt
Read AGENTS.md, docs/agents/HANDOFF.md, docs/agents/CURRENT-STATE.md, and docs/agents/NEXT-ACTIONS.md. Independently review UI/UX candidate 8d3ac083e4906c7d2940e7e4501191b8f4c923d3 against docs/OWNER_REVIEWED_CONTROLLED_BETA.md. Do not deploy. Do not set JOB_AGENT_COUNSEL_APPROVED.
```

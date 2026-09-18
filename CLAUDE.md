# Claude Code Harness

## Prime Directive

Use the least context necessary. Do not scan the whole repo unless explicitly asked.

## LeanCTX Requirement

If lean-ctx tools are available, prefer them over native reads/search/shell for context-heavy work:

- Use `ctx_search` before opening files.
- Use `ctx_read` in `map`, `signatures`, or `auto` mode before full reads.
- Use `ctx_shell` for verbose commands so output is compressed.
- Use native tools only when lean-ctx is unavailable or a raw edit/read is required.

For setup and verification, see `docs/LEAN_CTX.md`.

## Token Discipline

1. Read this file, `AGENTS.md`, `docs/agents/HANDOFF.md`, and `docs/AI_MEMORY.md` first. Git plus `docs/agents/` are the live Cursor ↔ Codex baton. Chat history is not.
2. Use search/grep before opening large files.
3. Identify the smallest relevant files before editing.
4. Prefer surgical patches over rewrites.
5. Do not paste full files back unless requested.
6. For bug fixes, target under 50 changed lines when practical.
7. For features, work in small verified chunks.
8. Stop after one logical fix and report exactly what changed.

## Required Workflow

1. Restate the task in one sentence.
2. Run working-tree safety: `git status`, current branch, `HEAD`, `git worktree list`, then read `docs/agents/HANDOFF.md` and `docs/agents/CURRENT-STATE.md`. Do not overwrite a dirty foreign worktree.
3. Locate only relevant files.
4. Explain the smallest safe change.
5. Patch only those files.
6. Run the relevant verification command.
7. Update `docs/agents/HANDOFF.md` before stopping. Append a short note to `docs/SESSION_RETROS/` for non-trivial work.

## Verification

Inspect `package.json` before choosing commands. Common checks:

```bash
npm run lint
npm run test
npm run build
node scripts/smoke-test.cjs
```

If a command does not exist, choose the closest safe verification command.

## Safety

Never expose or commit secrets. Do not read or print `.env*` files. Do not run destructive git commands. Do not deploy unless explicitly asked.

## Product Context

This repo belongs to Evan Pancis and 1stStep.ai.

For any Job Agent, Application Concierge, discovery, package, tracker, or submission work, read `docs/AI_MEMORY.md` and `docs/JOB_AGENT_RUNTIME.md` before editing. The shared-memory section in `docs/AI_MEMORY.md` is the cross-agent contract for Claude and Codex; do not create a parallel architecture or duplicate job/application ledger.

Primary URLs:
- AI resume builder landing page: https://resume.1ststep.ai/
- App: https://app.1ststep.ai/

Positioning: 1stStep is a full job-application workflow, not just an AI resume builder. Core workflow: upload resume, paste/capture job description, tailor resume, generate cover letter, show match score, track jobs, use Chrome extension, prep for interviews, and preserve resume history.

## Communication Style

Assume the owner is a novice coder. Give copy/paste-ready instructions, clear risk flags, and concrete next steps.

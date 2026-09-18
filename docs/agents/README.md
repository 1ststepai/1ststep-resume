# Cross-agent handoff layer

Cursor, Codex, and future agents share this directory. Git and these files are authoritative. Chat history is not.

| File | Role | Who writes it |
|---|---|---|
| [HANDOFF.md](./HANDOFF.md) | Live baton: current task, next executable action | The agent stopping work |
| [CURRENT-STATE.md](./CURRENT-STATE.md) | Operational snapshot: branches, SHAs, release ladder, blockers | The agent stopping work |
| [NEXT-ACTIONS.md](./NEXT-ACTIONS.md) | Prioritized executable queue | The agent stopping work |
| [DECISIONS.md](./DECISIONS.md) | Durable architecture/product decisions | Humans/agents when a decision is made |
| [GIT-STATE.md](./GIT-STATE.md) | Machine-captured Git facts | `npm run agent:handoff-status` only |

Start every engineering session:

1. `git status`, `git branch --show-current`, `git rev-parse HEAD`, `git worktree list`
2. Read `HANDOFF.md`, `CURRENT-STATE.md`, `NEXT-ACTIONS.md`
3. Run `npm run agent:handoff-status` and reconcile any SHA/branch/dirty-file drift
4. If another worktree is dirty on the same files, stop. Do not overwrite uncommitted work.

`docs/status.md`, `docs/tasks.md`, `docs/project_handoff_notes.md`, and chat summaries are not live authority.

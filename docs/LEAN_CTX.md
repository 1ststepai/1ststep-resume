# LeanCTX Wiring

LeanCTX is the context-efficiency layer for Claude Code, Codex, Cursor, and Copilot sessions.

## What this repo expects

When LeanCTX MCP tools are available, agents should prefer:

- `ctx_search` instead of native grep/search for code discovery
- `ctx_tree` instead of native `ls`/`find` for directory maps
- `ctx_read` instead of native file reads for inspection
- `ctx_shell` instead of native shell for verbose commands

Keep native tools for writes/edits because LeanCTX does not replace normal file mutation workflows.

## One-time machine setup

Run this on each local machine, VPS, or coding box where Claude/Codex runs:

```bash
# Install
curl -fsSL https://leanctx.com/install.sh | sh

# Auto-configure detected editors/agents
lean-ctx setup

# Verify
lean-ctx doctor
lean-ctx gain
```

For Claude Code specifically:

```bash
claude mcp add lean-ctx lean-ctx
lean-ctx init --agent claude
```

For Codex CLI:

```bash
lean-ctx init --agent codex
```

For Cursor:

```bash
lean-ctx init --agent cursor
```

For VS Code / Copilot:

```bash
lean-ctx init --agent copilot
```

Restart the IDE/agent after setup.

## Session prompt

Use this at the start of future coding sessions:

```txt
Read CLAUDE.md, docs/AI_MEMORY.md, and docs/LEAN_CTX.md first.
If LeanCTX MCP tools are available, use ctx_search, ctx_tree, ctx_read, and ctx_shell before native search/read/shell tools.
Do not scan the whole repo. Find the smallest relevant files first.
```

## Validation

A repo is considered wired when:

- `CLAUDE.md` tells Claude to prefer LeanCTX tools
- `docs/LEAN_CTX.md` exists
- Cursor/Copilot project rules exist where applicable
- the machine running the agent has `lean-ctx doctor` passing

# LeanCTX Wiring

LeanCTX is the repo-local context layer for Claude/Codex sessions. It helps agents inspect files through compressed, purpose-built context tools instead of repeatedly reading large files or dumping long command output.

## Local setup

Run these commands from this repo on the machine where Claude Code runs:

```bash
claude mcp add lean-ctx lean-ctx
lean-ctx init --agent claude
```

If `lean-ctx` is not installed yet, install it first according to the current LeanCTX package instructions for your environment, then rerun the commands above.

## Agent usage rules

When LeanCTX MCP tools are available, agents should prefer:

- `ctx_tree` for directory exploration
- `ctx_search` for code discovery
- `ctx_read` for focused file inspection
- `ctx_shell` for commands that may produce long output

Agents should still use normal edit/write tools for actual file changes.

## Fallback

If LeanCTX is unavailable in a session, continue with normal Claude/Codex tools but preserve the same behavior:

- search before reading
- read the smallest relevant files only
- avoid whole-repo scans
- avoid pasting full files unless explicitly requested

## Suggested first prompt

```txt
Read CLAUDE.md, docs/AI_MEMORY.md, and docs/LEAN_CTX.md. If LeanCTX tools are available, use ctx_tree/ctx_search/ctx_read/ctx_shell for discovery. Do not scan the whole repo. Find the smallest relevant files for this task: ...
```

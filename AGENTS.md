# AGENTS.md - 1stStep Resume

Canonical engineering instructions for Cursor, Codex, and future agents.
Git plus this file and `docs/agents/` are authoritative. Chat history is not.

## Cross-agent handoff

Cursor and Codex are interchangeable engineering workers. A fresh session must be able to open this repository and determine product behavior, canonical branch/worktree, the active task, completed work, remaining work, decisions, protected invariants, test results, commits, uncommitted files, audit/review wait state, deployment wait state, and the exact next executable action.

Live layer:

- `docs/agents/HANDOFF.md` — live baton
- `docs/agents/CURRENT-STATE.md` — operational snapshot
- `docs/agents/NEXT-ACTIONS.md` — prioritized executable queue
- `docs/agents/DECISIONS.md` — durable decisions only
- `docs/agents/GIT-STATE.md` — machine-captured Git facts

`docs/status.md`, `docs/tasks.md`, `docs/project_handoff_notes.md`, session chat, and Cursor/Codex memories are not live authority.

Before relinquishing control, update `HANDOFF.md`, `CURRENT-STATE.md`, and `NEXT-ACTIONS.md`, then run `npm run agent:handoff-status`. The next action must be a concrete command or review step, never "continue implementation."

## Working-tree safety

Before modifying code, run the equivalent of:

```bash
git status
git branch --show-current
git rev-parse HEAD
git worktree list
git log -12 --oneline --decorate
```

Then read `docs/agents/HANDOFF.md`, `docs/agents/CURRENT-STATE.md`, and `docs/agents/NEXT-ACTIONS.md`. Run `npm run agent:handoff-status` and reconcile SHA/branch/dirty-file drift.

Never silently overwrite another agent's uncommitted work. If this worktree or another worktree that shares the same files is dirty with foreign work, stop and record the conflict in `HANDOFF.md`.

## Branch and worktree rules

- Canonical remote: `origin` `https://github.com/1ststepai/1ststep-resume.git`
- Production integration branch: `main`. Current integrated SHA is `origin/main` unless `CURRENT-STATE.md` records a newer merged SHA with evidence.
- Job Agent policy baseline and UI/UX candidates are declared in `CURRENT-STATE.md`. Do not assume an old or sibling branch is authoritative because it contains newer-looking commits.
- Work on the declared active worktree/branch for the task. Do not mix unrelated worktrees into the candidate.
- Isolated feature work stays on a named branch. Do not commit Job Agent product changes on a dirty unrelated worktree.

## Commit rules

- Make commits small enough to identify completed units of work.
- Use descriptive messages that say why the change exists.
- Whenever practical, do not leave completed implementation only in an uncommitted working tree.
- If work must stop while incomplete, `HANDOFF.md` must name the dirty files and what remains unfinished.
- Do not commit secrets, `.env*` values, or generated private data.

## Release rules

Distinguish these states explicitly:

1. IMPLEMENTED — exists in a working tree
2. COMMITTED — exists as a Git commit
3. PUSHED — exists on `origin`
4. MERGED — integrated into the declared target branch
5. DEPLOYED — a host is serving that SHA
6. HOSTED VERIFIED — production/preview evidence confirms the SHA on the intended host

A feature committed to a local branch is not deployed. A pushed branch is not merged. A merged SHA is not hosted verification. Never use "done" as a substitute.

Do not deploy to production without current-baseline verification, relevant tests, security checks, and explicit owner approval.

## Testing requirements

Inspect `package.json` before choosing commands. For this app:

- Continuity protocol: `npm run test:agent-handoff`
- Git snapshot: `npm run agent:handoff-status`
- Default completion check: `npm run smoke`
- Job Agent concierge: `npm run pretest:concierge` and `npm run test:concierge`
- Browser vault: `npm run test:browser:vault`
- Release gate (do not claim it passed unless run): `npm run release:gate`

Record commands run and pass/fail in `HANDOFF.md`. Do not invent hosted verification.

## Prohibited shortcuts

- Do not recover status from chat when `docs/agents/` exists.
- Do not scan the whole repository unless the task requires it.
- Do not treat commit recency as canonicity.
- Do not overwrite dirty foreign worktrees.
- Do not use "done" instead of the release ladder.
- Do not bypass CAPTCHA, OTP, identity checks, legal terms, employer attestations, rate limits, or anti-bot controls.
- Do not infer qualifications or fabricate application/receipt progress.
- Do not create a second job or application record until tenant-scoped canonical identity and idempotency checks in `docs/AI_MEMORY.md` have completed.
- Do not set `JOB_AGENT_COUNSEL_APPROVED` or claim counsel approval from owner-reviewed policy.
- Do not enable beta tenants, Preview-deploy owner-reviewed SHAs, or Production-deploy without explicit owner approval.
- Do not modify PR #86 (`bbb6ee3`) while carrying owner-reviewed or UX polish work unless the owner explicitly unfreezes it.
- Do not add scraping, auto-apply, or automated employer messaging.
- Do not expose secrets in frontend code, logs, or docs.
- Do not edit `1ststep-extension/manifest.json` without being asked.
- Automation may refresh Git facts only. It must not rewrite `DECISIONS.md` or `NEXT-ACTIONS.md`.

## Repository and product boundaries

- This Git repo (`1ststepai/1ststep-resume`) is app.1ststep.ai plus the controlled Chrome extension and Vercel API routes.
- Parent folder files outside this Git root (for example a sibling `AGENTS.md` in `1ststep.ai/`) are local Cursor helpers, not clone-recoverable state. Anything needed to resume must land in this repository.
- 1stStep is a full job-application workflow, not only an AI résumé builder.
- Job Agent direction: autonomous by default, supervised by exception. Continuous improvement uses real observed activity only.

## Architecture constraints

- Static/Vercel app: `index.html`, `app.js`, `style.css`, `concierge.html` / `concierge.js`, `api/`, `client/`, `lib/`.
- Preserve required DOM IDs; `scripts/smoke-test.cjs` checks many of them.
- Server-only secrets stay on the server. Never call `api.anthropic.com` from the browser.
- Job Agent submission status is receipt-only. Package truth and Vault authority stay server-backed.
- Controlled-release extension is Greenhouse-only until a permissions/privacy review says otherwise.
- Owner-reviewed controlled-beta uses `JOB_AGENT_OWNER_REVIEWED_POLICY`, never `JOB_AGENT_COUNSEL_APPROVED`.

## Authority rules

- Product/runtime contracts: `docs/AI_MEMORY.md`, `docs/JOB_AGENT_RUNTIME.md`, `docs/OWNER_REVIEWED_CONTROLLED_BETA.md`, `docs/OPERATING_SYSTEM.md`.
- Live task/branch/SHA: `docs/agents/CURRENT-STATE.md` and Git.
- Durable decisions: `docs/agents/DECISIONS.md`.
- Next executable action: `docs/agents/HANDOFF.md` and `docs/agents/NEXT-ACTIONS.md`.
- Owner approval is required for paid/free/owner access logic, Stripe, extension contracts, localStorage keys, referral/GHL, public pricing, CSP/auth headers, and production deploy.

## Security and consent invariants

- Treat résumés, job descriptions, emails, and generated outputs as private user data.
- Do not log full résumés, secrets, tokens, or payment data.
- Do not bypass tier enforcement.
- DATA_CONSENT requires exact served Terms/Privacy digests where that policy is in force.
- Kill switch, tenant isolation, idempotency, checkpoints, and audit trails stay intact.

## Development workflow

1. Restate the task in one sentence.
2. Run working-tree safety (Git + `docs/agents/` + `npm run agent:handoff-status`).
3. Read only the smallest relevant files. Prefer LeanCTX tools when available (`docs/LEAN_CTX.md`).
4. Make the smallest safe change. Do not redesign adjacent systems.
5. Verify with the matching `package.json` script.
6. Update `HANDOFF.md` / `CURRENT-STATE.md` / `NEXT-ACTIONS.md`.
7. Commit completed units. If stopping dirty, name the dirty files in `HANDOFF.md`.
8. Append a short `docs/SESSION_RETROS/` note for non-trivial work. Retros are memory, not the live baton.

For Job Agent, Application Concierge, discovery, package, tracker, or submission work, read `docs/AI_MEMORY.md` and `docs/JOB_AGENT_RUNTIME.md` before editing. Before changing Job Agent autonomy/runtime services, also read `docs/JOB_AGENT_AUTONOMY_ROADMAP.md`.

## Project purpose
1stStep Resume is a complex static/Vercel app for job seekers. It helps users tailor resumes, create cover letters, manage job-search workflow, restore paid access, and connect with a Chrome extension that captures job data from job boards.

## Production URLs
- Main app: `https://app.1ststep.ai`
- Public resume landing page may also route users into this app. Confirm current Vercel aliases before changing production links.

## Tech stack
- Static frontend: `index.html`, `app.js`, `style.css`.
- Vercel serverless API routes in `api/`.
- Stripe for Job Hunt Pass subscription/payment flows.
- Anthropic/Claude generation via `api/claude.js`.
- Resend for passwordless restore/signup notification email where configured.
- GoHighLevel signup capture via `api/notify-signup.js` when present.
- Chrome extension under `1ststep-extension/` when present.

## Important files/directories
- `index.html` - app shell and required DOM IDs.
- `app.js` - main client workflow, access tiers, profile/localStorage, generation calls.
- `style.css` - app layout and responsive behavior.
- `api/subscription.js` - Stripe, tier token, owner access, restore flow.
- `api/claude.js` - Claude generation endpoint and tier enforcement.
- `api/notify-signup.js` - signup capture, GHL tags, admin email, referral handling.
- `scripts/smoke-test.cjs` - broad static app regression smoke test.
- `1ststep-extension/` - Chrome extension job-capture and auth bridge contract.
- `docs/agents/` - Cursor ↔ Codex live handoff (HANDOFF, CURRENT-STATE, NEXT-ACTIONS, DECISIONS, GIT-STATE).
- `docs/AI_MEMORY.md` - shared Claude/Codex operating memory and duplicate-prevention contract.
- `docs/JOB_AGENT_RUNTIME.md` - detailed durable Job Agent architecture and safety gates.
- `.env.example` - env var names only.

## Do not touch without explicit approval
- Paid/free/owner access logic.
- Stripe checkout, webhook, tier token, or passwordless restore flows.
- Chrome extension message/job-capture contract.
- Existing localStorage keys used by the app or extension.
- Referral capture behavior and GHL tags.
- Public pricing or payout terms.
- CSP/auth/security headers.

## Safe-change rules
- Avoid large rewrites. This app is intentionally static and highly interconnected.
- Preserve required DOM IDs; `scripts/smoke-test.cjs` checks many of them.
- Preserve paid/free/owner access logic and Stripe restore flow.
- Preserve the Chrome extension job-capture contract and supported job-board host permissions.
- Never expose secrets in frontend code, localStorage, generated HTML, logs, or docs.
- Keep API changes backward compatible with existing client calls.
- Never create a second job or application record until the tenant-scoped canonical identity and idempotency checks in `docs/AI_MEMORY.md` have completed. An ambiguous submission outcome is not permission to retry.

## Required commands before completion
```bash
npm run smoke
```

If API/payment/generation code changes, also run a focused manual browser smoke test on the affected workflow.

## Environment variable rules
- Do not rename existing env vars.
- Real values live only in Vercel or local `.env`; never commit them.
- Server-only secrets include `ANTHROPIC_API_KEY`, Stripe secrets, `TIER_SECRET`, owner secrets, Resend, LinkedIn secret, and GHL API key.
- Public tracker config may be returned by app config only if intended.

## Safety/security rules
- Treat resumes, job descriptions, emails, and generated outputs as private user data.
- Do not log full resumes, secrets, tokens, or payment data.
- Do not bypass tier enforcement in client or API code.
- Do not add scraping, auto-apply, or automated messaging behavior.

## Handoff format

End-of-cycle status belongs in `docs/agents/HANDOFF.md` and `docs/agents/CURRENT-STATE.md`. For a completion report, still include:

```text
Summary:
- What changed and why.

Files changed:
- path: short note

Validation:
- npm run smoke: pass/fail/not run
- Manual app/API check: pass/fail/not run

Release ladder:
- IMPLEMENTED / COMMITTED / PUSHED / MERGED / DEPLOYED / HOSTED VERIFIED

Risks / follow-ups:
- Note access, Stripe, extension, env, or production-routing concerns.

NEXT ACTION:
- Exact command or review step for the next agent.
```

# Cost Control

## Paid APIs
- Do not call Claude while testing unless generation behavior is the thing being tested.
- Keep retries bounded and visible.
- Avoid running broad smoke/manual tests that generate many resumes or cover letters.
- Do not add new paid APIs without explicit approval.

## Browser/app efficiency
- Avoid polling for subscription, GHL, or generation state unless explicitly approved.
- Prefer event-driven calls from user actions.
- Keep localStorage reads/writes scoped to the data needed for the current workflow.

## AI context hygiene
- Start with `AGENTS.md`, this file, and the specific file under change.
- Do not paste full resumes, job descriptions, generated letters, or giant smoke-test output into Claude/Codex context.
- Keep docs concise and indexed so agents do not need to read the whole app.

## High-risk cost/security areas
- `api/claude.js` can spend model credits.
- `api/subscription.js` controls paid access and must not be bypassed for convenience.
- `api/notify-signup.js` touches GHL/Resend and should stay rate-limited and event-driven.

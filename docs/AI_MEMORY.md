# AI Memory

## Operating Rules

- Use minimal context.
- Search before opening large files.
- Do not rewrite large files unless necessary.
- Prefer small PR-sized changes.
- Always run verification before claiming done.
- Keep final summaries short and action-oriented.

## 1stStep.ai Context

Primary app: https://app.1ststep.ai/
Resume builder landing page: https://resume.1ststep.ai/

1stStep is a job-application workflow product, not just an AI resume generator.

Core workflow:
- Upload resume
- Paste or capture job description
- Generate tailored resume
- Generate cover letter
- Review match score
- Track jobs in the Job Tracker
- Use Chrome extension to capture jobs from job boards and ATS pages
- Prep for interviews
- Preserve resume history

## Known Technical Context

- Hosted on Vercel.
- Uses GitHub PR workflow.
- Static QA checks and smoke tests may be required before merge.
- Do not touch production env vars from code.
- Never expose Stripe, Resend, Claude, Supabase, Vercel, or owner-access secrets.

## Common Verification

Use available scripts from `package.json`.

Likely useful commands:

```bash
node --check app.js
node scripts/smoke-test.cjs
npm run build
npm run lint
```

If a command is missing, inspect scripts first and choose the closest safe check.

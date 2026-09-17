# 2026-09-17 — Telemetry R3 content-free fail-closed

## Changed
- Telemetry prose allowlist now applies to unspaced strings as well as spaced strings.
- Uppercase after the first character fails closed, covering TitleCase, CamelCase, and hyphenated names.
- `expectedBenefit` / `rollbackPlan` reject `://`, `/`, `www.`, `mailto:`, and domain/path-like syntax.
- Closed operational strings (`http_429`, `ats_*`, candidate types, promotion path) remain allowed.

## Files Touched
- `lib/application-efficiency-foundation.js`
- `scripts/application-efficiency-adversarial-test.mjs`
- `docs/POST_BETA_APPLICATION_EFFICIENCY.md`

## Verification
- `npm run test:answer-memory`: pass
- New successor commit (not an amend of 6586afeb)
- Answer-reuse / atomic-intent matching unchanged
- PR #86 / `bbb6ee31`: not modified

## Risks / Follow-Up
- Independent re-audit of the successor SHA. Passing tests is not integration readiness.
- Do not change atomic-intent matching or increase proposal coverage.

## Suggested Next Prompt

```txt
Independently re-audit the telemetry R3 successor of 6586afeb. Do not weaken tests. Do not touch PR #86.
```

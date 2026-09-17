# 2026-09-17 — Atomic intent R2 fail-closed gates

## Changed
- Remainder gate now drops only the matched atomic phrase; leftover non-stopword content fails closed.
- Compound/punctuation fails closed on commas, semicolons, colons, dashes, and slashes, including two-letter alternatives.
- `this <noun>` is application-scoped. Polarity adds false that / revoked / pending.
- Equivalent-proposal provenance is an allowlist. Efficiency reason codes are a closed vocabulary.

## Files Touched
- `lib/application-efficiency-foundation.js`
- `scripts/application-efficiency-adversarial-test.mjs`
- `scripts/application-efficiency-foundation-test.mjs`
- `docs/POST_BETA_APPLICATION_EFFICIENCY.md`

## Verification
- `npm run test:answer-memory`: pass
- New successor commit (not an amend of 8efa2a4)
- PR #86 / `bbb6ee31`: not modified

## Risks / Follow-Up
- Independent re-audit of the successor SHA. Passing tests is not integration readiness.
- Do not advance to role-family résumé preferences.

## Suggested Next Prompt

```txt
Independently re-audit the atomic-intent R2 successor. Do not weaken tests. Do not touch PR #86.
```

# Application control center

Status: active local implementation by Codex on `codex/chrome-store-policy-update`. No deployment is authorized.

Objective: combine existing durable application sessions, encrypted applicant facts, exact approvals, package source maps, deterministic job evidence, and receipt rules into one low-attention review surface. Preserve all current Claude work and reuse the existing stores rather than creating another ledger.

Codex-owned files for this task:

- `client/application-control-center.js`
- `application-control-center.css`
- `scripts/application-control-center-test.mjs`
- `docs/APPLICATION_CONTROL_CENTER.md`
- this session retro
- narrowly scoped integration lines in `concierge.html`, `concierge.js`, `build-public-web.mjs`, `lib/discovery-package-binding.js`, `lib/application-session-domain.js`, and `api/application-sessions.js`

Checkpoint: repository instructions, active diff, applicant vault, durable session ledger, draft review, browser execution route, and receipt gates inspected. Existing modified files remain owned by their prior author outside the integration lines listed above.

Implementation: added a low-attention control-center model and visible application review section, deterministic listing/form conflict checks, verified role evidence carried from the fresh ATS record into the exact approval scope, source-map counts on durable sessions, and a canonical deduplicated Markdown ledger export. The existing encrypted vault, durable store, browser checkpoint/recheck rules, one-attempt submission reservation, and authoritative receipt gate remain the source of truth. No new model call or persistent store was added.

Validation: `application-control-center-test`, discovery binding, durable application-session tests, public web build, required smoke suite, JavaScript syntax check, scoped diff check, and the focused action-time browser confirmation test pass. Desktop and 390 px mobile views were inspected in a real browser; the packet now appears before the approval button. The full existing vault browser file reported 35 passing and 6 failing cases. The failure traces cover current copy expectations, an existing explicit cloud-browser-choice change, package button wording, and learning/retry focus; the control-center approval case passed. Because no before-change baseline was run, their prior status is uncertain. Deployment remains unapproved and was not attempted.

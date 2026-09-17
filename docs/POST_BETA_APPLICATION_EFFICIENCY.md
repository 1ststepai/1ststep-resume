# Post-beta application efficiency foundation

Isolated research branch `codex/post-beta-application-efficiency-20260917`, forked from frozen controlled-beta candidate `bbb6ee31bffdd6c84729639c29d1d94c5ddb320e`. This document does not change PR #86, Production, Preview, or the controlled-beta checklist.

Optimization objective: minimize user effort required to produce a truthful, high-quality, user-approved application for a legitimately suitable job. Do not optimize for raw application volume.

## Existing-capability inventory

| Capability | Where it already lives | Reuse rule |
| --- | --- | --- |
| Saved Info / encrypted Vault | `lib/applicant-vault-domain.js`, `api/applicant-vault.js` | Single memory/profile store |
| Résumé authority/versioning | Vault documents + `selectedBaseResume` | Do not add a second document store |
| Career Positioning Brief | `app.js` generation + saved draft metadata | Keep optional; not a fact store |
| My Jobs history | `lib/tenant-campaign-store.js`, captured-job store | Outcomes stay receipt-gated |
| Match/qualification evidence | discovery/job-intelligence + run store | Verified signals only |
| Application sessions | `lib/application-session-domain.js` | Needs You + checkpoints |
| Questions/answers | session `AMBIGUOUS_FACT` + vault answer memory | Exact-match auto-reuse already exists |
| Needs You | campaign `needsYou`, notifications | Human gate, not a learning source by itself |
| Cover-letter / tailoring | application-package worker | Truth-bound to confirmed facts |
| ATS extraction | employer inspector + Greenhouse/Lever/Ashby/SmartRecruiters adapters | Fail closed; Workday remains review-required |
| Capture history | captured-job store + extension handoff | Host remains `app.1ststep.ai` |
| User-approved facts | vault `verificationState` | Never infer into confirmed |
| Consent/authorization | vault consent + job-agent policy levels | Semantic reuse still requires confirmed-facts scope |
| Outcome/status | receipt-only `Submitted` | Form completion is not a signal |
| Learning profile | `lib/job-agent-learning-domain.js` | Preferences, verified signals, proposals, no self-modifying Production |
| Continuous improvement loop | `docs/JOB_AGENT_CONTINUOUS_IMPROVEMENT.md` | observe → evaluate → human/low-risk promote → rollback |

## Gap analysis

Exact answer memory matches whitespace/case only. Repeated ATS questions with equivalent meaning still interrupt the user unless a single atomic intent can propose a review-only vault reference. Coarse buckets such as contact_details, employment_history, education, and location_relocation are not reusable-answer identities. False reuse is treated as worse than an extra UNKNOWN — NEEDS USER interruption.

## Post-beta architecture

Keep Vault as the only candidate memory. Exact ordinary matches continue to auto-reuse. Atomic intent matching may **propose** a vault fact reference only when exactly one supported atomic intent is identified, polarity is unambiguous, the question is not compound or bundled, scope is compatible, the source fact is a current CONFIRMED_FACT or semantically appropriate USER_PREFERENCE with eligible provenance, and the proposal remains review-only. Otherwise the result is UNKNOWN — NEEDS USER. The proposal never writes a new confirmed fact, never fills the employer form, never inverts a remembered answer, and never submits. User confirmation still creates an exact-question memory version through the existing remember/resolve path.

Start-availability answers expire after 30 days unless a future `expiresAt` remains. Other atomic intents have no invented TTL; they stay confirmation-gated. Implicit employer/role language (`our`, `this company`, `this role`, `headquarters`, and equivalents) is application-scoped and cannot become a cross-employer reusable fact. Compound detection is a general rule (`and` / `or` / multiple interrogative clauses / additional unresolved request) after masking the single standard phrase "now or in the future". It is not a list of known bad pairs.

System observations emit IMPROVEMENT CANDIDATES with `autoApplied: false`. Promotion remains observe → measure → propose → test → independent verification → owner/release approval.

## Privacy / data model

- No new Redis prefix or second vault.
- Proposals store `factId`, `factVersion`, `intent`, and class only.
- Efficiency snapshots are content-free counters and reason codes.
- Credentials, OTP, CAPTCHA, government IDs, and unnecessary medical data remain rejected.
- Protected traits are not learning features.
- Delete/export continue through existing vault and learning deletion.

## Learning-state taxonomy

| Class | Meaning | May auto-reuse? |
| --- | --- | --- |
| CONFIRMED FACT | User-confirmed or document-verified, not inferred | Only on exact ordinary memory match |
| USER PREFERENCE | Explicit preference with provenance | Mission filters only when user-confirmed; answers still reviewable |
| DERIVED BUT REVIEWABLE | Canonical-intent or generated suggestion | Propose only |
| UNKNOWN — NEEDS USER | Missing, revoked, inferred without confirmation, or out of catalog | Interrupt |

Inference never becomes CONFIRMED FACT.

## Application-efficiency metrics

Content-free only: time-to-review-ready, Needs You interruptions, unanswered fields, user corrections, confirmed-fact reuse count, equivalent-proposal count, duplicate/rework, capture failure count, ATS failure reason codes. No job titles, statements, emails, or employer names.

## Implementation sequence

1. **This slice:** taxonomy + canonical intent proposals + metrics + improvement-candidate objects, wired into existing inspection reuse.
2. Role-family résumé preference as a user-confirmed learning preference key (no new store).
3. Persist efficiency counters into the existing encrypted learning profile after evidence review.
4. UI batch-confirm for identical low-risk ordinary intents.
5. ATS adapter screening-field materialization remains a later verified adapter task, not relaxed matching.

## Tests

`npm run test:answer-memory` includes `scripts/application-efficiency-foundation-test.mjs` and `scripts/application-efficiency-adversarial-test.mjs`. Existing exact-match, sensitive, pause, and submission-boundary tests stay authoritative. Adversarial tests must not be weakened to obtain a pass.

## Migration / backward compatibility

Schema versions of vault and learning remain v1. Existing encrypted records are valid. Sessions without `equivalentAnswerProposal` behave as before. Exact-match auto-reuse is unchanged. No Production env, policy, or PR #86 change is required to keep the frozen beta safe.

## Human control

Human review remains required before consequential external actions. Sensitive, sponsorship, compensation, location/relocation, permission, and challenge answers stay confirmation-gated. Guessing is not a shortcut.

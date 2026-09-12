# 1stStep.ai Roadmap

This is the execution queue for the app, Chrome extension, resume site, partner site, and shared platform. Read `docs/OPERATING_SYSTEM.md` first. Status is evidence-based; `unknown` means the required evidence was unavailable.

## Verified baseline — 2026-09-10

- Source of truth: `1ststepai/1ststep-resume`, current `origin/main` `8a6ba82` at inspection time.
- The four requested surfaces share this repository but deploy independently.
- `app.1ststep.ai`, `resume.1ststep.ai`, and `partners.1ststep.ai` returned HTTP 200 from Ready production deployments.
- Public pricing is aligned: invitation-only free beta, future 1stStep Complete at $39/month, no active paid checkout, and no automatic conversion.
- Chrome Web Store release: v1.3.2. `main` manifest: v1.5.0. Open PR #72: v1.6 durable-capture candidate, mergeable with green reported checks.
- Consolidated candidate: `release/consolidated-job-agent-v1.6-20260910`, assembled and locally gated but blocked from Preview E2E and production by environment readiness.
- Local main baseline passed `npm run smoke`, `npm run build`, and `npm run test:extension-release` (17 browser tests). These checks do not prove production persistence or store compatibility.
- The unauthenticated readiness request returned `AUTH_REQUIRED`; production database, encryption, worker, and tenant-isolation runtime health are therefore `unknown` in this pass.
- Forty-four registered worktrees were inspected. Twelve were dirty before reconciliation and eight remain dirty after only generated or already-preserved duplicate changes were cleaned. The operating-system branch uses a clean worktree from `origin/main`.

## Now

### N1. Auth/access correctness and one-session sign-in

- **Owner:** App and shared platform
- **Status:** Implemented in source; live end-to-end proof incomplete
- **Acceptance criteria:** A new and returning user completes one Clerk sign-in; the server exchanges the verified identity for one opaque Secure HttpOnly session; refresh restores access; sign-out revokes the current session; all-device sign-out revokes all sessions; tenant identity conflict and unavailable Postgres fail clearly; the extension receives capability state but never a token.
- **Dependencies:** Clerk configuration, Redis session store, Postgres identity binding, exact allowed origins, controlled-beta policy.
- **External blockers:** Authenticated test account and protected runtime evidence.
- **Security/release risks:** Legacy bearer migration, stale sessions, provider-subject collision, preview/production origin drift.

### N2. Persistent onboarding, profile, and resume data

- **Owner:** App and shared platform
- **Status:** Applicant-vault and lifecycle contracts exist; production runtime proof is unknown
- **Acceptance criteria:** User-confirmed facts and the reviewed master resume survive refresh and sign-out/sign-in, remain tenant-isolated, use optimistic concurrency and idempotency, export completely, delete completely, and never store prohibited secrets or unconfirmed consequential answers.
- **Dependencies:** N1; encrypted durable store; independently verified schema/RLS/runtime evidence; retention and recovery evidence.
- **External blockers:** Valid isolated database review and protected synthetic lifecycle drill.
- **Security/release risks:** Source/schema parity is not runtime authorization; do not migrate applicant data or enable Postgres from repository evidence alone.

### N3. Truth-safe resume generation and review

- **Owner:** App
- **Status:** Implemented draft/artifact safeguards; production provider and render evidence remain gated
- **Acceptance criteria:** Generation uses only versioned confirmed facts and the verified job snapshot; unsupported claims fail review; users can inspect and revise output; downloadable artifacts pass text, pagination, integrity, and isolated-render checks; failures never appear as ready.
- **Dependencies:** N2; provider budgets; document-render evidence.
- **External blockers:** Paid-provider and sandbox activation require explicit approval.
- **Security/release risks:** Fabricated facts, stale source versions, unsafe files, or render mismatch.

### N4. Greenhouse capture reliability release

- **Owner:** Chrome extension, app, and shared platform
- **Status:** Assembled on the consolidated release branch; not on `main`, not deployed, and not published
- **Acceptance criteria:** From a real supported Greenhouse listing, a signed-in user captures once; the exact job appears exactly once in My Jobs; it survives refresh and sign-out/sign-in; replay and concurrent delivery return the same record; unsupported, closed, unverifiable, auth, consent, storage, and network failures are visible and honest; the extension retires its transient copy only after durable acknowledgement; account export/deletion includes the record; the extension never submits.
- **Dependencies:** N1 and N2 runtime evidence; consolidated release PR review; public ATS source allowlist; compatible app deployment and controlled extension artifact.
- **External blockers:** Authenticated supervised Greenhouse fixture, explicit production deployment approval, and Chrome Web Store owner publication.
- **Security/release risks:** Published v1.3.2/main v1.5.0/candidate v1.6 fragmentation; 90-day captured-record retention; server/app/extension version skew; a local passing fixture is not employer-page proof.

### N5. My Jobs usability and failure recovery

- **Owner:** App
- **Status:** Partially implemented
- **Acceptance criteria:** Every durable job has one understandable state and next action; empty/loading/error/expired/closed/duplicate/outcome-unknown states are distinct; refresh never duplicates or silently discards a job; no pre-receipt state counts as Submitted or successful.
- **Dependencies:** N4 and canonical state mapping in `docs/SIMPLE_JOB_AGENT_UX.md`.
- **External blockers:** First-time-user supervised test.
- **Security/release risks:** Local browser state masking durable-store failures; misleading success language.

## Next

### Cross-site truth and navigation contract

- **Owner:** App, resume site, partner site, and extension listing
- **Acceptance criteria:** Pricing, beta access, ATS scope, retention, privacy, support, and final-submission language match the deployed product; all navigation reaches the canonical destination; a deterministic drift test covers maintained sources.
- **Dependencies:** Stable N1–N5 release contract.
- **External blockers:** Separate approval for any pricing or legal-policy change.

### Partner portal clarity and strict isolation — release candidate implemented

- **Owner:** Partner site and shared platform
- **Acceptance criteria:** The public landing offers explicit existing-user and affiliate-only paths. The authenticated role reuses a verified Clerk identity without granting Job Agent access, stores encrypted partner records separately, requires explicit consent and administrator approval, rejects self-referrals, and includes partner data in account export/deletion. Beta referrals never appear as earned commission.
- **Verified candidate evidence:** Focused partner account, API, surface, login-return, account-lifecycle, and security tests pass locally. Rendered onboarding passes at 390px iPhone and 412px Android widths with 44px hit targets and no horizontal overflow. The old browser-local referral-code generator was removed; prospect drafts remain local and non-authoritative.
- **External blockers:** Production Clerk/session behavior, Redis/encryption configuration, cross-site mobile behavior, and administrator review must be verified on the exact deployed candidate. Payout, commission, pricing, and public publication remain unimplemented and unauthorized.

### Operational release evidence

- **Owner:** Shared platform
- **Acceptance criteria:** Protected readiness, worker heartbeat, encrypted-store lifecycle, backup/restore, audit, capacity, rollback, and live asset/source parity evidence is current, content-free, retained, and bound to the exact release.
- **Dependencies:** Approved environment and test budget.
- **External blockers:** Production credentials and operator authorization.

## Later

- Additional ATS capture only after Greenhouse meets the N4 acceptance criteria in production.
- Optional notifications after persistence, suppression, provider delivery evidence, and user opt-in are proven.
- Employer-browser assistance only through its separately approved no-submit gate.
- Mobile and ChatGPT integrations only after the canonical identity/profile/My Jobs contracts are stable.
- Growth surfaces, campaigns, and partner automation only after product truth and attribution are durable.

## Explicit non-goals

- Autonomous job search or applying beyond the controlled direct-employer discovery contract.
- Auto-submit, employer-account automation, credential handling, CAPTCHA/OTP handling, or outcome invention.
- Broad multi-ATS claims or permissions before one Greenhouse flow is proven.
- Production database activation, applicant migration, billing, price changes, paid providers, emails, campaigns, waitlists, partner payouts, or external automations without explicit approval.
- New abstractions, frameworks, or duplicate ledgers when an existing contract can be reused.

## Progress log — append only

### 2026-09-10 — Ecosystem reset and operating-system baseline

- Inspected four Git markers: the authoritative `1ststep-resume` repository, an unrelated commission prototype, a broader corporate-site repository, and an uninitialized release staging repository. The four requested product surfaces resolve to the authoritative repository.
- Inspected all 44 registered worktrees. Preserved unique and blocked work; cleaned four worktrees only where generated output or exact merged duplicates were proven.
- Verified source branch, remotes, manifests, PR #72, deployment projects/aliases, live HTTP state, public pricing, auth boundaries, schema/RLS source, extension capture flow, and available test commands.
- Established these operating documents on a clean branch from current `origin/main`.
- Added `scripts/operating-system-contract-test.mjs` to the standard smoke command so future changes cannot silently remove the required operating files or core approval/receipt rules.
- Baseline checks passed: smoke, public build, and extension release suite with 17 browser tests.
- Independently checked PR #72 at `5c30d77`: its extension release suite passed 23 browser tests plus captured-job persistence, replay, tenant-isolation, public-source verification, closed/fail-closed behavior, and promotion tests; smoke and build also passed.
- Remaining risk: protected production runtime health and authenticated end-to-end behavior are still unknown.
- Recorded the complete repository, branch, worktree, PR, environment-file, deployment, and dirty-change audit in `docs/REPOSITORY_RECONCILIATION.md`.
- Preserved the unique comprehensive UX audit as local commit `acad40b` and the tested agency-site work as local commit `a0e7f10`; neither was pushed.

### 2026-09-10 — Preview Clerk configuration recheck

- Verified all four Clerk variable names are scoped to PR #80 and reset the non-secret enable flag to exact lowercase `true`.
- Rebuilt exact-source Preview `dpl_5knK1Mh6MD2FP9WEndz6rZbhBfva`; Clerk remains disabled while restore access is available, isolating the remaining blocker to an opaque Clerk value.
- Kept Production on the exact clean `origin/main` tree and removed the temporary EasyFunnel widget completely.
- Next: re-enter the matching Clerk development publishable key, secret key, and complete PEM JWT public key, then re-run the content-free gate before OTP.

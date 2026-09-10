# P0 trust remediation — Preview reproduction and root-cause map

Date: 2026-09-10  
Source baseline: `origin/main` at `3605510`  
Preview inspected: `dpl_HrCFJ27bbrWzwZ8cZvCDhNBFyBjE` (`https://1ststep-resume-ni2fk12ea-1ststep.vercel.app`)  
Production: not changed

The Preview was the newest Ready deployment at the start of this audit. Vercel did not expose a Git commit for this prebuilt deployment, so its exact source parity with `origin/main` is unknown. Reproduction evidence and source evidence are kept separate below.

## Journey map

1. `/app` loads the signed-out Job Agent shell.
2. `Start my Job Agent` opens the seven-step setup without authenticating or checking pilot eligibility.
3. Quick Resume stores confirmed facts and the resulting résumé in tab-scoped storage.
4. Job path, work setting, job type, salary, and the optional free-text requirement are collected in the setup overlay.
5. The final setup button calls the access flow only after all seven steps.
6. Clerk OAuth, when configured, exchanges the Clerk token for the app's HttpOnly session at `/api/user-session?action=clerk-exchange`.
7. `/api/session-capabilities` checks both entitlement and the controlled-beta tenant allowlist.
8. Approved signed sessions hydrate encrypted `/api/concierge-state`; discovery then uses `/api/concierge-discovery` and durable Job Agent runs.

## Findings

### P0 — Beta eligibility appears after onboarding; duplicate authentication is possible

- Preview reproduction: confirmed that a signed-out user can complete all seven setup steps before seeing the sign-in/access overlay.
- OAuth/email-code duplication: not live-reproducible on this Preview because Clerk is not configured. Source confirms the path is possible for an authenticated but uninvited user.
- Root cause:
  - `openGuidedLaunch()` has no authentication, pilot-access, or consent gate.
  - Clerk exchange creates an app session and redirects to `/app`; pilot eligibility is checked later by `/api/session-capabilities`.
  - `openAgentAccess()` redirects to Clerk only when there is no app session. An authenticated user without Job Agent access falls through to the legacy email-code form, creating the second-authentication experience.
  - `login.js` always redirects to `/app` and does not preserve the intended internal route.
- Affected files/services: `concierge.js`, `concierge.html`, `login.js`, `api/user-session.js`, `api/session-capabilities.js`, Clerk, subscription/session exchange.
- Proposed fix: require one Clerk/app session and pilot decision before setup; show a dedicated calm waitlist state for denied users; never offer email-code restore to an already authenticated Clerk/app session; preserve a validated same-origin `returnTo` through Clerk redirects.

### P0 — Setup answers disappear on reload while the résumé survives

- Preview reproduction: confirmed. After saving goal, résumé, path, work setting, job type, salary, and exclusion, reload returned setup to step 1 with no goal selected; the résumé was still available.
- Root cause:
  - `concierge.js` removes `MISSION_KEY` from both `localStorage` and `sessionStorage` during startup.
  - `saveAll()` removes the mission again for non-authoritative sessions.
  - The résumé uses a separate tab-scoped key, so it survives a normal reload.
  - Durable `/api/concierge-state` writes require an approved opaque session and data-consent policy, but setup currently occurs before both gates.
- Affected files/services: `concierge.js`, `api/concierge-state.js`, encrypted tenant campaign store, applicant-vault hydration.
- Proposed fix: gate setup behind authentication, beta eligibility, and the existing data-consent flow; use encrypted `workspace.onboardingDraft` as the sole durable setup source; save after each change; expose saving/saved/error state; do not add a second clear-text durable browser copy.

### P0 — Confirmed résumé facts can be dropped by AI polishing

- Preview reproduction: blocked because hosted AI is paused until the Preview spending limit is configured. The deterministic draft correctly included `Bachelor's degree`, `Project coordination`, and `Data & reporting`.
- Root cause confirmed in source: `generateMasterResume()` replaces the deterministic draft with the model response after only generic non-empty/secret validation. Neither the client nor `/api/ai` verifies that confirmed facts remain present.
- Affected files/services: `client/concierge-domain.js`, `concierge.js`, `api/ai.js`, résumé review UI.
- Proposed fix: keep the structured deterministic draft authoritative, reconcile model output against every confirmed résumé fact, restore any omission deterministically, and show an included/restored fact review before Save.

### P0 — Hard exclusion missing from review and downstream mission

- Preview reproduction: confirmed. `Exclude defense contractors` remained in the step-6 field after Back navigation but did not appear in final review.
- Root cause:
  - The free-text field is not part of `guidedSelection` or `onboardingDraft`.
  - Final review renders only goal, résumé, path, work, job type, and salary.
  - `parseMission()` recognizes exclusions only when followed by `roles`, `jobs`, or `positions`, so `Exclude defense contractors` is not captured.
  - Live comparison omits exclusions from its request; ranking checks profile employer exclusions but not mission-wide exclusions.
- Affected files/services: `concierge.html`, `concierge.js`, `client/concierge-router.js`, `client/job-mission-relevance.js`, `client/job-intelligence.js`, `lib/public-ats-discovery.js`, durable run mission validation.
- Proposed fix: persist an explicit exclusions array, render it under `Never include`, normalize common `exclude/avoid/skip` prefixes, and use one shared hard-exclusion matcher before discovery results, path ranking, recommendations, and durable automation.

### P1 — Live comparison has no useful progress or retry contract

- Preview reproduction: confirmed. The only in-progress state was a disabled `Comparing…` button for about 30 seconds; the operation then returned 9,682 scanned postings from 37 feeds with a partial-results message.
- Root cause: `scanOpportunityPaths()` performs one request with a 40-second client deadline and exposes no phase, elapsed time, expected duration, correlation ID, timeout-specific state, or preserved-result retry state.
- Affected files/services: `concierge.html`, `concierge.js`, `/api/concierge-discovery`.
- Proposed fix: add a status region with phase, expected duration, elapsed time, explicit timeout/partial states, Retry, a client correlation ID, and retention of the last complete/partial recommendations during retry.

### P1 — Sector exploration silently selects a role

- Preview reproduction: confirmed. Selecting `Technology & Product` immediately selected `Software Engineering & IT`.
- Root cause: the sector change handler assigns the first path in the sector when the prior path is incompatible; the renderer also auto-selects the first profile-signaled option when no path exists.
- Affected files: `concierge.js`, path-step UI and tests.
- Proposed fix: sector changes filter only. If a saved role becomes incompatible, present explicit retain/clear/replace choices; never change the confirmed role from exploration alone.

### P1/P2 — Mobile interaction and copy inconsistencies

- Preview reproduction: confirmed mixed behavior: goal, saved résumé, path, job type, and salary auto-advance, while hybrid work requires a separate Continue after location. Final viewport QA remains required.
- Source confirms the generic empty-state template produces `No matches jobs yet` and `No interviews jobs yet`.
- Affected files: `concierge.html`, `concierge.js`, `persistent-concierge.css`, mobile browser tests.
- Proposed fix: use Continue consistently for consequential selections; separate focused/selected/saving/saved states; keep the footer action sticky/reachable; add a scroll cue to status tabs; simplify mobile nav grouping without changing the brand; group theme with account/settings; correct the exact empty-state copy.

## Implementation boundary

No schema migration is proposed. Reuse the existing encrypted `workspace.onboardingDraft`, opaque session, consent gate, and mission `exclusions` field. Production deployment, beta expansion, and production data changes remain out of scope.

## Implementation and release report

### Changed behavior

- Setup now waits for session-capability hydration, controlled-beta eligibility, and the existing authorization/consent decision. Signed-in waitlisted users see the access state immediately and the legacy email/code form is not exposed.
- Clerk sign-in, sign-up, email/password, magic-link, and OAuth callbacks share the same app-session exchange and preserve a validated same-origin `returnTo`. Expired exchange tokens fail closed without writing a session marker.
- Every guided answer, location edit, and hard exclusion updates the encrypted account `workspace.onboardingDraft`; the UI shows Checking, Saving, Saved, conflict, or failure truthfully.
- AI-polished résumé text is checked against each deterministic confirmed-fact line. Any omission restores the deterministic draft, exposes the omitted facts, and blocks Save until confirmed facts are present.
- Hard exclusions are normalized once, displayed under `Never include`, persisted in the mission, and enforced by direct-feed filtering, relevance restoration, fit/ranking, scheduling, and durable runs.
- Live comparison now shows phase, expected duration, elapsed time, the 40-second timeout, partial-result fallback, Retry, preserved prior recommendations, and a support correlation ID. The API echoes and content-freely logs that ID for partial/failure outcomes.
- Sector changes only filter exploration. An incompatible saved role remains unchanged until the user explicitly keeps it, clears it, or selects a replacement.
- Consequential setup choices use Continue consistently. Mobile adds distinct focus/save states, a reachable fixed final action, a status-tab scroll cue, a four-item bottom navigation with secondary actions/theme grouped under More, and corrected empty-state copy.

### Changed files and migrations

- Access/session and onboarding: `login.js`, `concierge.js`, `concierge.html`, `persistent-concierge.css`.
- Résumé truth reconciliation: `client/concierge-domain.js`, `concierge.js`.
- Exclusion enforcement: `client/job-mission-relevance.js`, `client/job-intelligence.js`, `lib/public-ats-discovery.js`, `concierge.js`.
- Comparison observability: `api/concierge-discovery.js`, `concierge.js`, `concierge.html`.
- Tests: `scripts/clerk-login-client-test.mjs`, `scripts/concierge-domain-test.mjs`, `scripts/job-intelligence-test.mjs`, `scripts/public-ats-discovery-test.mjs`, `scripts/concierge-test.mjs`, `scripts/concierge-vault-browser.spec.mjs`, and `scripts/trust-remediation-browser.spec.mjs`.
- Test command: `package.json` adds `npm run test:trust-remediation`.
- Data migrations: none. Existing encrypted account state and mission fields are reused.

### Test evidence

- `npm run test:trust-remediation`: passed. Five browser journeys cover approved persistence through reloads, denied/waitlisted access, 390×844 mobile behavior, intentional sector choice plus partial comparison recovery, and fail-closed résumé fact preservation. Unit/integration fixtures cover unified callback/expiry handling, pilot admission/denial, confirmed-fact reconciliation, and defense-contractor exclusion in both fit and direct-feed filtering.
- `npm run test:concierge`: passed, including the full Job Agent security, tenant isolation, consent, schedule, notification, durable-run, discovery, and API regression chain.
- `npx playwright test scripts/concierge-vault-browser.spec.mjs --workers=1`: 41/41 passed. This broader regression run also caught and fixed a resume-handler ordering defect that could skip the durable run PATCH after an optimistic status change.
- `npm run smoke`: passed with zero failures; six pre-existing allowlisted inline-handler warnings were reported.
- `npm run build`: passed; 82 intentional public assets were prepared.
- Desktop and 390×844 screenshots were visually inspected. Final review shows every hard filter, save status is visible, the mobile final action is initially reachable, and My Jobs exposes its horizontal-scroll cue.

### Remaining limitations and release recommendation

- The inspected Preview has Clerk disabled, and Vercel did not expose its source commit. Therefore a real provider-backed email/password, magic-link, and OAuth round trip, real session-expiry recovery, and post-change Preview verification are not yet available as release evidence. Automated tests exercise the shared callback/session contract and mocked account persistence, but do not replace those provider journeys.
- No remediation build was deployed to Preview or Production in this task. Production and beta admission were not changed.

**Recommendation: not beta-ready yet.** The code-level P0 acceptance tests pass, but beta expansion should remain blocked until this branch is deployed to a source-identified Preview with Clerk and the encrypted account services configured, then the signed-out, email/password, magic-link, OAuth, returning-user, and real session-expiry journeys pass there without a second authentication prompt or lost state.

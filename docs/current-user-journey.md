# Current user journey

Audit snapshot: 2026-09-08. Counts are observed or source-derived estimates; unavailable production telemetry is marked unknown.

| Step | Screen/route | User goal and required action | Data/API effect | Friction/risk | Classification |
| --- | --- | --- | --- | --- | --- |
| 1 | `/` | Understand product; choose Job Agent or Resume Builder | Public page only | Two product starting points still split the mental model | SIMPLIFY |
| 2 | `/app` | Start Job Agent | Anonymous `GET /api/session-capabilities` returns 401 as expected | Expected anonymous denial appears as a console error; no visible failure | KEEP, fix noise |
| 3 | Guided setup 1/7 | Choose search goal | Tab-local draft | One tap, auto-advances | KEEP |
| 4 | Guided setup 2/7 | Upload/cloud-pick a resume or build quick resume | Parser; unsigned answers remain in this tab | Resume is mandatory before value; quick builder still requires four essential typed answers | SIMPLIFY/PREFILL |
| 5 | Guided setup 3/7 | Choose career path | May scan public ATS paths | Recommendation quality depends on confirmed profile | KEEP |
| 6 | Guided setup 4/7 | Choose remote/hybrid/on-site; type location if needed | Search mission | Location typing only when necessary | KEEP |
| 7 | Guided setup 5/7 | Choose employment type | Search mission | Single choice excludes multi-mode preferences | SIMPLIFY |
| 8 | Guided setup 6/7 | Choose salary floor; optional exclusions | Search policy | Presets omit many real policies (travel, sponsorship, relocation) | EXPAND CONTEXTUALLY |
| 9 | Guided setup 7/7 | Review, choose daily search/email alerts, start | Consent/schedule/run APIs after sign-in | Start is blocked until resume and access are valid | KEEP |
| 10 | Sign-in/access | Receive and enter OTP | Clerk/session exchange; opaque cookie | Necessary human gate; should happen only when persistence/background work is requested | REQUIRES HUMAN |
| 11 | My Jobs | Review verified matches and package status | Durable runs/packages/sessions | Seven tabs plus Activity/mission details expose operational states | SIMPLIFY |
| 12 | Needs You | Resolve one missing fact, review draft, sign in, CAPTCHA, or approval | Vault/session update | Best current surface: one focused action, but action types are mixed | KEEP/REFINE |
| 13 | Package review | Review resume/cover letter and proposed answers | Immutable revision; render checks | User must inspect truth and presentation | REQUIRES HUMAN |
| 14 | Employer execution | Open secure employer page; extension fills supported Greenhouse fields after approval | Single-use handoff and transient artifact | Only Greenhouse standard forms; extension availability is desktop-only | KEEP AS FALLBACK/EXECUTOR |
| 15 | Submission | Review employer form and click submit | Employer-side action | Entirely manual today; source contains future gated submission machinery that is not production-ready | REQUIRES HUMAN TODAY |
| 16 | Receipt/tracking | Employer receipt is independently verified; record interview/rejection/follow-up | Receipt/session/tracker stores | Automated receipt coverage is incomplete/unknown | AUTOMATE WHERE AUTHORITATIVE |

## First-time mobile observation

At 390x844, `/app` presented a clear primary action and the 1-of-7 wizard remained usable. Selecting the goal advanced in one tap. The resume step offered phone/cloud file selection or a quick builder. The quick builder immediately required a typed name/email answer and stated that unsigned answers remain only in the tab.

## Returning and partially configured users

- Signed users can restore latest encrypted account state and should supersede stale browser workflow data.
- A stale or non-invited user keeps export/deletion/sign-out controls but cannot run the controlled beta.
- Missing vault consent, policy configuration, resume, permissions, or exact job evidence creates a focused blocker rather than silent automation.
- Exact behavior for a real returning production account was not exercised because no user credentials or personal data were authorized for this audit.

## Time-to-value

| Metric | Current evidence | Target |
| --- | --- | --- |
| Time to first good job | Unknown. UI claims setup is about two minutes; no signed-user production timing telemetry was available. | Under 3 minutes after resume import; under 60 seconds for a returning profile |
| Clicks to first good job | Estimated 8-12 plus resume selection/sign-in; exact count varies by path. | 5-7 taps for returning user; 7-10 for first-time user |
| Input fields to first good job | Resume upload path: 0-2 typed fields plus OTP; quick-resume path: at least 4 essential typed answers plus preferences. | Resume upload plus only unresolved hard filters |
| Time to first application ready | Unknown; local copy says 20-45 seconds for generation, but render/provider/queue latency was not measured live. | Under 5 minutes from selected job |
| Time to first submitted | User-dependent and unknown; final employer submission is manual. | One review session after package readiness for supported ATS |
| Manual actions per application | Estimated 6-12 on supported Greenhouse; materially higher on unsupported/sign-in/CAPTCHA flows. | 2: review package, approve/submit; exceptional questions only |

## Highest-abandonment points

1. Resume/profile requirement before first real match.
2. OTP and invite-paced beta gate after setup investment.
3. Switching between Job Agent, legacy Resume Workspace, extension, and employer tab.
4. Legacy `/app/resume` choice modal plus seven desktop navigation destinations and a nine-item application checklist.
5. Unsupported ATS or ambiguous form fields that return work to the user.

## Trust observations

- Strong: receipt-only Submitted semantics, no-auto-submit copy, confirmed-facts messaging, and explicit security boundaries.
- Weak: legacy workspace says data is parsed in-browser while also offering AI/server features; the distinction requires careful explanation.
- Weak: the Web Store listing describes 1.3.2 Greenhouse-only behavior while source 1.4.0 adds broad user-triggered capture.
- Weak: the expected anonymous session-capability denial appears as a console error on `/app`. An initial favicon 404 disappeared after a later production deployment during the audit.

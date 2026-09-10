# Master product audit

Audit date: 2026-09-08. Current source baseline: `main` at `cb8da3c`. Live deployment and source were evaluated separately. No production state, user data, environment variables, employer pages, applications, or submissions were changed.

## Executive verdict

1stStep today is a supervised Job Agent and resume/application workspace with unusually strong safety contracts. It can discover verified public ATS roles, filter and prepare truthful packages, maintain durable tenant-scoped workflow state, and support controlled Greenhouse filling. It does not currently perform reliable autonomous cross-ATS application execution or final submission.

The right evolution is not a rewrite. Preserve the durable safety/domain modules, make the applicant Career Profile and Application record the canonical product model, absorb legacy resume capabilities behind the Job Agent, and add adapters one at a time behind production evidence gates.

## Evidence summary

- Live `/`, `/app`, and `/app/resume` were exercised at desktop and 390px mobile.
- Public `/api/health/live` and `/api/health/ready` returned 200 healthy. Protected dependency/worker/deep readiness returned 403 and is unknown.
- Current `main` extension release suite passed: 11 browser tests plus security/handoff contracts.
- Build, smoke, and application-candidate tests passed on the clean snapshot used to begin the audit.
- The broader 41-test Job Agent browser suite did not complete: its static server repeatedly occupied port 4175 and the test process stalled even on a unique port. Its test names are useful inventory, not passing evidence.
- Chrome Web Store showed version 1.3.2; source is version 1.4.0.
- Live asset parity differed from the earlier clean snapshot while production deployments changed during the audit. Claims below name whether they come from live UI, current `main`, tests, or retained evidence.

## Code evidence index

- Production-safe no-execution boundary: `docs/JOB_AGENT_RUNTIME.md:9`; run states: `docs/JOB_AGENT_RUNTIME.md:17`; package authority: `docs/JOB_AGENT_RUNTIME.md:75`.
- Receipt-only Submitted transition: `lib/application-session-domain.js:624-661`.
- Capability-scoped controls: `lib/job-agent-capabilities.js:24-78`.
- Supported public discovery providers: `lib/public-ats-discovery.js:5`.
- Extension 1.4.0, `activeTab`, and Greenhouse host scope: `1ststep-extension/manifest.json:4-40`.
- Browser-state split: `concierge.js:61-73` and `app.js:6505-6554`.
- Canonical applicant fact table: `supabase/migrations/20260901195545_job_agent_canonical_baseline.sql:39-52`.
- Twice-daily worker wakeup: `vercel.json:19-20`; route split: `vercel.json:127-155`.
- Legacy navigation overlap: `app.html:144-152,247`; Job Agent primary navigation and seven-step setup: `concierge.html:19,33-41`.

## Product simplification table

| Feature | Route | Current purpose | Usage evidence | Core value | Reusable logic | Friction | Decision | Target | Dependency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Job Agent setup | `/app` | Define search mission | Live/source | High | mission/policy parsers | Resume before results; invite gate | SIMPLIFY | Home onboarding | Career Profile readiness |
| My Jobs | `/app` | Review pipeline | Live/source | High | canonical subscriber model | Too many operational tabs | KEEP/SIMPLIFY | My Jobs | unified application model |
| Needs You | `/app` | Resolve exceptions | Live/tests | Very high | typed human actions | Mixed action types | KEEP | Home + inbox | priority/impact model |
| Saved Info | `/app` | Vault facts and controls | Live/tests | Very high | vault/version/provenance | Optional cloud state creates split model | KEEP | Career Profile | migration and consent |
| Agent Status | `/app` | Run/worker status | Live/source | High | leases/heartbeat | Internal language leaks | SIMPLIFY | Home | observability read model |
| Resume tailor | `/app/resume` | Job-specific document | Live/source | High | parser, source maps, generation, render | Manual upload/paste/generate | ABSORB INTO AGENT | Job/package action | canonical profile |
| Career Positioning | `/app/resume` | Find narrative angle | Live/source | Medium-high | analysis prompt/output | Separate manual step | EXTRACT SERVICE | package strategy | provenance model |
| Cover letters | `/app/resume` | Generate letter | Live/source | Medium | package worker/artifacts | Separate toggle/quota language | CONTEXTUALIZE | application package | package policy |
| Job Search | `/app/resume` | Search listings | Live/source | High logic, low UI value | jobs API, filters | Duplicates Job Agent discovery | ABSORB INTO AGENT | My Jobs | shared ingestion |
| Job Tracker/Tracker/Applied | `/app/resume` | Track jobs | Live/source | High | tracker normalization/import | Duplicate names/stores/statuses | MERGE | My Jobs | migration/receipt reconciliation |
| LinkedIn optimizer | `/app/resume` | Improve profile copy | Live/source | Medium | prompt/template | Disconnected destination | KEEP OPTIONAL | Saved Info/contextual tool | Career Profile |
| Interview Prep | both | Practice interviews | Live/source | Medium-high | interview-practice module | Duplicated entry | CONTEXTUALIZE | submitted/interview job | unified application |
| Bulk Apply | `/app/resume` | Batch application concept | Live/source | Low in current form | limited selection UI | Encourages volume; unsupported execution | DEPRECATE NAME/UI | policy-bound batch review | adapter coverage |
| Backup | `/app/resume` | Export browser state | Live/source | Migration value | JSON export/import | Signals browser-only architecture | KEEP TEMPORARILY | Account data export | migration completion |
| Extension capture | browser | Bring user-found job in | source/tests | High | activeTab extractor, ack protocol | Store version drift; review hop | KEEP | Capture entry to My Jobs | v1.4 release |
| Greenhouse fill | browser | Fill approved fields | source/tests/store | High | adapter and handoff | Desktop-only, one ATS | KEEP AS EXECUTOR | adapter execution | production release proof |

Usage telemetry was disabled in public app configuration, so per-feature adoption is unknown unless directly represented by live/source/test evidence.

## Manual work table

| Manual action | Why today | Already known? | AI? | Deterministic code? | Risk | Change | Future state | Human involvement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Upload/rebuild resume | no universal canonical profile | Often | parse/extract | validate/import | Medium | Career Profile migration | once, then updates | Verify facts |
| Choose job path | preferences missing | Sometimes | recommend | filter choices | Low | progressive profile | confirm recommendation | One tap |
| Enter work/salary rules | policy missing | Often reusable | no need | yes | Medium | policy store | ask once | Confirm/change |
| Search job boards | fragmented discovery | No | limited ranking | yes | Low | shared ingestion | background | None |
| Remove duplicates/stale roles | split ledgers | Yes server-side | no | yes | High if wrong | canonical identity | automatic | Review ambiguity |
| Paste job description | systems disconnected | Usually public | no | capture/API | Low | ingestion/capture | automatic | None |
| Select resume evidence | document-centric model | Mostly | yes | policy/source map | Medium | strategy service | automatic proposal | Review material change |
| Tailor resume/letter | manual tool model | Yes | yes | QA checks | High truth risk | package orchestration | automatic draft | Review |
| Re-answer standard questions | no canonical semantic memory | Often | classify | exact/canonical lookup | High | scoped answer model | reuse when safe | Confirm consequential |
| Open extension | execution is separate | No | no | yes | Low | task dispatch | contextual prompt | One click/fallback |
| Fill employer fields | limited adapters | Often | mapping assist | adapter | High | adapter SDK | automatic where proven | Exceptions only |
| Solve sign-in/OTP/CAPTCHA | employer security | No | Never | Never | Critical | checkpoint/resume | paused handoff | Always human |
| Review form | representation risk | Partly | assist | validators | High | diff and scope summary | concise review | Required |
| Submit | no production authorization/coverage | N/A | Never blindly | adapter with gate | Critical | final-action contract | approved action | Required today |
| Mark applied | no receipt integration everywhere | Employer knows | no | receipt ingestion | High | connectors/email evidence | automatic when verified | Reconcile unknown |
| Track follow-up/outcome | incomplete evidence | Sometimes | summarize | schedule/webhook | Medium | unified app record | automatic reminders | Confirm private outcomes |

## Forty required answers

1. **What is 1stStep today?** A supervised discovery, resume, package, and application-control product with partial durable automation.
2. **What should it become?** A policy-bound AI Job Agent centered on a canonical Career Profile and Application record.
3. **Current user work removable?** Estimated 60-75% of repetitive work at maturity; this is a workflow estimate, not telemetry.
4. **Automatable today?** Roughly 35-45% end-to-end for supported discovery/preparation paths; final employer execution remains largely human.
5. **Information needed?** Verified career facts, authorization/sponsorship, salary policy, location/relocation/travel, exclusions, career tracks, reusable answers, and action permissions.
6. **Disappear from primary navigation?** Bulk Apply, standalone Job Search, duplicate Tracker/Applied, Career Positioning, LinkedIn optimizer, Backup.
7. **Advanced tooling?** Resume editor/history, positioning detail, LinkedIn optimization, exports, audit/history.
8. **Legacy capabilities becoming services?** Parsing, profile extraction, evidence selection, positioning, tailoring, ATS checks, rendering, cover letter, tracker import, interview prep.
9. **Does `/app/resume` remain?** Temporarily as an advanced/manual workspace; not as a co-equal primary product long term.
10. **Bulk Apply?** Retire the name and volume-first UI; replace with policy-bound batch review of individually qualified jobs.
11. **Job Search?** Merge into continuous discovery and My Jobs.
12. **Tracker?** Make the durable Application record the single tracker; import legacy labels as unverified history.
13. **Career Positioning?** Run automatically as application strategy; expose rationale/details on demand.
14. **Interview Prep?** Contextual action after submission/interview, using exact role/package history.
15. **LinkedIn optimization?** Optional Career Profile output, not top-level navigation.
16. **Long-term extension role?** Hybrid: user-triggered capture plus local execution fallback where browser context is required.
17. **Can extension reliably execute?** Only narrowly today: controlled standard Greenhouse fill, no submit.
18. **Autonomous platforms viable now?** None for full autonomous submit in production. Greenhouse is viable for supervised fill.
19. **Manual intervention platforms?** Lever, Ashby, SmartRecruiters, iCIMS, Workday, LinkedIn, Indeed, generic forms; also any sign-in/OTP/CAPTCHA/unknown field.
20. **Architecture changes for execution?** Common adapter contract, preserved checkpoints, server-owned policy/knowledge, single-use approvals, outcome reconciliation, independent receipts, and production provider evidence.
21. **Browser-only today?** Much of legacy profile, resume, tailoring history, tracker, usage/preferences, referral data, and transient unsigned setup.
22. **Must become cross-device?** Verified facts, policies, permissions, resume/profile versions, applications, packages, human actions, receipts, schedules, and outcomes.
23. **Canonical applicant facts?** Versioned tenant-scoped Career Profile/ApplicantKnowledge store with provenance; not localStorage or generated prose.
24. **Remember answers?** Canonical question ID plus normalized meaning, scoped answer version, provenance, expiry, sensitivity, safe-reuse flag, and explicit user confirmation.
25. **Confidence?** Deterministic evidence coverage, fact verification, adapter reliability, past corrections, validation results, and unresolved uncertainty; never an ungrounded LLM number.
26. **Readiness calculation?** Capability prerequisites and weighted job coverage, with hard blockers; display reasons before any aggregate.
27. **Unlock Full Autopilot?** Verified profile/policy/answers, versioned permission, supported adapter, reliable checkpoint/recovery, independent receipt, monitoring, and acceptable failure history.
28. **User still does at Full Autopilot?** Verify material facts, handle security/identity/attestations, review exceptions, interview, evaluate offers, revoke/change policy.
29. **Never automate?** Fabricating facts, bypassing CAPTCHA/security, signing attestations without informed action, using protected traits to rank, blind retry after ambiguous submit, or claiming Submitted without receipt.
30. **Current actions/application?** Estimated 6-12 on supported Greenhouse; more elsewhere; production telemetry unknown.
31. **Target?** Two routine actions: review package and approve final action; zero until exception for explicitly pre-authorized low-risk future cases.
32. **Fastest first useful job?** Parse resume, show deterministic path suggestions, ask only one blocking hard filter, then scan shared verified feeds.
33. **Fastest first submission?** Select verified job, auto-prepare, concise truth review, supported adapter fill, action-time approval, receipt verification.
34. **Future home?** One next action, qualified matches, preparation status, verified outcomes, agent status, and readiness blockers.
35. **Not in native mobile?** Full ATS form renderer, browser extension controls, dense resume layout editor, admin/queue internals.
36. **Mobile controls remotely?** Policies, pause/resume, package review, answers, permissions, alerts, job decisions, outcomes.
37. **Implement first?** Canonical read model/migration and capability readiness around existing server contracts.
38. **Stop developing now?** New top-level tools, vanity scores, broad ATS claims, duplicate stores/trackers, and production submission without evidence.
39. **High-value code?** Tenant stores, vault, identity/idempotency, policy bundle, public ATS discovery, package QA/render, application session domain, receipts, extension handoff, and subscriber UI model.
40. **Most complexity?** `app.js`/`concierge.js` monoliths, parallel legacy/Job Agent stores, duplicate navigation/state vocabularies, and code for disabled future providers mixed with current UX.

## Final verdict scorecard

| Dimension | Verdict |
| --- | --- |
| Current product health | **6/10** — valuable supervised product, active release churn, incomplete consolidated proof |
| Job Agent readiness | **6/10** — strong domain/control plane; fragmented product model |
| Automation readiness | **4/10** — discovery/preparation credible; execution/receipt coverage narrow |
| Chrome extension viability | **6/10** — good hybrid foundation; store/source drift and one execution adapter |
| Legacy resume viability | **5/10 as UI; 9/10 as service inventory** |
| Mobile readiness | **6/10 control plane; 1/10 execution plane** |
| Architectural risk | **High** until source-of-truth migration and queue/runtime proof |
| User friction | **Medium-high**, concentrated at setup, product switching, and employer execution |

## Top priorities

### Top 10 product changes

1. One Home with one next action.
2. Career Profile instead of repeated document setup.
3. My Jobs as the only tracker/search destination.
4. Capability-based readiness with exact blockers.
5. Progressive questions tied to real job coverage.
6. Contextual resume/positioning/interview tools.
7. Policy-bound batch review instead of Bulk Apply.
8. Clear extension connected/version/support status.
9. Mobile-first approvals and exception handling.
10. Outcome/time-saved reporting backed by receipts.

### Top 10 architectural changes

1. Complete canonical Postgres/Redis ownership decision.
2. Migrate legacy browser state with reconciliation.
3. Create ApplicantKnowledge and CareerProfile projections.
4. Unify application state and human actions.
5. Extract client monoliths into bounded modules.
6. Build shared public-feed ingestion and fair queue draining.
7. Formalize the adapter SDK and conformance tests.
8. Add capability/readiness read models.
9. Add independent receipt connectors and outcome reconciliation.
10. Bind every release to source, migration, runtime, and rollback evidence.

### Top 10 automation opportunities

1. Shared ATS polling.
2. Job normalization/deduplication.
3. Hard-policy rejection.
4. Relevant fact retrieval.
5. Resume strategy and evidence selection.
6. Draft package generation and QA.
7. Safe answer reuse.
8. Supported ATS fill.
9. Receipt detection and follow-up scheduling.
10. Learning proposals from corrections/outcomes.

### Top 10 things to remove or hide

1. Bulk Apply label.
2. Duplicate Job Search.
3. Duplicate Tracker and Applied destinations.
4. Permanent Career Positioning navigation.
5. Permanent LinkedIn optimizer navigation.
6. Backup as a primary action after migration.
7. Internal queue/state codes.
8. Arbitrary match/readiness percentages.
9. Quota-centric progress language.
10. Disabled future-provider controls from subscriber UI.

### Top 10 extension improvements

1. Publish and verify source-aligned version 1.4.0.
2. Show connected/account/capture status consistently.
3. Keep activeTab user-triggered capture.
4. Add structured capture quality/evidence labels.
5. Preserve exact acknowledgement/retry semantics.
6. Keep all business policy server-owned.
7. Add Lever adapter only after conformance tests.
8. Add resumable checkpoints for navigation changes.
9. Make unsupported fields one-click Needs You handoffs.
10. Instrument content-free success/failure rates by adapter/version.

### Top 10 risks

1. Duplicate or ambiguous submissions.
2. Browser/server split-brain data.
3. Fabricated or unsupported candidate claims.
4. Source/live deployment drift.
5. Extension store/source drift.
6. Incomplete production RLS/recovery proof.
7. Non-continuous queue draining at scale.
8. Provider/AI cost multiplication.
9. Monolithic client regressions.
10. User confusion between prepared, filled, submitted, and receipt-verified.

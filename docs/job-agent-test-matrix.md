# Job Agent test matrix

## Personas and surfaces

| Scenario | Desktop | Tablet | Mobile | Extension | Expected result |
| --- | --- | --- | --- | --- | --- |
| Anonymous first use | Yes | Yes | Yes | N/A | useful preview, local-only label, no hidden writes |
| Signed returning user | Yes | Yes | Yes | connected | restore newest account state |
| Partially configured | Yes | Yes | Yes | optional | one highest-impact blocker |
| Low readiness | Yes | Yes | Yes | optional | exact capability gaps, no vanity score |
| High readiness | Yes | Yes | Yes | connected | qualified work proceeds until action gate |
| Extension disconnected/outdated | Yes | N/A | clear desktop continuation | Yes | preserve task and exact upgrade/connect action |
| Supported Greenhouse | Yes | N/A | monitor only | Yes | reviewed ordinary fill, never submit today |
| Unsupported ATS | Yes | Yes | Yes | capture only | manual continuation, no guess |

## Functional matrix

| Area | Unit | Integration | Browser/E2E | Failure injection | Production evidence |
| --- | --- | --- | --- | --- | --- |
| Identity/tenant | session/domain | API/store | sign-in/restore/revoke | expired/replayed/cross-tenant | signed synthetic lifecycle |
| Career Profile | versions/provenance | vault/Postgres | import/edit/revoke/export | conflict/storage loss | isolated RLS/restore |
| Job ingestion | adapters/normalization | shared feed/index | verified listing | 429/timeout/malformed/stale | freshness and quota metrics |
| Dedupe | identity keys | concurrent create | repeated capture/import | ambiguous identity | zero duplicate external actions |
| Policy | rule traces | decision/package | blocker explanations | missing/changed policy | shadow corpus review |
| Package | prompts/source map/QA | generation/render/storage | review/revise/download | provider timeout, bad file | isolated render/object lifecycle |
| Answer memory | classifier/scope/expiry | vault/session | save/reuse/revoke | contradiction/sensitive/OTP | correction rate sample |
| Application state | transition/idempotency | task/session/receipt | Needs You through receipt | crash/outcome unknown | signed audit chain |
| Extension | extractor/adapter | signed handoff | real unpacked controlled fixture | DOM drift/tab close/partial fill | version-matched controlled beta |
| Notifications | redaction/dedupe | outbox/provider | opt-in/opt-out | provider outage | content-free delivery metrics |
| Billing/cost | entitlement/spend | webhook/ledger | lifecycle UI | duplicate webhook/unknown provider call | approved quota and reconciliation |

## Release validation loop

For each wave: build, static checks, lint if configured, type/syntax checks, unit, integration, browser, extension where relevant, mobile viewport, console/network checks, migration/RLS checks, analytics schema checks, source/live parity, rollback rehearsal, and before/after human-action comparison.

## Audit-run results

| Check | Result |
| --- | --- |
| Build clean snapshot | Passed; 70 intentional public assets |
| Smoke | Passed with six allowlisted inline-handler warning classes |
| Application candidate suite | Passed |
| Current main extension release | Passed; 11 browser tests |
| Live `/app` mobile/desktop | Exercised; expected anonymous 401 appears in console; an initial favicon 404 was absent after a later deployment |
| Live `/app/resume` mobile/desktop | Exercised; no errors, Tailwind CDN/GHL style warnings |
| Full 41-test Job Agent browser suite | Did not complete; reproducible port/startup stall |
| Public liveness/readiness | 200 healthy/ready |
| Protected dependencies/workers/deep readiness | 403; unknown |
| Source/live asset parity | Failed for earlier clean snapshot during active deployment churn |

Do not mark a wave complete from compilation or test inventory alone.

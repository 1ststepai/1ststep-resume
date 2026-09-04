# Agent-first route and atomic Workday removal

Date: 2026-09-04

## Summary

- Finished the agent-first entry point. `/app` serves `concierge.html` (done in
  the prior change); homepage onboarding and Job Agent CTAs now point at
  `/concierge` directly. No second wizard was built.
- Removed the obsolete operational Workday path as one change: both source
  files, the public-build allowlist entry, the release-preflight required-file
  entry, its test fixture, and the active product claims that advertised it.
- Investigated `api/jobs.js` and the resume-capability boundary. Reported only;
  nothing deleted.

## Files changed

Agent-first route:
- `index.html`: onboarding + Job Agent CTAs -> `/concierge`; footer
  "Résumé Builder" -> `/app/resume`. Sign in / Restore access deliberately
  still target `/app`.
- `scripts/homepage-viewport-qa.mjs`: hero CTA assertion `/app` -> `/concierge`.
- `scripts/static-test-server.mjs`: `/app` -> `concierge.html`, plus
  `/app/resume` -> `app.html`, so browser fixtures resolve routes the way
  production does.

Workday removal:
- Deleted `workday.js` and `1ststep-extension/sites/workday.js`.
- `build-public-web.mjs`: dropped `workday.js` from the public asset allowlist.
- `lib/job-agent-release-preflight.js`: dropped it from required root files.
- `scripts/job-agent-release-preflight-test.mjs`: dropped it from the fixture
  and corrected `runtime.fileCount` from 19 to 18.
- `1ststep-extension/utils/filler.js`: comments only. `querySelectorDeep` is
  generic shadow-root traversal shared by supported Greenhouse forms, so the
  code stays; only the comments naming Workday as a target were rewritten.
- Claims corrected: `1ststep-architecture.html`, `extension-section.html`,
  `1ststep-extension/README.md`, `ASSET_SPECS.md`, `screenshot_3_ats_grid.html`.

Preserved deliberately, per the operator instruction:
- `client/concierge-domain.js` — historical closed-requisition evidence.
- `client/job-intelligence.js` — technology keyword extraction regex.
- `client/concierge-router.js` — job-term vocabulary and the employer search
  link builder.
- `lib/job-agent-learning-domain.js` — the `operator-review-required` entry,
  and `scripts/job-agent-continuous-improvement-test.mjs` which guards it.
- All `docs/`, `archive/`, and `HANDOFF.md` history.

## Validation

Focused tests for the files changed, all run individually:

| Command | Result |
| --- | --- |
| `node scripts/job-agent-release-preflight-test.mjs` | pass (after fileCount fix) |
| `node scripts/extension-security-test.mjs` | pass |
| `node scripts/controlled-extension-release-test.mjs` | pass |
| `node scripts/web-release-boundary-test.mjs` | pass |
| `node scripts/security-regression-test.mjs` | pass |
| `node scripts/job-agent-continuous-improvement-test.mjs` | pass |
| `npm run smoke` | pass, 0 failures, 6 pre-existing warnings |
| `npm run build:web` | pass, 55 assets (was 56) |
| `node scripts/vercel-output-boundary-test.mjs` | pass, 55 static / 41 API |

Not run: full `release:gate` and Playwright browser suites (live-network and
signing steps, outside this change).

## Investigation results, no action taken

### api/jobs.js — NOT removed

No Job Agent surface calls it. `concierge.js`, `client/`, and `api/` contain no
reference. Discovery runs through `/api/concierge-discovery`.

It is still live for the compatibility surface: `app.js:5310` fetches
`/api/jobs`, and `app.html` loads `app.js`. Deleting it would break job search
in the surface this change was told to preserve. Other dependents:
`scripts/security-regression-test.mjs` (asserts the route exists and is
hardened), `vercel.json` (function entry plus two rewrites),
`docs/JOB_AGENT_DATA_FLOW_DISCLOSURE.md` and
`docs/APPLICATION_CONCIERGE_SECURITY.md` (both describe it as a disclosed data
flow).

Note: `docs/ROADMAP.md:40` already claims "SHIPPED. `api/jobs.js` deleted."
That is inaccurate; the file exists and is wired up.

### resume-builder.js and app.html — dependency map

- `app.html:2150` loads `resume-builder.js`; `app.js:1269` calls
  `openResumeBuilder()` defined there.
- `scripts/smoke-test.cjs` reads `app.html` for required DOM IDs
  (`REQUIRED_FILES`, plus per-ID assertions).
- `scripts/database-evidence-inventory-test.mjs` lists `app.html` in its
  fallback file set.
- `scripts/job-agent-release-preflight-test.mjs` and
  `lib/job-agent-release-preflight.js` require both as root files.
- `build-public-web.mjs` and `scripts/vercel-output-boundary-test.mjs` ship
  both.
- `vercel.json` serves `app.html` at `/app/resume`.
- `DESIGN.md:147-153` documents `app.html` as the authenticated workspace and
  still says `/app` rewrites to `/app.html` — now stale.

## Risks / follow-ups

- `DESIGN.md` needs updating for the `/app` -> concierge routing. Left alone
  here because it is documentation outside the stated scope.
- Sign-in and Restore-access still point at `/app`, which now renders the Job
  Agent. Those authenticated flows are unmapped, so they were not moved.
- `client/concierge-router.js:135` still offers a "Workday employers" Google
  search link. That is a search-link builder, not the retired DOM automation,
  so it was left in place; flag if it should also go.
- `scripts/live-job-agent-asset-parity-test.mjs` still pins only `/concierge`
  and `/concierge.html`. `/app` now serves the same bytes but is not covered.
- No commit, deploy, publish, secret change, or extension permission change.
  `manifest.json` remains Greenhouse-only.

## QA follow-up round (same day)

Codex QA raised six items before commit. All addressed:

1. **Staging** - the whole change set is now staged together, deletions and their
   build/preflight/reference updates in one index. Not committed.
2. **/app/resume exposes the legacy app** - recorded as `P1-PIVOT-1` in
   `docs/JOB_AGENT_BACKLOG.md`. `docs/ROADMAP.md` claimed `api/jobs.js` was
   deleted and shipped; corrected to NOT SHIPPED with the evidence.
3. **/app/resume headers** - explicit CSP (the permissive app-shell policy the
   legacy workspace needs) plus `Cache-Control: no-store` in `vercel.json`.
   Declaring it on the route means a future tightening of the global policy
   cannot silently change what this legacy surface may do.
4. **Extension marketing** - `extension-section.html` and
   `screenshot_3_ats_grid.html` dropped 7 unsupported platforms each, plus the
   matching styles and the "9 platforms supported" counts. Both now read
   Greenhouse-only.
5. **Docs** - `docs/CLAUDE.md` carried a superseded multi-ATS architecture and
   a manifest snippet granting `*.myworkdayjobs.com` host permissions; that
   block, the `sites/workday.js` API section and the Workday Shadow-DOM rules
   are removed and a superseded banner added. `HANDOFF.md`, `docs/ROADMAP.md`,
   `docs/BUGS.md` and `DESIGN.md` updated. Historical evidence kept and marked
   historical rather than deleted.
6. **Parity coverage for /app** - `P2-PIVOT-3`, blocked on deployment
   sequencing, with both one-line edits recorded.

### Regression found during this round

Extension cover-letter capture deep-links to `/app`, which now renders the Job
Agent. `auth-bridge.js` deletes the pending job from storage and posts
`1STSTEP_JOB_CAPTURE`, which only `app.js` listens for - so the capture is
consumed and lost. Recorded as `P1-PIVOT-2`. Not fixed here: `AGENTS.md` lists
the extension job-capture contract as do-not-touch without explicit approval.
The minimal fix is one URL in `background.js:40`.

## Approved compatibility fix (same day)

`1ststep-extension/background.js:40` job-capture destination changed from `/app`
to `/app/resume`. One URL. `auth-bridge.js` and `app.js` untouched, so the
`1STSTEP_JOB_CAPTURE` contract is byte-identical.

`scripts/extension-security-test.mjs` gained a four-assertion guard pinning the
whole chain: background opens `/app/resume`, never bare `/app`; auth-bridge
still posts the message; `app.js` still listens. Mutation-tested - reverting the
URL fails the suite with "job capture must open /app/resume".

**`lib/controlled-extension-release.js` digest re-pinned**
`9645792e...` -> `0325442a...`. `background.js` is inside the controlled release
artifact, so its fail-closed integrity gate fired as designed. Sole source delta
is the one URL; no manifest, permission, or capability change. **The deployed
`JOB_AGENT_GREENHOUSE_EXTENSION_SHA256` env var must be updated to match before
`controlledExtensionReleaseConfiguration()` reports ready.** Not done here - env
and deploy changes were out of scope.

`P1-PIVOT-2` stays OPEN for the `concierge.js` migration, which is deliberately
not part of this change.

## Grandma Test UX requirement (documentation only)

Added the binding UX requirement without touching any screen, route, or the
atomic cleanup.

- `docs/SIMPLE_JOB_AGENT_UX.md` - full requirement: acceptance test, the
  seven-step journey, all 13 rules.
- `docs/JOB_AGENT_RUNTIME.md` - binding reference from the architecture
  contract, naming the two rules that are runtime obligations rather than
  presentation: captured jobs are never silently discarded, and plain-language
  state names must not collapse the receipt-backed Applying/Submitted
  distinction.
- `docs/JOB_AGENT_BACKLOG.md` - `UX-M1`, a dedicated milestone with the known
  gaps against the current build.

One conflict surfaced rather than smoothed over: rule 8 names four plain states,
while subscriber surfaces expose seven internal ones. Relabelling them would
destroy the receipt guarantee in `docs/AI_MEMORY.md`, so the mapping is recorded
as milestone work with an explicit warning against the naive fix.

No code, screens, or tests changed.

## Acknowledged job-capture handoff (approved A + B + C)

The `/funnel` capture path was traced read-only and found broken in four of five
respects. Fixed as one atomic change.

**`1ststep-extension/auth-bridge.js`** - delivery now precedes deletion. The
capture id must come from the URL; the wildcard "most recent pending job"
fallback is removed. A capture is deleted only on a matching
`1STSTEP_JOB_CAPTURE_ACK` whose `event.source` is this window and whose origin
matches, so another frame cannot consume a job it never received. A
`1STSTEP_JOB_CAPTURE_REQUEST` re-delivers only the capture named by the URL.

**`funnel.html`** - acknowledges only after `applyJobCapture` succeeds. Records
the consumed capture id in the page session, so re-delivery is idempotent.
Shows "Job saved" on success; after ~5s without delivery shows "We couldn't load
that job." with one "Try again" action. The page never touches extension
storage; retry goes through the bridge.

**`app.js`** - the cover-letter receiver got the same identity check,
idempotency guard, and acknowledgement, so its captures are consumed rather than
left to expire.

**`scripts/job-capture-handoff-test.mjs`** (new) - runs the real `auth-bridge.js`
in a `node:vm` sandbox with fake storage and window, and drives the protocol.
Eight blocks covering delivery-before-deletion, selective deletion, forged and
cross-frame acknowledgements, missing and unknown capture ids, exact-capture
retry, idempotent re-acknowledgement, expiry, and the visible states. Wired into
`npm run test:extension-release`.

**Mutation evidence.** Each protection was broken deliberately; all three were
caught, and the source was restored:

| Mutation | Caught by |
| --- | --- |
| delete the entry during delivery | "the pending capture must still exist before acknowledgement" |
| restore the wildcard fallback | "an unknown capture id must not fall back to another job" |
| accept any acknowledgement id | "cap-2 must survive an acknowledgement aimed at it from the wrong page" |

**Release integrity.** `CONTROLLED_GREENHOUSE_EXTENSION_SHA256` re-pinned
`0325442a...` -> `8a33cbcd...` only after the final package built and the tests
passed. The deployed `JOB_AGENT_GREENHOUSE_EXTENSION_SHA256` was deliberately
NOT updated.

`P1-PIVOT-2` stays open for the durable, deduplicated concierge migration.

## Rule 8 clarified: plain language is a presentation layer

Documentation only. No screens, code, or tests changed, and the Grandma Test was
deliberately NOT mirrored into `1ststep-architecture.html`.
`docs/SIMPLE_JOB_AGENT_UX.md` stays the canonical UX contract;
`docs/JOB_AGENT_RUNTIME.md` stays its binding runtime reference.

The four labels were examples, not a replacement lifecycle. The UX document now
carries a seven-row mapping table from user-facing concept to the internal state
it presents, with all seven internal states -- Found, Verified, Package Ready,
Needs You, Applying, Submitted, Receipt Verified -- explicitly preserved and
unrenamed.

Two things are stated sharply because they are easy to erode:

- "Browser helper connected" is connection status only and never appears in a
  job's lifecycle.
- ~~"Sent, awaiting confirmation" is a single phrase whose qualifier is
  load-bearing.~~ **Superseded later the same day — see the next section.**
  The original reasoning was:
  load-bearing. It is the only permitted use of "sent" before a receipt exists,
  and truncating it to "Sent" in a badge, tooltip, notification or
  screen-reader label breaks the receipt rule. Where space is short, different
  words -- not a shorter version of this phrase.

`UX-M1` now asks for a test that fails if any surface shows sent-equivalent
language without receipt evidence.

## Capture-hardening round 3 (QA defects)

**Strict identity in both receivers.** `funnel.html` and `app.js` used
`if (URL_ID && msgId && msgId !== URL_ID) return;`, which accepted a capture
carrying no id, and accepted anything when the page itself had no id. Both are
now `if (!URL_ID || !msgId || msgId !== URL_ID) return;`.

**Single-writer pendingJobs.** `auth-bridge.js` no longer writes extension
storage at all; it asks the service worker to consume the acknowledged capture
via `CONSUME_JOB_CAPTURE`, which is refused unless the sender is our own app
origin. `background.js` owns every mutation behind one promise chain
(`mutatePendingJobs`), so an addition, the expiry sweep and an acknowledged
deletion can no longer each read the same snapshot and write back a version
missing the others. Consumption validates the exact id with `hasOwnProperty`
before deleting.

While wiring the authorization check I found and fixed a bug in my own patch:
the message listener's parameter was named `_sender`, so `sender?.url` would
have thrown at runtime. `node --check` cannot catch that.

**Tests.** `scripts/job-capture-handoff-test.mjs` now boots the real
`background.js` as well as `auth-bridge.js` and wires the bridge's runtime
messages to the real background listener, so the queue is exercised rather than
described. It also runs the real receiver listeners extracted from
`funnel.html` and `app.js` -- `app.js` via balanced-expression extraction, since
a fixed end marker cut its listener mid-body. New coverage: apply-once /
acknowledge-twice for both receivers, missing-id rejection for both, overlapping
addition versus acknowledgement, five concurrent additions, exact-id validation,
and foreign-sender refusal.

**Mutation evidence -- seven mutations, all caught, source restored:**

| Mutation | Caught by |
| --- | --- |
| bridge deletes during delivery | "the capture must survive until acknowledged" |
| wildcard fallback restored | "an unknown capture id must not fall back to another job" |
| bridge drops the ack id check | "cap-2 must survive an acknowledgement from the wrong page" |
| funnel accepts a missing id | "funnel must reject a capture without a matching id" |
| app.js accepts a missing id | "a page opened without a capture id must accept nothing" |
| unserialized pendingJobs writes | "acknowledged capture must be removed" |
| consumption skips id validation | "an unrelated pending capture must survive" |

**Release integrity.** Digest re-pinned `8a33cbcd...` -> `45533f8c...`, again only
after the final package built and the tests passed. The deployed
`JOB_AGENT_GREENHOUSE_EXTENSION_SHA256` was deliberately NOT updated.

Also removed the duplicated "Original finding, retained" heading in the backlog.
`P1-PIVOT-2` stays open for the durable concierge migration.

## Stricter receipt language (supersedes the paragraph above)

The earlier round allowed one qualified use of "sent" before a receipt, on the
grounds that the qualifier carried the meaning. That was the weaker reading, and
it was overruled: **no user-facing success or "sent" language at all before
authoritative receipt evidence exists.**

The pre-receipt label is now:

> Waiting for employer confirmation

with supporting text:

> We tried to submit this application, but we haven't received confirmation yet.

The mapping gains one distinction and loses the ambiguity:

| What the user sees | Internal state |
| --- | --- |
| Working on application | Applying, before a submission attempt |
| Waiting for employer confirmation | Attempted, no authoritative receipt. Does not advance to Submitted. |
| Application confirmed sent | Submitted, only after authoritative receipt evidence |
| Confirmation verified | Receipt Verified, where the distinction helps |

Three constraints on the pre-receipt state are now explicit, because copy alone
would not have held them: it must not use success colouring, must not fire a
success notification, and must be excluded from every completion metric,
progress total, streak and completed-application count. A number on screen that
implies the application is done is exactly how this rule would have been
defeated without changing a single word of copy.

`UX-M1` now asks for two tests rather than one: one that fails if any surface
shows sent-equivalent language without receipt evidence, and one that fails if
the pre-receipt state is counted as a completed application.

Documentation only. Not mirrored into `1ststep-architecture.html`, and no UI was
implemented in this cleanup.

## Extension message trust-model audit (recorded, not implemented)

`P1-EXT-1` in `docs/JOB_AGENT_BACKLOG.md` inventories all eight `background.js`
message actions with caller, class and current validation. Only
`CONSUME_JOB_CAPTURE` validates its sender; the other seven accept any sender
the extension delivers from. No handler was changed.

Two findings worth stating precisely rather than dramatically:

- `externally_connectable` is not declared, so no web page can reach this
  message surface at all. That absence is the strongest control present, and the
  backlog item forbids adding it.
- The existing prefix check is **not** currently bypassable: the trailing slash
  in `${APP_URL}/` stops `https://app.1ststep.ai.evil.com/` from matching. It is
  recorded as brittle rather than broken - it rejects legitimate port-bearing
  URLs, and it becomes exploitable the moment `APP_URL` loses its trailing slash
  or gains a path. Exact origin parsing is required, with a try/catch that fails
  closed.

The item requires behavioural sender-authorization tests to land **before** the
trust model changes, so the change can be shown to preserve behaviour where
intended and alter it only where meant.

## Outcome claims are contextual, not banned strings (corrects the round above)

The stricter-language round overreached. It read as a global word ban --
"nothing the user reads may say sent, submitted, applied, complete, done" --
which would have outlawed "Apply now", "Applying", "Application", "Complete this
question" and "Done editing", all of which are legitimate and none of which
claim an outcome.

The rule is now positional: before authoritative receipt evidence, no label,
badge, notification, metric, email, screen-reader text or status description may
claim or imply the application was delivered or completed. The UX document
carries a two-column table of disallowed outcome claims beside the allowed
non-outcome uses of the same words, and the deciding test is whether a
reasonable user would read the phrase as "the employer has it".

This also changes how it must be tested. `UX-M1` previously asked for a check
that fails "if any surface shows sent-equivalent language" -- which invites a
repository grep. That is now explicitly forbidden, because a string scan would
either fail on legitimate copy or pass on a renderer showing the wrong state.
The requirement is behavioural: exercise the state renderer, the notification
path and the metric/count path twice each, once without receipt evidence and
once with it, and assert the pre-receipt pass carries no outcome claim, fires no
success notification and is excluded from completion counts.

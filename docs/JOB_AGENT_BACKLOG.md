# Job Agent — Prioritized Backlog

Source: `docs/JOB_AGENT_DATA_FLOW_DISCLOSURE.md` (2026-09-01).
Status of every item below: **RECORDED — NOT STARTED.** Nothing here has been designed, implemented, or mitigated. These are open items, not resolved ones.

---

## P0-1 — Protected-category fields in the applicant vault

**Blocks:** durable career-profile storage for real users.

**Finding.** `lib/applicant-vault-domain.js:17–21` defines a `CONSEQUENTAL_FIELDS` set that includes `criminalHistory`, `disability`, `veteranStatus`, `drugHealth`, `citizenship`, `clearance`, `background`, `sponsorship`, `authorization`, `exportControl`, `restrictiveAgreements`, `demographics` and others. Any of these may be written as a user-confirmed fact and stored encrypted for 365 days.

Existing mitigations already in code, for reference — they are partial, not sufficient:
- `demographics` is restricted to two literal values (`prefer not to answer` / `leave optional demographics unanswered`).
- `autoReuse` is forced `false` for every consequential field.
- Credential-shaped keys are rejected outright.

**Required before durable storage is enabled**

- Review whether protected-category fields should exist in the schema **at all**.
- Do **not** enable durable storage of `criminalHistory`, `disability`, `veteranStatus`, `drugHealth` or similar protected/sensitive categories merely because the schema supports them. Schema support is not a decision.
- Determine the **minimum** field set actually necessary for job matching, and treat that as the allowlist rather than trimming from the current set.
- Design work-authorization and citizenship handling **separately and minimally** — these have a legitimate matching purpose that the others do not, and should not inherit the general fact-storage design by default.
- `DATA_CONSENT` remains **disabled** until Terms and Privacy are deliberately updated and reviewed. See P0-3.

**Do not:** treat the existing `demographics` restriction as a template that makes the other fields acceptable.

---

## P0-2 — Revocation is a soft delete

**Blocks:** representing revocation to users as deletion.

**Finding.** `revokeVaultFact` (`lib/applicant-vault-domain.js:125–133`) and `revokeVaultDocument` set `status: 'revoked'` and stamp `revokedAt`, but the prior values remain in the record's `versions[]` array. The underlying value survives inside the encrypted record until the entire vault is deleted or its 365-day TTL expires.

Full vault deletion (`deleteApplicantVault`) does remove everything, and is correctly wired into `lib/account-data-deletion.js`. The gap is per-item revocation only.

**Required**

- Reconcile the architecture with the intended deletion behavior **before** any UI, policy, or support response describes revocation as deletion.
- Decide deliberately whether version history is a feature worth keeping (audit integrity, undo) or an artifact to remove — and if kept, what the user is told.
- Check the outcome against the 30-day deletion commitment in `privacy.html` §5 and against NJDPA/CCPA deletion rights.

**Do not:** change the revocation semantics as a quick fix. Version retention may be load-bearing for the audit trail; this needs a decision, not a patch.

---

## P0-3 — DATA_CONSENT stays disabled

**Standing hold, carried from the coverage audit.**

No `JOB_AGENT_TERMS_VERSION` or `JOB_AGENT_PRIVACY_VERSION` value may be configured until `terms.html` and `privacy.html` have been deliberately revised and reviewed. Versioning the documents as they stand would record user consent against text that describes storage practices the system does not follow (`privacy.html` §3).

Both documents remain SHA-256 byte-pinned. Digests verify. They are not to be edited except as part of a deliberate revision.

---

## P1-1 — AI provider governance

**Finding.** `lib/ai-provider.js:3–14` selects among three provider families from environment variables alone, with no code change and no allowlist:

- `anthropic` → `api.anthropic.com`
- `cloudflare` → Cloudflare Workers AI
- `openai-compatible` → `api.openai.com/v1` by default, **or any host set in `AI_BASE_URL`**

Production currently holds only an Anthropic key, so Anthropic is the active provider. But setting `AI_BASE_URL` and `OPENAI_API_KEY` would route résumé content and career facts to an arbitrary third party without a deploy, a code review, or any record.

**Required before additional providers can be enabled**

- Introduce an approved-provider allowlist or equivalent configuration control, so an environment-variable change cannot silently introduce a new data processor.
- The control should fail closed, consistent with the rest of the Job Agent's gating design.
- Whatever the policy ends up saying about AI subprocessors, this is the mechanism that has to keep it true.

---

## P1-2 — Audit archive

**Finding.** `lib/application-audit-archive-provider.js` implements a retention-locked external archive: HTTPS host allowlist, bearer auth, signed acknowledgements, and an enforced retention range of **365–3650 days**. It is deliberately excluded from the 14-store deletion routine in `lib/account-data-deletion.js`.

**Current state: disabled.** Requires `JOB_AGENT_AUDIT_ARCHIVE_ENABLED`, `_APPROVED`, `_APPROVAL_VERSION`, `_CONTRACT_VERSION`, `_LEGAL_HOLD_POLICY_VERSION`, `_URL`, `_ALLOWED_HOSTS`, `_BEARER_TOKEN`, `_ACK_SECRET`, `JOB_AGENT_AUDIT_EXPORT_SECRET`, `_RETENTION_DAYS`. None are set.

**Required**

- Do **not** enable retention-locked / WORM archival until its retention, deletion and legal-hold behavior has been deliberately reviewed.
- The specific question for that review: whether an archive that survives a user's deletion request is permissible, and on what stated basis.

---

## P1-PIVOT-1 - /app/resume still exposes the entire legacy app

**Status: RECORDED - NOT STARTED. Unfinished pivot work.**

`/app` now serves the Job Agent (`concierge.html`). The legacy workspace was kept
reachable at `/app/resume` so nothing was deleted mid-pivot. That route serves
`app.html`, which loads the whole of `app.js` - not a resume-only slice.

**Consequence.** Legacy job search is still live and reachable. `app.js:5310`
fetches `/api/jobs`, `vercel.json` still declares the `api/jobs.js` function and
its two rewrites, and the JSearch/RapidAPI provider path remains wired up. The
resume capability is not isolated from legacy search; they ship as one document.

**Do not describe legacy search as retired or `api/jobs.js` as deleted while this
route is active.** `docs/ROADMAP.md` previously made that claim and was corrected
on 2026-09-04.

**Required to close, in order**

- Map every caller and authenticated flow that depends on `app.html` / `app.js`.
  Known today: extension job capture, extension "Open app", `smoke-test.cjs`
  required DOM IDs, `database-evidence-inventory-test.mjs`, both release
  preflights, `build-public-web.mjs`, `vercel-output-boundary-test.mjs`.
- Decide whether resume generation becomes a Job Agent capability inside
  `concierge.html`, or a genuinely resume-only surface that does not carry the
  search UI or `/api/jobs` calls.
- Only then remove `api/jobs.js`, its `vercel.json` function entry and rewrites,
  and its `scripts/security-regression-test.mjs` expectations - together, as one
  change.

---

## P1-PIVOT-2 - Extension job capture deep-links into /app

**Status: OPEN. Handoff hardened 2026-09-04; durable migration NOT started.**

Two rounds of compatibility work have landed. The capture is no longer lost or
mis-delivered, but it is still delivered to the legacy resume app rather than
the Job Agent, and durability still depends on a two-minute in-browser
expiry rather than a durable tenant-scoped record.

Round 2 (approved) replaced fire-and-forget delivery with an acknowledged
handoff:

- Exact identity. The capture id must come from the URL. The "most recent
  pending job" fallback is gone; it only ever fired once the correct entry had
  been deleted, and then delivered a different job.
- Delivery precedes deletion. `auth-bridge.js` posts the capture and removes it
  only on a matching `1STSTEP_JOB_CAPTURE_ACK` from the same window and origin.
  No acknowledgement means the job survives to its expiry.
- Idempotent. The consumed capture id is recorded in the page session, so
  re-delivery acknowledges again without redoing or overwriting work.
- Recoverable. After ~5s the page shows "We couldn’t load that job." with one
  "Try again" action that posts `1STSTEP_JOB_CAPTURE_REQUEST` for its own id.
  The page never reads extension storage.

`scripts/job-capture-handoff-test.mjs` runs the real bridge in a sandbox and
is mutation-tested against delete-before-ack, the wildcard fallback, and
wrong-capture acknowledgement.

**Still open for the durable migration:** captures land in the legacy app, not
`concierge.js`; there is no tenant-scoped canonical identity or server-side
idempotency key; and a capture still cannot survive a closed tab. This item
closes when the handoff is durable, deduplicated, and owned by the Job Agent.

_Original finding, retained:_

`1ststep-extension/background.js:40` opens
`${APP_URL}/app?jobCaptureId=...&mode=...` for cover-letter capture. `/app` now
renders `concierge.html`.

`auth-bridge.js` (`deliverPendingJob`) runs on any `app.1ststep.ai` page, reads
the `jobCaptureId`, **deletes the pending job from `chrome.storage.local`**, and
posts `1STSTEP_JOB_CAPTURE` to the page. Only `app.js:2741` listens for that
message; `concierge.js` does not. The capture is therefore consumed and
discarded with no receiver - a silent data loss, not a broken link.

The one-URL fix in `background.js:40` (`/app` -> `/app/resume`) was approved
and applied on 2026-09-04, restoring the pre-pivot behaviour exactly. Re-pinning
`CONTROLLED_GREENHOUSE_EXTENSION_SHA256` was required because `background.js` is
in the controlled release artifact; the deployed
`JOB_AGENT_GREENHOUSE_EXTENSION_SHA256` env var must be updated to match before
the readiness check reports ready.

---

## P2-PIVOT-3 - Live parity and boundary coverage for /app

**Status: RECORDED - BLOCKED ON DEPLOYMENT SEQUENCING.**

`/app` serves the same bytes as `/concierge`, but the live verifiers do not
check it:

- `lib/live-job-agent-asset-parity.js:6` -
  `{ file: 'concierge.html', routes: ['/concierge', '/concierge.html'] }`
  needs `'/app'` added to that route array.
- `lib/live-job-agent-boundary.js:57` - the
  `['/concierge', '/concierge.html']` loop needs `'/app'` added.

Both verifiers fetch production. Production still serves `app.html` at `/app`
until this change deploys, so adding the route now makes
`npm run security:asset-parity` and `npm run security:live-boundary` fail. Apply
both one-line edits immediately after the deploy that flips the route, and
re-run those two commands as the post-deploy check.

---

## UX-M1 - Grandma Test onboarding milestone

**Status: RECORDED - NOT STARTED.** Dedicated UX milestone. Not part of the
2026-09-04 routing and Workday cleanup, which deliberately changed no screens.

**Requirement:** `docs/SIMPLE_JOB_AGENT_UX.md`, section "The Grandma Test".

**Definition of done.** A first-time user unfamiliar with AI, browser extensions
or job software completes the seven-step journey -- start, confirm contact,
confirm target jobs and location, review resume facts, connect the browser
helper, see the first matched job, review the prepared application -- in under
five minutes, unaided. A screen fails if a tester asks what a word means or
cannot find the next button within five seconds.

**Known gaps against the current build**

- **Jargon in shipped copy.** "Extension" appears in subscriber-facing surfaces
  and must become "the browser helper" with one guided install button (rule 7).
- **Plain-language state vocabulary.** The mapping is now specified in
  `docs/SIMPLE_JOB_AGENT_UX.md` and is presentation only: the seven internal
  states stay exactly as they are. Implementation work is to render the
  user-facing labels from that table, keep "Browser helper connected" out of
  the job lifecycle entirely, and guarantee that no surface shows success or
  "sent"-equivalent language before authoritative receipt evidence exists. The
  pre-receipt label is "Waiting for employer confirmation"; it must be
  non-success-coloured, must fire no success notification, and must be excluded
  from every completion metric, progress total and completed-application count.
  Needs behavioural tests that exercise the state renderer, the notification path
  and the metric/count path twice each -- once without receipt evidence and once
  with it -- asserting that the pre-receipt render carries no outcome claim, fires
  no success notification, and is excluded from completion counts, while the
  post-receipt render does all three. **Do not implement this as a repository-wide
  grep or a raw banned-word check**: the terms are contextual outcome claims, not
  forbidden strings, and "Apply now", "Applying", "Application", "Complete this
  question" and "Done editing" must all keep working. A string scan would either
  fail on legitimate copy or pass on a renderer that shows the wrong state.
- **Onboarding density.** Setup currently spans 15 core facts plus 10
  conditional questions. Rules 1, 2 and 12 require one question per screen with
  advanced settings hidden.
- **Progress indication.** No "Step 2 of 5" or time-remaining affordance exists.
- **Capture durability.** Rule 9 needs an explicit guarantee and a test. Related:
  `P1-PIVOT-2`, where a captured job was silently consumed and lost.
- **Accessibility.** `docs/accessibility-baseline-audit.md` is the starting
  point; rule 13 makes keyboard, screen-reader, contrast, text-size and mobile
  conformance part of the pass bar rather than a separate track.

**Not in scope for this milestone.** Changing durable state semantics, receipt
rules, permissions, or the discovery pipeline. This milestone changes what the
user sees and how they are asked, not what the system is allowed to do.

---

## P1-EXT-1 - Extension message trust model is inconsistent

**Status: RECORDED - NOT STARTED.** Audit only; no handler was changed when this
was written on 2026-09-04.

`background.js` exposes one `chrome.runtime.onMessage` listener with eight
actions. Exactly one of them - `CONSUME_JOB_CAPTURE`, added the same day -
validates the sender. The other seven accept any sender the extension will
deliver from. That asymmetry is the finding: the file now carries two trust
models side by side, and the newer one is not the default.

### Reachability

`externally_connectable` is **not declared**, so no web page can call
`chrome.runtime.sendMessage` directly. The reachable senders are:

- `content.js`, injected only on `https://*.greenhouse.io/*`
- `auth-bridge.js`, injected only on `https://app.1ststep.ai/*`
- extension pages (`popup.js`, `sidepanel.js`), sender URL `chrome-extension://`

Content scripts run in an isolated world, so a hostile employer page cannot
invoke these actions directly. It can, however, influence the DOM that
`content.js` reads, which is the realistic path by which attacker-controlled
input reaches a handler.

### Handler inventory

| Action | Legitimate caller | Class | Current sender validation |
| --- | --- | --- | --- |
| `GET_JOB_AGENT_STATUS` | `popup.js` | Read (relays to app tab) | **None** |
| `PREPARE_GREENHOUSE_HANDOFF` | `content.js` (greenhouse.io) | **Privileged** - relays a prepare call carrying employer/application payload | **None** |
| `GET_GREENHOUSE_DOCUMENT` | `content.js` (greenhouse.io) | **Privileged** - returns resume document bytes | **None** |
| `COMPLETE_GREENHOUSE_HANDOFF` | `content.js` (greenhouse.io) | **Privileged** - completes an application handoff | **None** |
| `JOB_DETECTED` | `content.js` (greenhouse.io) | Write - sets `current_job` in session storage | **None** |
| `GET_CURRENT_JOB` | `popup.js` | Read - returns `current_job` | **None** |
| `CONSUME_JOB_CAPTURE` | `auth-bridge.js` (app origin) | Write - deletes a pending capture | `sender.url.startsWith(APP_URL + '/')` |
| `OPEN_IN_APP` | `content.js`, `popup.js` | Write + **navigation** - creates a pending capture and redirects or opens a tab | **None** |
| _unknown action_ | - | - | Returns `{ success: false, error: 'Unknown action' }` - fails closed, leaks nothing |

### Priorities

**P1 - mutating or sensitive, no explicit authorization**

- `GET_GREENHOUSE_DOCUMENT` - returns document bytes to whichever context asks.
- `PREPARE_GREENHOUSE_HANDOFF` and `COMPLETE_GREENHOUSE_HANDOFF` - drive the
  application handoff, the most consequential surface the extension has.
- `OPEN_IN_APP` - writes `pendingJobs` and navigates or opens a tab. Navigation
  is constrained to `APP_URL` today, but the target is assembled from caller
  input (`mode`), so the constraint is incidental rather than enforced.
- `JOB_DETECTED` - writes session state consumed by other surfaces.

**P2 - read-only inconsistencies**

- `GET_JOB_AGENT_STATUS` and `GET_CURRENT_JOB` return non-secret state to
  extension pages. Worth aligning for consistency, not urgent.

### Tenant and session binding

Sender-origin authorization is necessary but **not sufficient** for the three
actions that return document bytes or drive a handoff:
`GET_GREENHOUSE_DOCUMENT`, `PREPARE_GREENHOUSE_HANDOFF` and
`COMPLETE_GREENHOUSE_HANDOFF`. An authorized content script is still only proof
of *where* the request came from, not of *whose* application it concerns. On its
own it would let any authorized sender request any document.

Every request to these three must be bound to all four of:

- the authenticated tenant,
- the exact application session,
- the exact handoff / document identifier,
- an authorized browser execution context.

Cross-tenant, cross-session, expired, replayed and mismatched requests must fail
closed. A rejection returns no document bytes and no candidate information -
not in the response, not in the error message, not in logs.

Same-session retry of the same identifier stays idempotent: a repeat of a
request that already succeeded returns the same result rather than performing
the work twice or being treated as a replay attack.

Tests must cover each rejection path individually - wrong tenant, wrong session,
expired binding, replayed request, mismatched identifier - and the same-session
idempotent retry, so a single over-broad check cannot pass for all of them.

### Required work

1. **Exact origin parsing, not string prefixes.** Replace
   `String(sender?.url || '').startsWith(`${APP_URL}/`)` with
   `new URL(sender.url).origin === APP_ORIGIN`, inside a try/catch that fails
   closed on an unparseable URL. The current check is **not** bypassable - the
   trailing slash stops `https://app.1ststep.ai.evil.com/` from matching - but
   it is brittle: it rejects legitimate port-bearing forms, and it silently
   becomes exploitable if `APP_URL` ever loses its trailing slash or gains a
   path. Do not leave that trap in place.
2. **One authorization table, applied by default.** Each action declares the
   sender contexts it accepts (greenhouse content script, app content script,
   extension page). The listener consults it before dispatch, so a new action is
   unauthorized until it is listed rather than open until someone remembers.
3. **Fail closed and say nothing.** Unauthorized senders and unknown actions
   return a generic failure. No candidate data, no employer data, no document
   bytes, no capture ids, no internal state names in the error.
4. **Behavioural tests first.** Add sender-authorization tests to
   `scripts/job-capture-handoff-test.mjs`, or a sibling, that drive the real
   listener with spoofed sender URLs - `chrome-extension://`, a greenhouse
   origin, the app origin, a lookalike host, an unparseable URL - and assert
   which actions each may reach. `CONSUME_JOB_CAPTURE` already has this
   coverage; the other seven do not. **Write these before changing the trust
   model**, so the change is demonstrably behaviour-preserving where it should
   be and behaviour-changing only where intended.
5. **Mutation-test the new checks** the way the capture protections were: break
   each authorization rule and prove a test fails.

### Constraints

- Greenhouse-only permissions stay as they are:
  `https://*.greenhouse.io/*` and `https://app.1ststep.ai/*`. This work adds no
  hosts.
- **Do not add `externally_connectable`.** Not declaring it is what keeps web
  pages off this message surface entirely, and it is the strongest control here.
- No change to the receipt rule, the capture handoff contract, or the controlled
  release boundary. Re-pinning the extension digest will be required because
  `background.js` is in the release artifact.

---

## Not in this backlog

Items already resolved or deliberately parked elsewhere, listed so they are not re-opened by mistake:

- **Monetary budget configuration** — approved as a private-beta profile; blocked only on Upstash runtime verification. Not a backlog item.
- **Employer interaction and final submission** — fail closed by design across seven independent gates. Intentional, not debt.
- **Object storage and email spend categories** — deliberately unconfigured. The package worker degrades to `text-only`.
- **Chrome extension** — de-listed; non-release-critical.

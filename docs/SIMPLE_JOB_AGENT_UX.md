# Subscriber Job Agent UX

## Product intent

The authenticated concierge uses the existing dark 1stStep identity and static frontend. It adds only the selected Watermelon/shadcn interaction ideas: a restrained application shell, tabbed job views, a responsive Needs You sheet, employer-specific confirmation dialogs, consistent status badges, modest toasts, persisted mission statistics, and a compact configuration summary.

The primary flow remains: upload or restore a resume, choose a job path, confirm essential criteria, then start the agent. The interface derives resume readiness, mission settings, run state, job cards, actions, and receipt-backed counts from the existing canonical state stores rather than parallel UI-only counters.

The application target is expressed as "up to" the user's goal. The visible explanation must make clear that the actual total depends on qualified non-duplicate jobs, plan allowance, safe system capacity, and required confirmations. A lower total is not an error when supply or a safety/cost boundary is lower, and a higher user goal never overrides those boundaries.

Setup is intentionally split into 15 short reusable core facts and 10 targeted questions that appear only when a verified employer application requires them. Exact address, employer-specific conflicts, certifications, screening, references, account creation, and privacy terms do not block initial discovery. Invalid secret-shaped answers stay unsaved without advancing, and consequential answers require review each time.

A signed user returning on a new browser does not need to remember or paste a run ID. The client restores the tenant’s latest encrypted discovery mission and truthful run state after access verification; package-document runs remain separate and are restored only through their exact application records.

## The Grandma Test (binding UX requirement)

Every Job Agent screen must pass this before it ships. It is a requirement, not
a guideline: a screen that fails it is not done.

### Acceptance test

A first-time user unfamiliar with AI, browser extensions, or job software must
complete onboarding in **under five minutes, with no help from another person**.

A screen **fails** if either happens:

- the tester asks what a word means, or
- the tester cannot identify the next button within five seconds.

Failures are recorded against the screen, not the tester.

### Primary journey

The onboarding path is exactly these seven steps, in this order:

1. Start Job Agent
2. Confirm name and contact information
3. Confirm target jobs and location
4. Review resume facts
5. Connect the browser helper
6. See the first matched job
7. Review the prepared application

Anything not on this path is not onboarding and must not appear during it.

### Rules

1. **One primary action per screen.** Exactly one obvious next step.
2. **One question at a time**, in plain language.
3. **No jargon.** Never show: API, ATS, JSON, payload, provider, model, webhook,
   extension bridge. This applies to labels, help text, toasts and error copy.
4. **Every answer saves itself.** No manual Save button anywhere.
5. **Simple progress.** "Step 2 of 5" and "About 2 minutes left."
6. **Extract, then confirm.** Pull facts from the resume and ask the user to
   confirm them. Never ask someone to retype what we already read.
7. **The extension is "the browser helper."** One guided installation button.
8. **Visible plain-language states.** The user reads plain words, never the
   internal state name. See "Plain-language state vocabulary" below for the
   mapping. The internal states are not renamed, merged, or removed.
9. **Never silently discard a captured job.** It persists until it is processed
   or the user explicitly removes it.
10. **Before any application action**, show exactly what will happen and require
    a plain-language confirmation.
11. **Errors state what happened and offer one obvious recovery action.**
12. **No control-heavy dashboards during onboarding.** Advanced settings stay
    hidden by default.
13. **Accessibility is part of passing:** keyboard, screen reader, contrast,
    text size, and mobile.

### Plain-language state vocabulary

Rule 8 is a **presentation layer**, not a replacement lifecycle. The four labels
originally listed were examples, not an exhaustive set. Every internal state is
preserved exactly as it is; this table only says what the user reads.

| What the user sees | Internal state it presents |
| --- | --- |
| Browser helper connected | Connection status only. **Not an application state** and never shown in a job's lifecycle. |
| Looking for jobs | Discovery is running, or no reviewable match exists yet. |
| Ready for review | Found, Verified, or Package Ready — with the detail appropriate to which. |
| Needs your help | Needs You |
| Working on application | Applying, **before** a submission attempt. |
| Waiting for employer confirmation | A submission was attempted and no authoritative receipt has arrived. Does **not** advance to Submitted. |
| Application confirmed sent | Submitted — only once authoritative receipt evidence exists. |
| Confirmation verified | Receipt Verified, where that additional distinction is useful to the user. |

Supporting text for the pre-receipt state, verbatim:

> We tried to submit this application, but we haven’t received confirmation yet.

**Rules that bind this table**

- **Do not rename or collapse the internal states.** Found, Verified, Package
  Ready, Needs You, Applying, Submitted and Receipt Verified all remain
  distinct in the record. Several may share one user-facing label; none may
  lose its identity because of it.
- **No outcome claim before a receipt.** Before authoritative receipt evidence
  exists, no label, badge, notification, metric, email, screen-reader text or
  status description may claim or imply that the application was delivered or
  completed.

  This is about **what a phrase claims in its position**, not about which words
  appear anywhere in the product. The same word can be fine in one place and
  wrong in another.

  | Disallowed as a pre-receipt outcome claim | Allowed, because it claims no outcome |
  | --- | --- |
  | "Sent" | "Apply now" (an action the user can take) |
  | "Submitted" | "Applying" (work in progress) |
  | "Applied" | "Application" (the noun for the thing) |
  | "Application complete" | "Complete this question" (an instruction) |
  | "Done" | "Done editing" (finishing a local edit) |
  | any equivalent success claim | |

  The test is whether a reasonable user would read the phrase as "the employer
  has it". "Working on application" must not drift toward "sending", and
  "Waiting for employer confirmation" must not be shortened into anything that
  reads as success.
- **The pre-receipt state is not a success state.** "Waiting for employer
  confirmation" must not use success colouring, must not fire a success
  notification, and must not count toward any completion metric, progress
  total, streak, or completed-application count. If a number on screen implies
  the application is done, this state is excluded from it.
- **Only authoritative receipt evidence reaches "Application confirmed sent."**
  Filling fields, clicking an employer control, an HTTP 2xx, or a provider
  acceptance do not qualify. This is the correctness rule from
  `docs/AI_MEMORY.md`, restated here so a copy change cannot quietly undo it.

Ambiguous outcomes stay at "Waiting for employer confirmation" and raise one
Needs You action. They never advance on optimism, and they never silently move
backward.

## Subscriber surfaces

- Navigation: My Jobs, Needs You, Saved Info, and Agent Status. Admin evidence remains hidden unless the signed session returns `adminConsole: true`.
- My Jobs tabs: Matches, Preparing, Needs You, Submitted, and Interviews.
- Status sequence: Found, Verified, Package Ready, Applying, Needs You, Submitted, Receipt Verified. A role with a local `Submitted` label but no authoritative receipt remains Applying in the subscriber view.
- Needs You: one focused action per item with explicit preserved-state and resume-after-answer copy.
- Confirmation: employer, role, requisition, masked information categories, material risk, exact action, and version-specific scope appear before personal-data sharing or final submission approval.
- Feedback: reversible successes may use a toast; errors and required actions remain visible in their panel or dialog.
- Mission statistics: verified matches, packages ready, Needs You, Submitted, and Interviews. Submitted counts only authoritative non-simulated receipts.

## Responsive and accessibility rules

- Desktop uses a compact top navigation. Mobile uses a four-destination fixed navigation and keeps access/admin controls out of the subscriber rail.
- Dialogs receive focus, support Escape, and wrap Tab focus. The underlying application dialog is hidden from assistive technology while a consequence confirmation is open.
- Text and color both communicate status. Focus outlines, semantic labels, overflow handling, and reduced-motion behavior are explicit.
- Local UI fixtures run only on `localhost` or `127.0.0.1`; they are visibly synthetic and cannot enable employer execution.

## Known backend limits

- Employer-browser execution and personal-data transmission remain disabled in production.
- The receipt verifier has deterministic synthetic coverage for direct employer pages, authenticated employer email, and signed allowlisted ATS responses, but no live receipt-capture connector is configured.
- Durable account persistence requires verified Job Agent access and configured production storage. Signed-out device state remains local and is described honestly.
- Operator alerts, isolated document rendering, and browser-worker providers remain unconfigured until their destinations, snapshots, budgets, and terms are approved.

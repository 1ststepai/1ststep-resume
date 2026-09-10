# Chrome extension audit

Audit snapshot: source `main` at `cb8da3c`, manifest 1.4.0. Chrome Web Store showed 1.3.2, updated 2026-09-05, with eight users and Greenhouse-only listing copy.

## Current components

| Responsibility | Code | User-facing now? | Should be? | Server role | Extension role | Mobile | Reliability/security | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Manifest/permissions | `1ststep-extension/manifest.json` | Indirect | Explain simply | verify version/digest | declare `activeTab`, scripting, storage, sidePanel, tabs; persistent hosts only GH + app | unavailable | Good narrow host model | KEEP |
| User-triggered capture | `popup.js`, `generic-capture.js`, `background.js` | Yes | Yes | receive/review capture | inspect selected top-level page via `activeTab` | capture alternative needed | Fails closed on non-job pages | KEEP |
| Capture queue/ack | `background.js`, `auth-bridge.js` | Mostly hidden | Status only | acknowledge exact capture | short-lived serialized storage, remove after ack | sync via server after review | Tests cover races/forged ack | KEEP |
| Greenhouse detection/schema | `content.js`, `sites/greenhouse.js` | Hidden | No | validates task/schema | inspect current form | none | Fixture tests pass | KEEP |
| Approved-field fill | `content.js`, `utils/filler.js` | Yes | One explicit action | owns values/policy/approval | fills exact ordinary fields | none | Narrow, no guessing | KEEP |
| Resume upload | `content.js` | Yes | Status only | serves exact hash-bound artifact | verifies bytes, attaches one resume control | none | Good integrity boundary | KEEP |
| Final submit | absent/blocked | No | No automatic UI today | future separate gate | must not submit | none | Safe | KEEP BLOCKED |
| Other site adapters | legacy files `sites/lever.js`, `indeed.js`, `icims.js`, `linkedin.js` | Not in controlled build | No | future adapter policy | none until conformance | none | Excluded from controlled release | REFACTOR/DO NOT CLAIM |

## Data flow

### Capture

Selected page -> injected generic extractor -> user corrects title/company -> choose Resume Builder/cover letter/Job Agent -> capture stored up to 15 minutes -> exact receiver saves/reviews -> signed acknowledgement -> exact capture deleted.

### Greenhouse fill

Package Ready -> user approves masked sharing scope -> open employer URL with non-sensitive session fragment -> extension extracts value-free schema -> signed app bridge asks server -> server validates tenant/job/package/document/schema/permission -> transient values/artifact returned -> extension fills and reports field keys -> user reviews/submits.

## Confirmed strengths

- No permanent all-sites host permission for capture.
- No second applicant profile/resume/tracker or raw values in extension storage.
- No AI field guessing and no submit.
- Exact capture identity, delivery-before-deletion, race handling, and forged-ack rejection have tests.
- Current main release suite passed all 11 browser cases.

## Gaps and risks

- Store version 1.3.2 does not include/describe source 1.4.0 behavior; installed-user capability is therefore narrower until publication is verified.
- Greenhouse-only execution coverage is too narrow for an autonomous product claim.
- Browser lifecycle, navigation drift, partial-fill recovery, and production telemetry need live controlled evidence beyond fixtures.
- The extension cannot serve mobile and should not become the product's primary mental model.
- Generic capture quality can be wrong on iframe-only, signed-in, PDF, closed-shadow-root, or unusual pages; captures must remain unverified.

## Strategic decision

**Hybrid architecture (B + C):** the extension becomes mostly invisible execution infrastructure and a user-triggered capture convenience, while remaining a fallback for ATS flows that cannot run safely server-side. The Job Agent owns all policy, knowledge, package, state, and receipts.

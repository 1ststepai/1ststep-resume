# Guided application draft review

Founder simplification follow-up: the default review now shows a short document heading, employer/role, one instruction, the document, and one primary next action. Long guidance, file status, copying, downloads and the manual employer link live under closed-by-default More options. Autosave and the short Not sent to employer label remain visible. Six focused browser checks, smoke and the public web build passed after this presentation change; screenshots were refreshed. The earlier Vercel output check below predates this copy/layout-only follow-up.

Implemented locally on the existing `codex/chrome-store-policy-update` working copy. Earlier uncommitted application, login, pricing and browser-helper work was preserved. No production deployment, external application, provider generation or account change was performed.

## Applicant experience

- Review one document at a time with keyboard-accessible Resume and Cover letter tabs.
- Plain-language guidance replaces raw document-check codes in this review screen.
- Edits save automatically through the existing private revision endpoint. Candidate edits use the existing no-AI revision path, rather than regenerating a draft.
- Saves are serialized. Typing during an in-flight request stays visible and the latest edit saves afterward.
- Failed saves keep the text in the open page, expose an explicit retry and prevent dialog dismissal or moving to another draft. The browser warns before leaving with unsettled edits. This does not promise recovery after a force-close or browser crash; private edits are not copied to new browser storage.
- A lost response replays the exact idempotent revision. An acknowledged pending revision is read back before a new revision uses its result. Pending/failed runs never replace the usable base or show a saved confirmation.
- Copy the selected document, download the current private text, and move to the next existing prepared draft. Moving between drafts records no approval or application outcome.
- File download actions are cleared on edits until the saved revision returns its own artifacts.

## Changed files

`concierge.html`, `concierge.js`, `application-preparation.css`, `client/draft-review.js`, `build-public-web.mjs`, `scripts/draft-review-test.mjs`, `scripts/draft-review-browser.spec.mjs`.

## Validation

- Draft-review unit tests: serial/in-flight/no-op saves, failed-save recovery, reverting during an unresolved save, pending revision reconciliation, exact lost-response replay, and plain-language guidance.
- Browser tests: document navigation and existing-draft reuse, autosave and reopen, failed-save preservation and explicit retry, mobile layout and selected-document copying. Synthetic local fixtures only; no live provider or employer request.
- Existing preparation and local-employer-handoff browser regressions pass.
- Existing application-package tests pass, including encryption, candidate-edit processing, document checks and tenant isolation.
- Required `npm run smoke`: zero failures, six existing warnings.
- Public web build passes. Desktop (1440x1000) and mobile (390x844) screenshots inspected in `output/draft-review-desktop.png` and `output/draft-review-mobile.png`.
- Vercel production build/output boundary check passes locally: 62 intentional static files, 41 API functions, no internal-source or extension-package leaks. This command built local output; it did not deploy.
- Focused browser total: seven passing checks (five draft-review checks plus the existing preparation and execution-route checks).
- Broader `scripts/concierge-test.mjs` is blocked by a pre-existing assertion expecting `Receipt-verified application target`; the existing uncommitted dashboard copy already reads `Your application target`. This change does not alter that heading or its test.

The full product is not declared release-ready. Existing production/infrastructure limitations and deployment approval requirements remain in force. The new flow has local synthetic browser coverage, not an unaided first-time-user timing study or live authenticated autosave acceptance.

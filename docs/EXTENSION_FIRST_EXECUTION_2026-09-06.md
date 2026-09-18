# Local browser application routing

The application workspace now defaults to a local employer-page route. Supported Greenhouse URLs preserve the existing extension session/version fragment contract. Unsupported sites offer an explicitly manual employer-page link. Private draft review also exposes the employer URL without transmitting candidate data.

Cloud preview is hidden until explicitly selected, disabled when unavailable, and cannot be started through this UI without selecting it. Existing active cloud sessions remain visible. Existing server worker budget, consent, two-minute timeout and cleanup controls remain unchanged. This is a UI routing change, not a new server-wide spending policy.

Unknown submission/worker outcomes and terminal application states block new execution links. Existing server-side extension checks still govern document availability, identity, approvals and actual filling. An employer-page link is not proof of submission.

No paid browser provider was provisioned. No authorized ATS submission API adapter was registered. No new SmartRecruiters adapter or automatic submission was enabled. Current SmartRecruiters matches therefore remain manual after document review. Missing document render/storage services remain an end-to-end extension blocker.

Validation: route unit tests, employer browser worker tests, two Playwright tests for private draft preparation and local-route/cloud gating passed. npm run smoke passed with zero failures and six existing warnings. Public asset build includes the route module.

Release uses the existing scoped production snapshot; only concierge.js, build-public-web.mjs and client/application-execution-route.js were copied for this change.

Production deployment dpl_HTRTLqeLi7BtT4qTt5hKoVCpkZ64 reached READY and was aliased to https://app.1ststep.ai. Live founder session verification opened My Jobs > Preparing > Review package and confirmed the manual employer link points to the saved Avery Dennison SmartRecruiters job. No employer navigation, data transmission or submission was performed. Greenhouse routing and cloud UI gating were verified with synthetic tests, not a live employer submission.

## Transient document handoff

Reviewed text-only packages can now produce a reproducible, integrity-checked PDF when the Greenhouse extension requests a resume. The API uses the saved document version and saved resume SHA-256, reruns the existing DOCX/PDF text and page checks, returns the PDF only through the signed short-lived handoff, and does not persist the transient bytes. Existing private-object-storage artifacts remain the preferred path when present.

This does not bypass package QA: unfinished packages, unresolved QA issues, changed resume text, mismatched document versions, oversized files and integrity failures remain blocked. Submission remains a separate human-controlled step and an employer receipt remains required before Submitted state.

Production deployment `dpl_GWfL3ViaPSZ9SyZxv2DFmzLNppMj` reached READY and was aliased to `https://app.1ststep.ai`. An unauthenticated POST to the live extension endpoint returned the expected origin authorization rejection, confirming the route remains fail-closed. No live employer form was changed.

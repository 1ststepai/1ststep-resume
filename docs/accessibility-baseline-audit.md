# Accessibility Baseline Audit

Date: 2026-04-28

## Scope

- Main app: `index.html`, `app.js`, `style.css`
- Funnel: `funnel.html`
- Admin surface: `admin.html`
- Extension UI: `1ststep-extension/popup.html`, `1ststep-extension/sidepanel.html`
- Regression guardrails: `scripts/smoke-test.cjs`

## Functionality Map

- Resume tailoring: `fileInput`, `fileDrop`, `resumeText`, `jobText`, `runBtn`, `resultsPanel`, `resumeOutput`, `coverOutput`
- Results and tools: before/after diff modal, interview prep modal, template picker, result action bar, Resume Vault, Job Tracker
- App state: `1ststep_profile`, `1ststep_tailor_history`, `1ststep_resume`, `1ststep_sub_cache`, `1ststep_beta`, `1ststep_tpl_contact`
- Extension handoff: `jobCaptureId`, `1STSTEP_JOB_CAPTURE`, `1ststep_pending_capture`, `EXTENSION_JOB_CAPTURED`
- Funnel flow: upload, loading, blurred result, email capture, paywall CTA
- Admin flow: password gate, dashboard stats, signup table refresh

## Baseline Findings

### Critical

- Several form controls relied on placeholder text or nearby visual text rather than programmatically connected labels.
- Multiple modal overlays lacked `role="dialog"`, `aria-modal`, and a named heading relationship.
- Icon-only dismissal and help controls had weak or missing accessible names.

### Serious

- Dynamic UI updates for upload success, job capture, progress, results, errors, and toasts were not consistently exposed through live regions.
- Existing clickable `div` controls were mouse-accessible but not keyboard-accessible.
- Extension popup and sidepanel form controls needed explicit labels.

### Moderate

- Focus styling was inconsistent across app/funnel/admin/extension surfaces.
- Heading structure had early skipped levels on the main app and no page-level heading in the funnel.

### Minor

- Accessibility regression checks were missing from the existing smoke test.
- Some decorative SVG icons were exposed implicitly where surrounding text already carried the meaning.

## Safe Remediation Approach

- Preserve all existing IDs, routes, URL params, storage keys, message names, Stripe links, event handlers, and core UI structure.
- Prefer additive HTML attributes, labels, `aria-live`, `role`, `aria-labelledby`, and keyboard listeners.
- Avoid focus traps unless separately tested.

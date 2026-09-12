# Chrome extension product audit — NextRaise comparison

Audited September 8, 2026. This is a clean-room product comparison: public product behavior and the public extension package were inspected, but no third-party source was copied into 1stStep.

## Observed NextRaise strengths

- Clear in-page job match and next actions.
- User-triggered job saving, autofill, and job tracking.
- Visible filled-versus-total progress and highlighted fields that remain.
- Reuse of recurring answers, referral/outreach assistance, reminders, and follow-up tracking.
- Broad job-board/ATS marketing and a persistent browser-side workflow.

Official product references: [homepage](https://nextraise.ai/), [features](https://nextraise.ai/features), [job search](https://nextraise.ai/features/linkedin-search), [referrals](https://nextraise.ai/features/insider-referrals), [privacy](https://nextraise.ai/privacy), and [terms](https://nextraise.ai/terms).

The homepage makes the product strategy especially clear: one unified feed, per-job qualification scoring, ATS/resume checks, role-specific tailoring, visible application completion, referrals, and tracking. Its strongest efficiency signal is not merely autofill; it is the ordered workflow of deciding whether a role is worth pursuing before spending time tailoring or applying. That reinforces 1stStep's deterministic qualification gate and evidence-backed time-saved gauge. Match explanations should remain traceable to verified applicant evidence rather than adopting an unexplained percentage.

## Patterns intentionally not adopted

Static inspection of the public v2.7 package found an all-sites/all-frames content script, broad tabs/windows/web-navigation/file permissions, cookie access, direct extraction of a site session token, LinkedIn private Voyager requests using the signed-in browser session, and multiple analytics/telemetry destinations. 1stStep does not need those behaviors to capture a user-selected job or perform its controlled Greenhouse handoff.

1stStep also does not adopt generic auto-submit, success-text-as-receipt, local storage of applicant answers, opaque local match guesses, or unrestricted form-agent behavior. Employer receipt remains the only authoritative evidence of submission.

## Adopted in the v1.6.0 candidate

- One shared, explicit active-tab capture path for the toolbar and page menu.
- Page-menu actions for Resume Builder and Job Agent review.
- `Alt+Shift+1` shortcut to open the extension.
- Per-tab `JOB`/`?` capability badge after explicit capture.
- Persistent Greenhouse fill summary with approved-field progress.
- Highlighting for required fields that remain incomplete.
- Stronger hidden/honeypot/disabled/read-only field exclusion.
- Explicit “Nothing was submitted” feedback after every assisted fill.

The added `contextMenus` permission is narrow and user-triggered. Host permissions remain limited to Greenhouse and `app.1ststep.ai`; there is still no cookies, browsing-history, downloads, debugger, or all-sites host permission.

## What should come next

1. Collect authorized, current fixtures for the next ATS instead of claiming generic autofill coverage. Lever is the best next controlled adapter candidate because capture already works and its ordinary form surface is comparatively stable.
2. Reuse only verified Answer Vault facts through the existing server authorization path; never create a second browser-side answer store.
3. Feed confirmed extension completion keys into the existing evidence-backed time-saved model. Attempted, failed, blocked, or merely detected fields must remain excluded.
4. Keep CAPTCHA, OTP, identity, certification, consequential questions, and final submission in Needs You until a compliant, independently verified path exists.
5. Require unpacked-browser proof, synthetic adapter proof, reproducible package hash, privacy/permission review, and an explicitly authorized store submission for each release.

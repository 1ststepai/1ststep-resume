# Controlled-beta permission justifications

- `storage`: holds only a job-posting handoff for up to 24 hours and the non-sensitive current detected job; never profile, résumé, auth token, answers, or application status.
- `activeTab` and `scripting`: inspect job-posting content only on the page where the user invokes the extension. `activeTab` is temporary and does not grant persistent access to browsing activity.
- The extension uses the Tabs API to open or focus 1stStep.ai, but does not request the broader `tabs` permission. The existing 1stStep.ai host permission is enough to locate the signed-in app tab.
- `sidePanel`: gives the user a persistent capture, review, and save surface while browsing job postings.
- `https://*.greenhouse.io/*`: value-free schema detection and user-initiated filling on the exact verified hosted Greenhouse requisition.
- `https://app.1ststep.ai/*`: same-origin signed-session bridge. The extension never receives the session cookie or token.

No wildcard web-accessible resources, browsing-history permission, downloads permission, cookies permission, debugger permission, or cross-ATS host access is requested.

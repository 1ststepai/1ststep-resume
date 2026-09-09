# Controlled-beta permission justifications

- `storage`: holds only a job-posting handoff for up to 24 hours and the non-sensitive current detected job; never profile, résumé, auth token, answers, or application status.
- `activeTab`: grants temporary access to the page only after the user clicks the extension, so visible job details can be captured without permanent access to every site.
- `scripting`: injects the packaged, local-only job capture script into that user-selected active tab. It does not load remote code or run in the background on arbitrary sites.
- The extension uses the Tabs API to open or focus 1stStep.ai, but does not request the broader `tabs` permission. The existing 1stStep.ai host permission is enough to locate the signed-in app tab.
- `contextMenus`: adds explicit “Use this job” and “Review with Job Agent” actions to the page menu. Those clicks use the same temporary `activeTab` capture path as the toolbar and do not enable background monitoring.
- `https://*.greenhouse.io/*`: value-free schema detection and user-initiated filling on the exact verified hosted Greenhouse requisition.
- `https://app.1ststep.ai/*`: same-origin signed-session bridge. The extension never receives the session cookie or token.

No all-sites host permission, wildcard web-accessible resources, browsing-history permission, downloads permission, cookies permission, debugger permission, or cross-ATS form-filling access is requested.

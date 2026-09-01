# Controlled-beta permission justifications

- `storage`: holds only a two-minute job-capture handoff and the non-sensitive current detected job; never profile, résumé, auth token, answers, or application status.
- `activeTab` and `tabs`: locate the user-selected Greenhouse page and the open signed-in 1stStep tab, or open the 1stStep workspace.
- `sidePanel`: retained for the packaged shell; it only directs the user to the account-backed workspace.
- `https://*.greenhouse.io/*`: value-free schema detection and user-initiated filling on the exact verified hosted Greenhouse requisition.
- `https://app.1ststep.ai/*`: same-origin signed-session bridge. The extension never receives the session cookie or token.

No wildcard web-accessible resources, browsing-history permission, downloads permission, cookies permission, debugger permission, or cross-ATS host access is requested.

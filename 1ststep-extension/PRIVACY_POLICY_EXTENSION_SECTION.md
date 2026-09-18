# Draft privacy addendum — counsel review required

The 1stStep Job Agent extension is optional. It can capture job-posting content from the active page after the user clicks Capture and can fill approved ordinary fields on supported application pages.

When the user clicks Auto-fill, the extension reads the exact page URL and a value-free description of visible form controls. Password, file, OTP, CAPTCHA, identity, demographic, protected-trait, certification, conflict, and other consequential controls are not read for their values or filled automatically. The extension does not read browser history, saved passwords, cookies, or values the user already typed.

The extension does not receive an authentication token. An open signed-in 1stStep tab makes a same-origin request using its HttpOnly session. After the server verifies the account, entitlement, consent, exact application, exact Greenhouse requisition, short-lived sharing approval, and exact reusable facts, ordinary values may be returned transiently for the approved controls. Those values are not written to Chrome storage or logs.

Chrome local/session storage is limited to a job-posting handoff kept for up to 24 hours unless it is saved sooner, plus the current non-sensitive detected job while the browser session is open. The extension stores no candidate profile, résumé, account token, employer answer, or application status. It never clicks Submit. Uninstalling removes extension-managed device storage; server account export/deletion remains available through 1stStep.ai subject to the published retention policy.

This draft must be reconciled with the reviewed product Privacy Notice, employer/ATS terms, Chrome Web Store disclosure form, retention schedule, and support contact before publication.

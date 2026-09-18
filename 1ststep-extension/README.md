# 1stStep Job Agent extension

This extension saves job postings to the account-backed Job Agent without copy and paste. On supported application pages, it can also fill approved ordinary fields under user supervision. It does not keep a second profile, résumé, tracker, auth token, password, OTP, CAPTCHA answer, or employer answer in Chrome storage.

## User flow

1. Open a complete job posting and click the extension.
2. Review the detected title and company, then choose **Save to My Jobs**.
3. The extension opens `app.1ststep.ai/concierge` and keeps the capture until secure account saving is confirmed.
4. The Job Agent adds the role as **Found** with employer and apply-path verification still pending.
5. For a Package Ready application on a supported page, approve the exact masked sharing scope before fill.
6. The extension attaches only the exact approved résumé, fills only verified ordinary fields, and never submits. CAPTCHA, OTP, identity, consequential, unknown, or partial-fill steps return to **Needs You**.
7. The tracker cannot show Submitted without an authoritative employer receipt.

## Local verification

```powershell
node scripts/extension-application-handoff-test.mjs
node scripts/extension-security-test.mjs
npm run test:browser:job-agent
```

Load `1ststep-extension` as an unpacked extension only in a synthetic or explicitly authorized beta environment. Production requires `JOB_AGENT_EXTENSION_HANDOFF_ENABLED=true` and a separate server-only `JOB_AGENT_EXTENSION_HANDOFF_SECRET` of at least 32 characters. No provider or submission capability is enabled by this repository change.

## Current boundary

- Supported execution adapter: Greenhouse standard hosted boards only.
- Résumé upload: automatic only for the exact approved `resume_pdf` artifact and a single unambiguous Greenhouse résumé control. Bytes are never written to Chrome storage and completion reports only `resumeDocument`.
- Final submit: never performed by the extension.
- Receipt: must be independently captured and verified by the server workflow.
- Ashby, Lever, SmartRecruiters, iCIMS, and cloud browsers remain later adapters. The Workday adapter was retired on 2026-09-04.

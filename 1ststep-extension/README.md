# 1stStep Job Agent extension — controlled beta

This package is the supervised Greenhouse execution surface for the account-backed Job Agent. It does not keep a second profile, résumé, tracker, auth token, password, OTP, CAPTCHA answer, or employer answer in Chrome storage.

## User flow

1. Sign in to `app.1ststep.ai/concierge` and complete the reusable fact vault.
2. Open a Package Ready application and approve the exact masked sharing scope.
3. Click **Open secure employer page**. The app adds a non-sensitive application-session reference to the URL fragment.
4. Click **Auto-fill** in the extension. The extension sends only the Greenhouse URL and value-free field schema through the signed-in app tab.
5. The server verifies the tenant, entitlement, consent, exact requisition, approval, document version, field schema, and reusable vault facts. It consumes the single-use approval before returning transient ordinary values.
6. The extension retrieves the exact isolated-render-verified résumé under the same two-minute, single-use transmission approval, verifies its SHA-256 in memory, attaches it to the recognized résumé control, fills ordinary fields, and never submits. CAPTCHA, OTP, identity, certification, consequential, unknown, non-résumé file-upload, or partial-fill steps return to **Needs You**.
7. The extension reports only filled/failed field keys. Final submission remains a separate action-time confirmation, and the tracker cannot show Submitted without an authoritative receipt.

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
- Ashby, Lever, Workday, SmartRecruiters, iCIMS, and cloud browsers remain later adapters.

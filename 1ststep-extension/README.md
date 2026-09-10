# 1stStep job capture and Job Agent extension — controlled beta

This package has two explicit user flows: capture the visible job page into the Resume Builder or Job Agent, and supervised Greenhouse filling for an approved Job Agent application. It does not keep a second profile, résumé, tracker, auth token, password, OTP, CAPTCHA answer, or employer answer in Chrome storage.

## Job capture flow

1. Open a job posting and click the extension, press `Alt+Shift+1`, or use the page menu to send the job directly to Resume Builder or Job Agent review.
2. The extension uses the temporary `activeTab` grant to inspect that page only. It prefers JobPosting structured data, then adapters for Workday, Lever, Ashby, SmartRecruiters, and Greenhouse, then visible job-description containers. Accessible embedded frames are checked only during that click. It does not request permanent access to every website.
3. Review or correct the captured title and company, then choose Job Agent or Resume Builder. If the layout is unusual, highlight the description and click the extension again.
4. A unique capture is kept locally for up to 24 hours and removed only after the matching 1stStep page confirms it was saved.

After an explicit capture, the toolbar badge shows `JOB` when a posting was found or `?` when the page needs highlighted-text review. Fill results remain visible on supported pages: approved-field progress, highlighted required fields that still need the applicant, and an explicit reminder that nothing was submitted.

Capture works on ordinary HTTP(S) pages whose job details are available in the rendered document or an accessible embedded frame. It cannot bypass sign-in walls, read browser-internal pages, or guarantee extraction from protected PDFs, inaccessible frames, or closed shadow roots.

## User flow

1. Sign in to `app.1ststep.ai/concierge` and complete the reusable fact vault.
2. Open a Package Ready application and approve the exact masked sharing scope.
3. Click **Open secure employer page**. The app adds a non-sensitive application-session reference to the URL fragment.
4. Click **Auto-fill** in the extension. The extension sends only the Greenhouse URL and value-free field schema through the signed-in app tab.
5. The server verifies the tenant, entitlement, consent, exact requisition, approval, document version, field schema, and reusable vault facts. It consumes the single-use approval before returning transient ordinary values.
6. The extension retrieves the exact isolated-render-verified résumé under the same two-minute, single-use transmission approval, verifies its SHA-256 in memory, attaches it to the recognized résumé control, fills ordinary fields, highlights required fields that remain incomplete, and never submits. CAPTCHA, OTP, identity, certification, consequential, unknown, non-résumé file-upload, or partial-fill steps return to **Needs You**.
7. The extension reports only filled/failed field keys. Final submission remains a separate action-time confirmation, and the tracker cannot show Submitted without an authoritative receipt.

## Local verification

```powershell
node scripts/extension-application-handoff-test.mjs
node scripts/extension-security-test.mjs
npm run test:browser:job-agent
npm run test:extension-unpacked
```

Load `1ststep-extension` as an unpacked extension only in a synthetic or explicitly authorized beta environment. Production requires `JOB_AGENT_EXTENSION_HANDOFF_ENABLED=true` and a separate server-only `JOB_AGENT_EXTENSION_HANDOFF_SECRET` of at least 32 characters. No provider or submission capability is enabled by this repository change.

## Current boundary

- Job capture: user-triggered on the currently selected ordinary HTTP(S) page, with major ATS adapters and highlighted-text fallback; no automatic background browsing and no permanent all-sites host permission.
- Supported execution adapter: Greenhouse standard hosted boards only.
- Résumé upload: automatic only for the exact approved `resume_pdf` artifact and a single unambiguous Greenhouse résumé control. Bytes are never written to Chrome storage and completion reports only `resumeDocument`.
- Final submit: never performed by the extension.
- Receipt: must be independently captured and verified by the server workflow.
- Automated form filling on Ashby, Lever, SmartRecruiters, iCIMS, and Workday is not supported. Their job details can be captured, but capture does not authorize form filling or submission.

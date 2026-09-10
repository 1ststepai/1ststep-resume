# Chrome Web Store data-use form — v1.6 owner checklist

This checklist describes the reviewed v1.6 candidate. The owner must enter and confirm these answers in the Chrome Web Store Developer Dashboard before submitting the exact release package.

## Single purpose

Capture a job listing the user is viewing, send it to the 1stStep.ai Resume Builder or Job Agent, and fill user-approved ordinary fields on specifically supported application pages. The extension never submits an application.

## Data types to disclose

Use the conservative answer when the dashboard wording is broader than the examples below.

- **Website content — Yes.** Job title, employer, location, requisition context, job description, highlighted listing text, page URL, and value-free application-field labels, types, and internal references.
- **Web history — Yes.** The exact job or application page URL is handled for the user-selected workflow. The extension does not collect a general browsing-history log.
- **Personally identifiable information — Yes.** During a separately approved supported-page fill, confirmed ordinary values such as name, email address, telephone number, profile URL, and an approved resume may pass through the extension transiently. They are not retained as an extension-side profile.
- **User activity — Yes, conservatively.** The selected capture method, successful field identifiers, failed field identifiers, and content-free operational events support the requested workflow, recovery, security, and reliability. Entered field values are not included in completion reporting.
- **Authentication information — No.** The extension does not read or store the HTTP-only session cookie, bearer tokens, passwords, passkeys, or one-time codes. An open app page performs same-origin authenticated requests.
- **Health information — No.**
- **Financial and payment information — No.**
- **Precise location — No.** A job's listed workplace location is website content, not the user's device location.
- **Personal communications — No.**

If the current dashboard presents **form data** or **user-provided content** as separate categories, select **Yes** because approved ordinary values and the approved resume are handled transiently during supervised filling.

## Required use certifications

Confirm only while the implementation and public documents remain unchanged:

- Data is used only to provide or improve the disclosed single purpose and related security, reliability, and support operations.
- Data is not sold or transferred to advertising platforms, data brokers, or information resellers.
- Data is not used for personalized advertising, creditworthiness, or lending.
- Human access is prohibited except for specific user-authorized support, security or abuse investigation, legal requirements, or properly aggregated and anonymized internal operations.
- Personal and sensitive data is transmitted over HTTPS. Durable captured-job account records are encrypted at rest and tenant-scoped.

## URLs and reviewer notes

- Privacy policy URL: `https://app.1ststep.ai/privacy`
- Support contact: `support@1ststep.ai`
- Declared hosts: `https://*.greenhouse.io/*` and `https://app.1ststep.ai/*`
- Other job pages are accessed only after an explicit user action through `activeTab` and `scripting`; there is no all-sites host permission.
- Local pending capture handoff: up to 24 hours.
- Signed-in, consented account-backed captured job: encrypted, up to 90 days, exportable and deletable.
- Uninstalling clears extension-controlled local data but does not delete an account record already saved server-side.

## Submission evidence to retain

- Screenshot or export of every completed Privacy practices answer.
- The privacy-policy URL shown in the dashboard.
- The submitted extension version and package SHA-256.
- The final Store listing text and permission justifications.
- The submission timestamp and resulting review decision.

Do not leave the prior **no user data collected** answer selected. Do not submit if the dashboard, listing, privacy policy, permission justifications, manifest, or packaged behavior disagree.

## Official Google references

- https://developer.chrome.com/docs/webstore/program-policies/policies
- https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
- https://developer.chrome.com/docs/webstore/program-policies/limited-use
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

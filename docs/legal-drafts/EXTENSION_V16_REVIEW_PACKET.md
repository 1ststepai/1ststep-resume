# Extension v1.6 disclosure review packet

Status: product-consistency review completed September 9, 2026. This packet is not a legal opinion and does not replace advice from licensed privacy or technology counsel.

## Review request

Please review the v1.6 Chrome extension disclosures for:

1. Chrome Web Store User Data and Limited Use policy alignment.
2. Accurate disclosure of job-page URLs, visible listing content, highlighted text, transient approved-field values, and approved resume bytes.
3. The distinction between the local pending handoff and the consented account-backed captured-job record.
4. Retention, export, deletion, human-access, service-provider, and security language.
5. U.S. federal and state privacy-law accuracy for the product's actual users and scale.
6. Employer-site and applicant-tracking-system terms risks for user-triggered capture and supervised filling.

## Product facts verified in source

- Manifest v3, version 1.6.0.
- Permissions: `storage`, `activeTab`, `scripting`, and `contextMenus`.
- Declared hosts: `https://*.greenhouse.io/*` and `https://app.1ststep.ai/*`.
- No all-sites, cookies, history, downloads, debugger, or broad `tabs` permission.
- Declared Greenhouse pages are detected locally while enabled; other pages are read only after an explicit user action.
- Website content is sent to 1stStep.ai only after a user chooses Resume Builder, Job Agent, or supervised filling.
- A pending local capture may remain for up to 24 hours.
- A durable captured-job account record requires a signed-in user and current Job Agent data consent; it is tenant-scoped, encrypted at rest, exportable, deletable, and expires after 90 days.
- An unauthorized Resume Builder-only handoff does not create the durable account record.
- Approved ordinary values and an approved resume may pass through the extension transiently during a separately approved supported-page fill.
- Passwords, passkeys, OTPs, CAPTCHA answers, signatures, attestations, protected-trait answers, and final-submit controls are excluded.
- The extension never performs final submission.

## Documents to review together

- `privacy.html`
- `terms.html`
- `1ststep-extension/STORE_LISTING.md`
- `1ststep-extension/PERMISSION_JUSTIFICATIONS.md`
- `1ststep-extension/CHROME_WEB_STORE_DATA_USE_FORM.md`
- `1ststep-extension/manifest.json`

## Product-consistency corrections already made

- Removed claims that v1.6 accepts manual job-description paste.
- Removed the disabled cover-letter shortcut from extension disclosures.
- Replaced Greenhouse-only capture wording with the actual user-triggered cross-site capture behavior while keeping filling specifically supported.
- Disclosed automatic local detection only on declared Greenhouse hosts.
- Distinguished the 24-hour pending local handoff from the consented 90-day encrypted account record.
- Clarified that approved PII and resume bytes may pass through the extension transiently during supervised filling even though they are not retained in extension storage.
- Prepared conservative Chrome Web Store data-use selections instead of the false prior `no user data collected` answer.

## Official policy references

- https://developer.chrome.com/docs/webstore/program-policies/policies
- https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
- https://developer.chrome.com/docs/webstore/program-policies/limited-use
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/webstore/review-process

## Acceptance record

Record the reviewing attorney's name, jurisdiction, date, approved redline or written approval, and any required operational changes. If either policy document changes, recompute its SHA-256, update the policy version used by the deploy target, and rerun the policy-bundle and extension-release gates before deployment.

# Chrome Web Store — Permission Justifications

The CWS review console will ask for a justification for each permission you declare. Paste the answers below into the matching field.

---

## `storage`

Used to cache the user's authentication token from 1ststep.ai and remember UI state (last-used tier, last detected job) between popup opens so the user doesn't see a blank screen every time they click the icon.

## `scripting`

Used to programmatically inject the form-fill logic into the active tab when the user clicks "Auto-fill This Form" in the popup. Required because some Applicant Tracking Systems load their form inside an iframe or dynamically after navigation, so a static content script alone isn't sufficient.

## `activeTab`

Used to read the current tab's URL and page DOM only when the user explicitly clicks the extension icon, so we can detect whether we're on a job posting or an application form and scan only that page's form fields.

## `sidePanel`

Used to display the extension's side panel UI with job details, tailoring options, and application status. The side panel is user-invoked and shows the same job context the popup does, in a larger surface.

## `tabs`

Used to query the URL of the active tab when the popup opens, so we can classify the page type (listing vs. apply form vs. unsupported) and show the correct UI state. We do not read URLs of non-active tabs or maintain a browsing history.

---

## Host permissions — each Applicant Tracking System domain

Used to read the job description and fill the application form fields on well-known Applicant Tracking Systems that our users apply to. Each listed host is an ATS our target users (job seekers) apply on:

- `https://www.linkedin.com/*` — LinkedIn Easy Apply + job descriptions
- `https://www.indeed.com/*` — Indeed apply forms + job descriptions
- `https://*.greenhouse.io/*` — Greenhouse.io-hosted boards (boards, my, job-boards subdomains)
- `https://*.lever.co/*`, `https://*.lever.com/*` — Lever-hosted job boards
- `https://*.workday.com/*`, `https://*.myworkdayjobs.com/*` — Workday apply flows
- `https://*.icims.com/*` — iCIMS career sites
- `https://*.taleo.net/*` — Oracle Taleo career sites
- `https://*.ashbyhq.com/*` — Ashby-hosted job boards
- `https://*.jobvite.com/*` — Jobvite career sites
- `https://*.smartrecruiters.com/*` — SmartRecruiters-hosted job boards

The extension only activates on these domains. It does not read or modify any other website.

---

## Host permission — `https://app.1ststep.ai/*`

Used to read the user's authentication token from 1ststep.ai via a postMessage bridge injected only on the 1ststep.ai origin. This lets users sign in once on our website and have the extension automatically authenticated, so they are not forced to log in twice.

---

## Remote code usage

The extension does **not** load, execute, or inject remote code. All scripts are bundled with the extension (`content.js`, `background.js`, `popup.js`, `sidepanel.js`, `auth-bridge.js`, `sites/*.js`, `utils/*.js`). Form-fill values are received as a JSON map from our own backend at `https://app.1ststep.ai/api/claude` — no remote code is fetched or executed.

---

## Data handling disclosure (asked during publishing)

The extension reads the following user data:
- Job description text from the currently active job posting (sent to 1stStep.ai's backend to generate the autofill map or tailored resume)
- Application form field names/labels from the currently active apply form (sent to the same endpoint so AI can map profile values to the correct fields)
- The user's 1ststep.ai auth token (read only on 1ststep.ai origin, used only to authenticate calls to 1ststep.ai's own backend)

The extension does **not** collect:
- Browsing history
- Website content outside the supported ATS domains
- Any personally identifying information beyond what the user has entered into their own 1ststep.ai profile
- Any data for advertising purposes

The extension does **not** sell user data and does **not** transfer user data to third parties (other than the user's own 1ststep.ai account backend).

# Privacy Policy — Chrome Extension Addendum

Add this section to the existing privacy policy at `https://1ststep.ai/privacy`. The Chrome Web Store requires a public privacy policy URL for any extension that handles user data; 1stStep.ai's extension does.

---

## 1stStep.ai Chrome Extension

*Last updated: April 24, 2026*

The 1stStep.ai browser extension ("Extension") is an optional companion to your 1stStep.ai account. This section describes what the Extension accesses on your behalf and how that data is used.

### What the Extension reads

The Extension activates **only** on the following domains:

- `linkedin.com`, `indeed.com`
- `*.greenhouse.io`, `*.lever.co`, `*.lever.com`
- `*.workday.com`, `*.myworkdayjobs.com`
- `*.icims.com`, `*.taleo.net`, `*.ashbyhq.com`
- `*.jobvite.com`, `*.smartrecruiters.com`
- `app.1ststep.ai` (solely to read your login session)

On any other website, the Extension does nothing.

When you explicitly click **"Tailor Resume"** or **"Auto-fill This Form"**, the Extension may read:

- The **job description text** displayed on the page you are viewing
- The **labels and names of the form fields** on the application form (not any values you have typed into them)
- Your **1stStep.ai authentication token**, so it can make calls to your 1stStep.ai account on your behalf

The Extension does **not** read your browsing history, content on unrelated websites, cookies from other sites, or your saved passwords.

### What the Extension sends

When you click Tailor Resume or Auto-fill, the Extension sends the following to our backend at `https://app.1ststep.ai/api/claude`:

- Your authentication token (to identify your account)
- The job description (to tailor your resume or map profile values to the correct fields)
- The form field labels (for autofill)
- Your profile and resume data, which are already stored in your 1stStep.ai account

### What happens to that data on our server

Request content is used only to generate the response you asked for (a tailored resume, a cover letter, or an autofill map) and to enforce monthly usage limits on a per-IP basis. We do not sell this data, share it with advertisers, or use it to train third-party AI models outside of the direct request.

### What the Extension stores locally

The Extension stores the following in Chrome's local storage on your device:

- Your authentication token (copied from your 1ststep.ai session so you don't have to sign in twice)
- UI preferences (last-selected tier, recent job)

You can clear all of this at any time by right-clicking the Extension icon → **Manage extension** → **Clear storage**, or by uninstalling the Extension.

### Your rights

You can:

- Uninstall the Extension at any time via `chrome://extensions`. Uninstalling removes all locally stored Extension data immediately.
- Delete your 1stStep.ai account at any time via your account settings. Account deletion removes your profile, resume, and all associated data from our servers.
- Email `evan@1ststep.ai` with any data access, correction, or deletion request.

### Contact

Questions about the Extension: `evan@1ststep.ai`

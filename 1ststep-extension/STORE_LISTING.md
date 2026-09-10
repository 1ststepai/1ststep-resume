# Draft Chrome Web Store listing

## 1stStep.ai Job Agent

Save a job posting to My Jobs in one click—without copying and pasting the description. 1stStep captures the visible job details, opens your Job Agent, and prepares the next step. You can also send the job directly to Resume Builder.

On declared Greenhouse job pages, the extension detects the listing locally while enabled, rechecks after in-page navigation, and shows a shortcut to open the job in 1stStep.ai. On other websites it reads the current page only after you click the extension or its page-menu action. That user-triggered read may inspect embedded frames when a listing is rendered inside one. The page URL and selected listing content are sent to 1stStep.ai only after you choose Resume Builder, Job Agent, or supervised filling.

On supported application pages, 1stStep can fill an approved résumé and ordinary verified fields after you review the match. It pauses for passwords, one-time codes, CAPTCHAs, identity checks, sensitive questions, unusual questions, and final submission.

Chrome extension storage does not keep your profile, résumé, sign-in token, answers, or application status. Approved values and an approved résumé may pass through the extension transiently during a supervised fill. It never marks an application Submitted without verified employer receipt.

With a signed-in account and current Job Agent data consent, jobs you save to your account remain available when you return. Each account-backed capture holds the listing's title, employer, location, URL, description text, capture method, and verification status; it is encrypted and expires automatically after 90 days. You can export or delete these records, and account deletion removes them. Without that authorization, a Resume Builder handoff remains only in local extension storage for up to 24 hours while delivery is pending. Uninstalling the extension does not delete jobs already saved to your account.

Job capture works on ordinary web pages with visible job content. Protected pages and inaccessible embedded content may prevent capture. Filling requires a supported page, an eligible Job Agent account, approved information, and an open signed-in `app.1ststep.ai` tab.

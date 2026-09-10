# Synthetic testing guide

Do not test this beta against a real employer without explicit authorization and reviewed release evidence.

Run `npm run test:extension-release`, `npm run test:extension-unpacked`, and `npm run smoke` from the app repository.

Before release, test an unpacked upgrade with existing `pendingJobs`, `current_job`, and status-cache data. Confirm those records remain readable and expire normally.

Signed-in acceptance must cover both paths:

1. Capture a public job page, choose Resume Builder, confirm the description appears without copy and paste, reload the exact capture URL, and confirm the account-backed job restores.
2. Capture a job for Job Agent. Confirm a supported public posting is reverified before it becomes eligible for preparation. Confirm an unsupported page stays marked unverified with automation off.

On a supported synthetic application fixture, verify that approved ordinary fields fill, file/CAPTCHA/OTP/consequential fields remain untouched, and no Submit control is clicked. A preserved form checkpoint is not a submission receipt.

Do not upload to the Chrome Web Store until the packaged ZIP hash is pinned, the live app assets match the candidate, and the signed-in production acceptance passes.

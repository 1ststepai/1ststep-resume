# Synthetic testing guide

Do not test this beta against a real employer without explicit authorization and reviewed release evidence.

Run the repository tests listed in `README.md`. Browser acceptance should use a synthetic Greenhouse-shaped page with fake names and `example.test` addresses, verify that ordinary fields fill, verify that file/CAPTCHA/OTP/consequential fields remain untouched, and verify that no Submit control is clicked. Confirm the durable application session records a preserved checkpoint but no receipt and no Submitted status.

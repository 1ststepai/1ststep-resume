# 2026-09-18 — Tester admin chrome and Accept & start

## Changed
- Accept & start now renders the owner-reviewed four-line consent disclosure instead of requiring the older two-line shape, which had left the grant button disabled.
- Preview invite matching now accepts semicolon-separated tenant IDs so Windows deploys do not drop the allowlist.
- Isolated Preview now binds the invite HMAC to the same Preview partition secret used at runtime, so invited Gmail testers are not compared against a different hash.
- Accept & start stays clickable whenever the server has a configured policy, even if the on-screen policy text fails to refresh.

## Why
- epancis12@gmail.com saw Admin because Preview overrode OWNER_ACCESS_EMAILS to that Gmail.
- The consent modal showed fallback HTML and would not grant because the client rejected a four-item policy scope.

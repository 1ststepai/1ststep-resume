# Repo reconciliation notes

Running notes for the effort to make git accurately represent the production
application. Append findings; do not rewrite history here.

## 2026-08-31 — Legal-policy documents are byte-pinned

**Legal-policy documents are byte-pinned. Cosmetic edits and line-ending
normalization can invalidate policy verification. Treat pinned documents as
controlled artifacts, not ordinary frontend files.**

### What is pinned
`terms.html` and `privacy.html` only. Their SHA-256 digests are checked into
`lib/job-agent-policy-bundle.js` (`JOB_AGENT_POLICY_STATIC_DOCUMENTS`) and
enforced by `scripts/verify-job-agent-policy-bundle.mjs`, which is the **first**
script in the `pretest:concierge` chain. A byte change fails the whole suite.

The assertion states the required process:
> "…changed. Have counsel review it, update its policy version, then
> intentionally update the checked-in digest."

No other repository file carries a checked-in content digest (verified by
searching `lib/*.js` for 64-hex `sha256:` constants).

### Incident that produced this note
A two-line hyperlink change ("← Back to app" → `/app`) was applied to both files
on 2026-08-31. It broke the digest check immediately. The files were restored
byte-for-byte from pre-edit backups; both digests now match and the verifier
passes. **The link defect on those two pages remains unfixed by design** — the
correct route is counsel review, a policy version bump, then an intentional
digest update.

### Second, independent defect found while investigating
The approved digest corresponds to the **CRLF** bytes of each file. Git `HEAD`
stores both files with **LF** (`CRLF=0`). Therefore:

> **A fresh clone of HEAD fails `verify-job-agent-policy-bundle.mjs`.**
> The repository as committed cannot pass its own policy check.

This is a reproducibility defect, not a cosmetic one. Committing the working-tree
(CRLF) versions with `terms.html -text` / `privacy.html -text` in `.gitattributes`
resolves it: git stores the approved bytes verbatim and a clone verifies.

### Rules going forward
1. Never edit `terms.html` or `privacy.html` for cosmetic or structural reasons.
2. Never let line-ending normalization touch them — they are `-text` in `.gitattributes`.
3. Never update a checked-in digest to make a test pass. The digest is the control.
4. Any change follows: counsel review → policy version bump → intentional digest update.
5. If a new digest-pinned artifact is introduced, add it to `.gitattributes` as `-text`
   and record it here.

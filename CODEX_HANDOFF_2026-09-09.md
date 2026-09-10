# Codex handoff — v1.6 extension release gates

**From:** Claude Code session, 2026-09-09
**Branch:** `feature/extension-efficiency-controls` (worktree `fix-extension-job-capture-20260908/`)
**Remote:** pushed, in sync — `origin/feature/extension-efficiency-controls`, 8 ahead of `origin/main`, 0 behind

---

## 1. Where things actually stand

`main` is still extension **v1.5.0**. All of the v1.6 durable-capture work lives only on this
branch. Nothing about it has been deployed, and no CI has ever run against it.

| Thing | State |
|---|---|
| v1.6 extension code + capture API | on branch, unmerged |
| Privacy policy / store docs | reconciled with the code (this session) |
| Node test suite | 16/16 pass locally |
| Playwright specs | **never run, anywhere** |
| GitHub Actions (`qa`, `codeql`, `production-readiness`) | **never run on this work** |
| Chrome Web Store data-use form | **not filled in — still says the old answer** |

The two commits added this session:

- `c66c397` Align extension disclosures with durable capture storage
- `ac8d589` Merge `origin/main` (clean, no conflicts)

---

## 2. What this session changed and why

v1.6 made captured jobs **durable server-side records** — `lib/captured-job-store.js`,
`TTL_SECONDS = 90 * 24 * 60 * 60`, encrypted, tenant-scoped, written through
`api/captured-jobs.js`. The user-facing disclosures had not been updated and still described
captures as short-lived browser-only handoffs. That is a false statement to users and a Chrome
Web Store rejection.

Fixed in three documents:

- **`privacy.html`** — retention (§5), local-storage description (§7), capture scope, single-purpose
  statement, the `activeTab`/`scripting` explanation, and the permission table. The old table
  listed `tabs` and `sidePanel`, **neither of which the manifest requests**; it now lists the real
  four (`activeTab`, `scripting`, `storage`, `contextMenus`) plus a declared-hosts row naming
  `*.greenhouse.io` explicitly.
- **`1ststep-extension/PERMISSION_JUSTIFICATIONS.md`** — the `storage` bullet keeps its correct
  24-hour local handoff claim (`CAPTURE_TTL_MS` in `background.js`/`auth-bridge.js`) and now also
  states the 90-day server-side record.
- **`1ststep-extension/STORE_LISTING.md`** — new plain-language paragraph: fields kept, 90-day
  expiry, export/delete, uninstall does not delete.

**New guard: `scripts/privacy-policy-drift-test.mjs`** (wired into `test:extension-release`, which
`release:gate` already runs). It asserts:

1. the policy's permission table set-equals `manifest.json` permissions;
2. every `host_permissions` domain is named in the policy;
3. every `N days` figure in any capture-related block of all three documents equals `TTL_SECONDS`,
   parsed from source — no hardcoded 90;
4. the policy cannot regress to "short-lived handoff" wording.

Mutation-tested: changing the TTL, adding a manifest permission, or reverting the wording each
fail it with a specific message.

> **If you change `TTL_SECONDS`, this test fails until all three documents are updated.**
> That is deliberate. Update the docs, don't weaken the test.

---

## 3. Work queue, in order

### 3.1 Open the PR into `main`
This is the first time CI touches these 8 commits. `qa`, `codeql`, and `production-readiness` all
trigger on `pull_request: branches: [main]` only.

```bash
gh pr create --base main --head feature/extension-efficiency-controls \
  --title "v1.6 Job Agent extension: durable capture + reconciled disclosures"
```

**Acceptance:** all four workflows green. Expect surprises — they have never run on this code.

### 3.2 Run the Playwright specs
```bash
npm run test:extension-release
```
Runs 9 node tests (known green) then five browser specs that have **never been executed**:
`extension-popup`, `generic-job-capture`, `greenhouse-extension`, `concierge-job-capture`,
`resume-capture-restore`.

**Acceptance:** all five pass, or failures triaged as fixture-only with written justification.

### 3.3 Confirm capture storage is configured in the deploy target
`api/captured-jobs.js` returns **503 `CAPTURE_STORAGE_NOT_CONFIGURED`** when
`jobAgentRuntimeConfiguration()` returns null. If the Redis/KV binding is missing in production,
every capture fails at runtime with a green build. Verify the env before deploying, not after.

**Acceptance:** a signed-in `POST /api/captured-jobs` returns 200 in the deploy target.

### 3.4 Merge and deploy — **requires explicit owner approval**
Per `CLAUDE.md`: do not deploy unless asked. Evan approves the release decision.

### 3.5 Gate 3 — signed-in workflow end to end
Sign in as `evan@1ststep.ai`, capture → review → tailor → fill on a supported page.
**Acceptance:** captured job persists across a sign-out/sign-in cycle (this is the durable-store
behaviour; it did not work before v1.6), and no consequential field is ever filled.

### 3.6 Gate 4 — real, current job pages
Not fixtures. Cover the tuned extractors (Greenhouse, Lever, Workday, Ashby, SmartRecruiters) and
the generic fallback (highlighted text, visible page).
**Acceptance:** capture succeeds or degrades to a clear message; never a silent failure.

### 3.7 Gate 5 — install the packaged build from the store
```bash
npm run build:extension:controlled
```
Install **that exact zip**, not the unpacked directory, and repeat 3.5–3.6.
`RELEASE_FILES` in `scripts/build-controlled-extension.mjs` is a ten-file allowlist; the package
is content-hashed into `RELEASE-INTEGRITY.json`.

### 3.8 Gate 6 — monitoring and rollback
`npm run test:rollback-preflight` and `npm run test:preview-log-evidence` exist. Confirm they cover
the capture endpoint specifically.

---

## 4. Owner-only — cannot be done by an agent

**Chrome Web Store data-use disclosure form.** It must declare durable server-side storage of
job-listing content. The default "no data collected" answer is now false, and this is the item
most likely to get the submission rejected. The policy and listing text are ready; the form is not.

---

## 5. Optional cleanups (verified, low value, do not block release)

- `1ststep-extension/sidepanel.html` is unused — no `side_panel` manifest key, no code reference,
  and it is **not** in `RELEASE_FILES`, so it never ships. Safe to delete; not a packaging defect.
- `privacy-policy-drift-test.mjs` could also assert `EXTENSION_STATUS.md` and `README.md`. I scoped
  it to the three documents that make retention claims so the suite stays green.

---

## 6. Traps hit this session — will cost you time

- **`sed -i` rewrites CRLF as LF.** `privacy.html` has mixed line endings; a `sed -i` one-liner
  turned a 14-line diff into 271/271. Use Python with `io.open(..., newline='')` for that file.
- **`lean-ctx` compresses tool output** and silently truncates long file lists. `git diff
  --name-only | head -40` returned three entries. Redirect to a file and read it back when the
  full list matters.
- **Heredocs into Python** through the shell wrapper mangled backslash escapes twice. Write the
  script to the scratchpad as a file and run it.
- **This branch has taken drive-by commits before** (Sep 8, commit `8a32c8c` swept `index.html` and
  the build script in mid-session). Commit narrowly — `git add <paths>`, never `git add -A`.

---

## 7. Boundaries

- Do not touch `codex/career-profile-schema-20260908` or any other agent's branch.
- Local `main` equals `origin/main` and was not modified by this session.
- Do not force-push. The branch is shared.
- Do not change the 90-day TTL, the permission set, or the declared hosts without updating all
  three disclosure documents in the same commit.

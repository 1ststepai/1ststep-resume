> **DRAFT — NOT LEGAL ADVICE — NOTHING IN THIS DIRECTORY IS APPROVED OR IN EFFECT**

# Job Agent — Counsel Review Checklist and Integration Runbook

**Purpose:** give counsel the factual and technical context needed to review the drafts in
this directory, and give engineering an exact, ordered procedure for integrating approved
language once — and only once — counsel has signed off.

---

## Part 1 — Current state

| Item | State |
|---|---|
| `terms.html` | Live. Contains **no** Job Agent coverage. Zero matches for job agent, automated, on your behalf, or submission. |
| `privacy.html` | Live. Mentions retention, encryption, third parties generically. **No** Job Agent specific content. |
| `JOB_AGENT_TERMS_ADDENDUM_DRAFT.md` | Draft only. Not served, not linked, not referenced. |
| `JOB_AGENT_PRIVACY_ADDENDUM_DRAFT.md` | Draft only. Not served, not linked, not referenced. |
| `JOB_AGENT_COUNSEL_APPROVED` | **Unset.** Consent granting is fail-closed. |
| `JOB_AGENT_TERMS_VERSION` | Unset in Production. |
| `JOB_AGENT_PRIVACY_VERSION` | Unset in Production. |
| `JOB_AGENT_AUTHORIZATION_VERSION` | Unset in Production. |
| Job Agent consent flow | Blocked. `grantJobAgentConsent` throws while policy is not ready. |
| Final submission | Disabled product-wide. |
| Personal-data transmission | Disabled; requires action-time confirmation. |

**The gap counsel must close:** the consent modal asks users to accept the Terms and
acknowledge the Privacy Policy as the legal basis for Job Agent activity, but neither live
document describes that activity.

## Part 2 — How consent is technically bound

Understanding this matters, because it constrains how documents may change.

1. `lib/job-agent-policy-bundle.js` pins a **SHA-256 digest** of each live document:
   ```
   terms:   /terms    dd6e1c31…66a9
   privacy: /privacy  3a59ab93…7105
   ```
2. `scripts/verify-job-agent-policy-bundle.mjs` fails if either file changes without an
   intentional digest update. **It currently passes.**
3. `jobAgentConsentPolicyConfiguration()` requires all three version strings (matching
   `^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$`) **and** `JOB_AGENT_COUNSEL_APPROVED=true`.
4. A stored consent record embeds the exact versions and digests it was granted against.

**Consequence:** editing `terms.html` or `privacy.html` without updating the pinned digests
breaks the build check by design. Silent policy edits are not possible.

**Consequence:** a user's stored consent is bound to the document text they actually saw. If
the text changes materially, prior consent no longer matches the current bundle, which is
the mechanism for requiring re-acceptance.

## Part 3 — Review checklist

### Terms addendum
- [ ] §2 agency scope — is the authorization adequately bounded and terminable?
- [ ] §3 preparation / transmission / submission separation — legally sufficient?
- [ ] §4 action-time confirmation — should this be a binding commitment or a description?
- [ ] §5 accuracy responsibility — defensible where the platform drafts the text?
- [ ] §6 non-inference list — complete for the target jurisdictions?
- [ ] §7 credentials, CAPTCHA, OTP — need anti-circumvention language?
- [ ] §8 no-guarantee — sufficient under applicable consumer-protection law?
- [ ] §9 employer/ATS third-party terms — allocation of responsibility correct?
- [ ] §10 prohibited use — enforceable?
- [ ] §11 receipt-verified status — any representation risk?
- [ ] §12 revocation — prospective-only framing acceptable?
- [ ] §13 beta limitations, suspension, discontinuation
- [ ] §14 fees — confirm nothing here authorizes a charge
- [ ] Employment-agency or recruiting licensure implications in any target jurisdiction
- [ ] Arbitration / governing law / liability — restate or extend from main Terms?

### Privacy addendum
- [ ] §1 fact vault — confirm-before-reuse model adequately described
- [ ] §5 data categories — complete and accurate
- [ ] §6 non-storage of passwords, OTPs, CAPTCHA answers — verify claim matches code
- [ ] §7 protected traits — default-unanswered and no-ranking commitments
- [ ] §8 encryption claims — verify each against implementation before publishing
- [ ] §10 retention — set exact durations
- [ ] §11 subprocessors — name individually? change notification?
- [ ] §12 minimization
- [ ] §13 security limitations — confirm no unverified certification is implied
- [ ] §14 rights, contact route, response timelines
- [ ] GDPR lawful basis per purpose
- [ ] CCPA/CPRA sale/share position and sensitive-PI treatment
- [ ] Automated decision-making disclosure
- [ ] International transfer mechanism
- [ ] DPIA required before widening the beta?

### Cross-cutting
- [ ] Every factual claim in both drafts verified against actual behavior
- [ ] Marketing copy on the homepage consistent with the approved terms
- [ ] Extension data-use representations consistent with the Chrome Web Store listing
- [ ] Re-acceptance required for existing users?

## Part 4 — Integration procedure (only after written counsel approval)

**Do not begin any step until counsel supplies final approved text.**

1. **Receive final text** from counsel, with an explicit statement of what was approved and
   the version label for each document.

2. **Update the live documents.** Edit `terms.html` and `privacy.html` with the approved
   language. Do not paraphrase; use the supplied text verbatim.

3. **Recompute and update the pinned digests** in `lib/job-agent-policy-bundle.js`:
   ```bash
   node -e "const {createHash}=require('crypto'),fs=require('fs');for(const f of ['terms.html','privacy.html'])console.log(f,createHash('sha256').update(fs.readFileSync(f)).digest('hex'))"
   ```
   Replace the `sha256` values in `JOB_AGENT_POLICY_STATIC_DOCUMENTS`.

4. **Verify the bundle:**
   ```bash
   node scripts/verify-job-agent-policy-bundle.mjs
   ```
   This must pass before proceeding.

5. **Choose version labels.** They must match `^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$` and must
   change whenever the corresponding text changes. Suggested convention:
   `terms-2026-09-v1`, `privacy-2026-09-v1`, `authorization-2026-09-v1`.

6. **Set Production environment variables** (all non-secret):
   ```bash
   npx vercel env add JOB_AGENT_TERMS_VERSION production
   npx vercel env add JOB_AGENT_PRIVACY_VERSION production
   npx vercel env add JOB_AGENT_AUTHORIZATION_VERSION production
   ```

7. **Set the counsel attestation — a human decision, never an automated one:**
   ```bash
   npx vercel env add JOB_AGENT_COUNSEL_APPROVED production   # value: true
   ```
   This asserts that qualified counsel approved the exact served text. It must be set by a
   person with authority to make that assertion.

8. **Re-acceptance.** Because stored consent embeds the version and digest it was granted
   against, users whose stored bundle no longer matches will be re-prompted. Confirm this
   behavior is what counsel intends before deploying.

9. **Deploy and verify:**
   ```bash
   npx vercel deploy --prod --archive=tgz
   ```
   Then confirm the consent modal renders, `/api/job-agent-consent` no longer returns
   `JOB_AGENT_CONSENT_STORE_NOT_CONFIGURED`, and a granted consent record stores the
   expected versions and digests.

10. **Note the remaining independent gate.** Consent readiness does not enable final
    submission, personal-data transmission, browser-worker execution, or paid provider
    calls. Those have separate approvals and remain fail-closed.

## Part 5 — What must not happen

- ❌ Setting `JOB_AGENT_COUNSEL_APPROVED=true` before counsel approves the served text.
- ❌ Publishing draft language as live terms.
- ❌ Updating pinned digests to make a check pass without approved text behind it.
- ❌ Marketing claims exceeding what the approved terms support.
- ❌ Claiming a security certification or compliance attestation not independently verified.
- ❌ Reporting an application as submitted without authoritative employer receipt evidence.

# Needs You answer memory

Private candidate statements use the existing encrypted tenant applicant vault. No additional store, provider, consent bypass, or employer execution was added. Application records retain fact ID/version references and content-free preparation events only.

`remember-answer` requires the signed tenant's source application and open AMBIGUOUS_FACT action with an exact inspector-supplied question. Missing historical question text stays on the existing employer-site completion path. Ordinary statements are saved verbatim; no RMA ownership, litigation, experience, or other claims are inferred. Preferences are classified conservatively. Sensitive screening requires explicit opt-in and is application-scoped/manual. Security/challenge answers are rejected. Permissions are application-scoped data, never execution approval.

Matching normalizes whitespace/case only. Different wording is deliberately NOT treated as semantic equivalence. Application scope takes precedence over employer scope, then candidate scope. Expired/revoked versions never match. A changed answer requires explicit replacement or an application-only exception. Forget scrubs stored answer values and exact statements, retaining content-free version/revocation metadata. Editing creates a new version; prior application references become stale.

The separate `resolve-remembered-answer` application mutation requires current authorization and re-reads the signed tenant's vault. It resolves only the named open question, retains unrelated blockers/approvals, refuses paused/submitted sessions, and resumes preparation only. It does not fill the employer form, dispatch a browser worker, grant sharing permission, or submit. Future exact questions display the remembered statement for confirmation without retyping. The existing employer worker's field allowlist remains unchanged: automatic screening-field transmission is NOT part of this release.

Persistence order is vault save, then version-checked application update. If the latter fails, memory remains saved and the question remains unresolved for safe retry. No employer call occurs in either operation. Store-level optimistic concurrency, encryption, and tenant isolation are inherited; no live database or employer acceptance test is claimed.

Verification: `npm run test:answer-memory`; `npx playwright test scripts/concierge-vault-browser.spec.mjs --workers=1`; existing application-session and employer-worker tests; `npm run smoke`.

Remaining release checks: real encrypted signed-user save/reload/edit/forget drill in isolated staging; API-level concurrent revocation testing; independent review before deployment. Semantic paraphrase reuse and authorized screening-field materialization require separate verified adapters, not relaxed matching or permissions.

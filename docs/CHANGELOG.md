# 1stStep.ai Changelog

Record verified ecosystem changes here. Entries are append-only within each date; never rewrite an uncertain action as shipped. Git history and deployment/store records remain authoritative for exact release contents.

## Unreleased

### 2026-09-10

- Added the ecosystem operating system, current evidence-based roadmap, and architecture contract.
- Added a deterministic smoke-test contract that fails if the required operating documents or core release-safety rules disappear.
- Designated `1ststepai/1ststep-resume` as the source of truth for the app, extension source, resume site, and partner site.
- Recorded the current split release state: Chrome Web Store v1.3.2, main manifest v1.5.0, and open PR #72 v1.6.
- Recorded that public pricing is currently aligned around free invitation-only beta and future $39/month access with no active checkout.
- Recorded production dependency/runtime health as unknown pending authenticated protected evidence.
- Independently verified the existing PR #72 candidate locally at `5c30d77`; no PR #72 source was changed by this pass.
- No production deployment, extension publication, billing change, provider activation, or applicant-data migration was performed.
- Completed a read-only-first repository reconciliation across seven independent Git markers and all 44 authoritative worktrees; details are in `docs/REPOSITORY_RECONCILIATION.md`.
- Cleaned four worktrees only after proving their changes were generated tool output or byte-identical to already merged history.
- Preserved 18 unique audit documents in local commit `acad40b` and tested agency-site work in local commit `a0e7f10`; neither commit was pushed or deployed.
- Recorded unresolved extension version drift: Web Store v1.3.2, `main` v1.5.0, PR #72 v1.6.0, and the mixed primary checkout v1.4.0.
- Recorded exact production deployment IDs and source parity as unknown because Vercel deployment metadata exposed no Git SHA.

## Historical state recognized by this baseline

- The app and public sites are deployed through three Vercel projects from one repository.
- Main includes guarded Clerk-to-opaque-session authentication, encrypted Job Agent runtime contracts, tenant-aware schema/RLS migrations, controlled extension tests, and user-controlled submission semantics.
- PR #72 contains the durable captured-job candidate; it is not treated as released until merged, deployed, published, and verified end to end.

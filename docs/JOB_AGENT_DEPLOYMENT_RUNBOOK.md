# Job Agent deployment runbook

This is the authoritative deployment procedure for the Job Agent in the canonical `1ststep-resume-deploy` repository. It does not authorize a deployment. The legacy resume-product quick-push instructions in `HOW_TO_DEPLOY.md` are not valid for this controlled beta.

## Before any deployment

1. Confirm the exact intended diff. Never use `git add -A`, clear Git lock files, rewrite history, or commit unrelated dirty-worktree changes as a release shortcut.
2. Run:

```powershell
npm ci
npm run test:concierge
npm run smoke
npm audit --omit=dev
npm run security:launch-report
npm run security:release-preflight
```

3. Require `security:release-preflight` to report `ok: true`. It hashes the complete `api/`, `lib/`, and public runtime surface, verifies the deployment ignore policy, and fails when tracked, staged, or untracked changes remain. Its path-list digests let an operator detect drift without printing filenames. Curate the intended change into a reviewed commit or isolated release worktree; never bypass this by hiding files or deploying a dirty checkout.
4. Record the reviewed commit and the exact `runtime.sha256` from the passing preflight. In the exact candidate environment, retain and sign a content-free `controlled-beta-release` artifact and require `JOB_AGENT_CONTROLLED_BETA_RELEASE_EVIDENCE` to verify against that commit, runtime digest, pilot, policies, owners, caps, and capability flags. Configuration drift is a new review, not an environment-variable patch.
   - Generate: `node scripts/create-controlled-beta-release-record.mjs`
   - Verify from the unchanged candidate: `node scripts/verify-controlled-beta-release-record.mjs --artifact <record.json>`
   - Review the record with the owner. Generation and verification do not sign, deploy, write production state, or authorize launch.
   - Sign only after that review using the existing `security:sign-launch-evidence` command with kind `controlled-beta-release`. The signer reruns preflight and verification and refuses dirty, stale, incomplete, mismatched, or tampered records.
5. Require an explicit owner deployment decision. A passing local suite or signed artifact does not authorize production mutation, enable a provider, approve cost, or prove external evidence.
6. Record SHA-256 hashes for `index.html`, `app.js`, `concierge.html`, and `concierge.js` before deployment.
7. Require the launch manifest to report `accessPolicy.ready: true`, `accessPolicy.dedicatedBillingEnabled: false`, and `accessPolicy.createsCharges: false`. A legacy paid tier without an explicit encrypted Job Agent grant must remain denied.

## Deployment

Use Vercel's normal remote build from this linked project only after explicit approval:

```powershell
npx vercel --prod --yes
```

Do not use `vercel build` followed by `vercel deploy --prebuilt` from this Windows checkout. Do not deploy from the legacy `resume-app` path. Do not change environment variables, provider flags, pilot admission, consent approval, or submission controls as an incidental deployment step.

## Acceptance

1. Inspect the new deployment and confirm `app.1ststep.ai` points to the intended deployment ID.
2. Run `npm run security:asset-parity` from the reviewed candidate checkout and require `ok: true`. This read-only check compares exact SHA-256 values for both concierge HTML routes, JavaScript, and CSS without retaining asset bodies.
3. Recompute the four release-surface source hashes and require exact equality with the pre-deploy values.
4. Run `npm run security:live-boundary` and require `ok: true`. The check is read-only and verifies both concierge CSP/SRI boundaries plus unauthenticated 401 responses from readiness, operations, and tenant-state.
5. From a protected operator environment, call authenticated read-only readiness and require the approved launch mode and current signed evidence. Require `launchManifest.evidence.controlledBetaRelease.integrity: signed-scope-bound`, the reviewed evidence ID/time, and exact equality between the approved commit/runtime identity and the deployed candidate. Do not place the readiness secret in a URL or logs. For the separately authorized create → restore → delete lifecycle verification, use only `npm run security:production-readiness-drill` with the exact production URL, server-only cron secret, and `JOB_AGENT_READINESS_DRILL_CONFIRMATION=CREATE_RESTORE_DELETE_SYNTHETIC_RECORDS`; retain its content-free output. Do not retry an outcome-unknown timeout until operations confirms the prior attempt and cleanup state.
6. Perform desktop and mobile browser QA of the guided launch, My Jobs, Needs You, Saved Info, access restoration, timeout/retry, and admin denial. Do not use real candidate data or employer submissions for release QA.
7. Confirm `externalApplicationExecution: false` and `submissionsEnabled: false` unless those later modes were separately approved, configured, and independently evidenced.

If any acceptance check fails, the release is not accepted. Do not weaken CSP, authentication, receipt rules, evidence expiry, cost caps, or approval gates to make the check pass.

## Rollback

A saved deployment ID in a document is not proof that the target is still usable. Before deployment, and again before any rollback, run this read-only preflight with the exact approved target:

```powershell
npm run security:rollback-preflight -- --deployment-id <deployment-id> --expected-project 1ststep-resume --production-host app.1ststep.ai
```

Require `ok: true`, `target: "production"`, `readyState: "READY"`, and the exact deployment ID/project. The preflight prints only deployment identity and state; it never deploys, promotes, aliases, or rolls back.

Rollback is a Production mutation and still requires an explicit owner decision. If acceptance fails and rollback is approved, use the exact inspected target—not a branch name, newest deployment, or guessed URL:

```powershell
npx vercel rollback <deployment-id> --yes
npx vercel rollback status
npm run security:rollback-preflight -- --deployment-id <deployment-id> --expected-project 1ststep-resume --production-host app.1ststep.ai --verify-alias
```

Then repeat asset parity, live-boundary, source-hash, authenticated readiness, and desktop/mobile checks. Require the post-rollback preflight to report `mode: "post-rollback-alias-verification"` and `ownsProductionAlias: true`. Preserve both the failed deployment ID and restored deployment ID in the incident evidence. A CLI success message alone is not recovery evidence.

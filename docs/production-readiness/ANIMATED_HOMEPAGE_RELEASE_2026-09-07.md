# Animated homepage release package

This package makes the latest `app.1ststep.ai` homepage and supervised Job Agent candidate reviewable without activating unfinished production capabilities.

## Release boundary

- Branch: `codex/finish-staged-candidate-20260907`
- Combined implementation baseline: `48454f976d8aeee2550cdbbbce334dd3eddc72a1`
- Homepage animation assets: `index.html`, `home-motion-1f7df326a312.css`, `home-motion-4e0eecde7df1.js`, and `home-momentum-90ff283f0fd8.jpg`
- Automatic Vercel deployment for this branch: disabled in `vercel.json`
- Job Agent billing and dedicated checkout: hard-disabled in source
- Final employer submission: fail-closed unless its complete approval, provider, durable execution, and receipt-evidence controls validate
- Active Terms: unchanged and digest-pinned; the revised document remains a counsel-review proposal

Documentation or evidence commits may follow the implementation baseline. Before review or deployment, record the exact head with `git rev-parse HEAD` and build that revision only.

## What is ready without new secrets

- The homepage motion contract, reduced-motion behavior, supervised application flow, Clerk routing, unknown-outcome reconciliation, mobile layout, consent-bundle display, output boundary, and security regressions have focused local coverage.
- The dedicated Neon staging database passed the canonical migration, 20-table forced-RLS inspection, 19 adversarial pgTAP cases, and isolated snapshot restore/cleanup.
- The manual GitHub isolated-database workflow skips only when no isolated target is authorized and fails closed for an invalid or failed authorized target.
- The candidate is pushed to GitHub without creating a deployment.
- A value-blind Vercel Production audit can be repeated with `npm run security:vercel-environment-names`. It emits names and aggregate control coverage only, never values.
- The production dependency audit reports zero vulnerabilities. Stripe remains on its existing major version while a compatible `qs` override pins the patched transitive release.
- The deterministic GitHub output build uses the public Vercel project and organization identifiers and explicitly removes any deployment token from its child process. An expired deployment secret therefore cannot break CI, and the build cannot deploy.

## Exact path to publish the homepage safely

1. Run `npm run release:gate` and `npm audit --omit=dev --audit-level=high` on a clean final head.
2. Run the Production Readiness Gate through GitHub on that exact branch and retain both job results.
3. Open a pull request to `release/login-pricing-reconciled-20260906` or the repository's chosen release branch and obtain human review. Do not merge automatically.
4. With separate deployment approval, create one protected Preview from the exact reviewed head. Do not add, remove, or copy secrets during this step.
5. Verify desktop/mobile animation, reduced motion, the homepage CTA, login routing, security headers, protected-route denial, fail-closed readiness, and that Job Agent checkout and final submission remain disabled.
6. Record the exact Preview deployment ID, source commit, runtime digest, Production rollback target, and acceptance artifact.
7. Obtain a separate Production promotion approval, promote the verified artifact, and run the bounded Production checks. Roll back to the pre-recorded Ready Production target if acceptance fails.

The animated public homepage can follow this release path while the signed-beta automation remains disabled. The two Critical scorecard layers block enabling the full Job Agent production runtime; they do not require claiming that the public homepage is already deployed.

## Configuration work that still needs external action

The 2026-09-07 value-blind Production inventory found 73 observed variables, 29 of 126 required names present, and 97 absent. All seven durable-runtime names are present. Values and deployed behavior remain unknown until authenticated runtime checks pass.

Complete these in order, using provider dashboards or protected operator shells. Never place a secret in chat, source, logs, or a pull request.

1. Obtain counsel's exact approval or revisions for the proposed Terms, Privacy alignment, candidate authorization, application limits, renewal disclosure, and employment-agency classification. Only then update the active documents, hashes, and policy-version configuration together.
2. Choose and fund a private object store plus an exact-host malware scanner; configure encrypted private storage and approved cost ceilings, then run the synthetic write/read/integrity/scan/delete and recovery drills.
3. Approve the controlled-beta seat limit, allowlist policy, scheduling cap, provider-unit ceilings, and monetary ceilings. Keep paid Job Agent checkout disabled.
4. Name the support and incident owners; approve the alert endpoint, retention, and acknowledgement window; verify receiver-side acknowledgement with synthetic content-free events.
5. Configure and prove audit archive acknowledgement/retention, Needs You suppression handling, document-render sandboxing, signed-user database persistence, queue fairness/backpressure, and dependency-failure containment.
6. Review the Production authoritative-store migration and recovery plan, including RPO/RTO. Apply no Production migration until separately approved.
7. Build a dedicated Stripe Billing checkout, webhook entitlement lifecycle, Customer Portal, revocation behavior, and replay-safe fulfillment only when the product is ready to charge. The existing résumé-product Stripe integration is not the Job Agent billing path.

## Current stop conditions

Do not enable full signed beta while private object storage, counsel approval, alert/incident ownership, signed launch evidence, and controlled-beta admission are unverified. Do not enable paid Job Agent access until checkout, webhook, entitlement grant, cancellation/payment-failure revocation, and Customer Portal behavior have been exercised end to end. Do not enable final employer submission until authoritative employer receipt persistence is verified.

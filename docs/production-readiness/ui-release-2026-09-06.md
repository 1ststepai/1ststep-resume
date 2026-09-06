# UI release receipt — 2026-09-06 UTC

## Released

- Clean detached source: `9ea75ab91fd6ff3e05a44e7ad82a84c6b8c994d6`, retained by `release/ui-2026-09-06`.
- UI changes: `e8a244e`; policy reconciliation commits retain already-published legal bytes, not new terms.
- Preview: `dpl_6bwseaAZK4Yj7vdCNe3KfKyomiUc`, https://1ststep-resume-j5z7do2r1-1ststep.vercel.app.
- Production: `dpl_4i9AtwfnXUhBPktkWcsmqYv37FDa`, https://1ststep-resume-acjpqcw62-1ststep.vercel.app.
- Live domain: https://app.1ststep.ai/concierge.
- Production deployment created September 5, 2026, 21:58:40 America/New_York; promoted after candidate checks passed.
- Normal remote builds; Production built with Production configuration using `--prod --skip-domain`, then promoted. No environment values changed.
- Previous deployment retained for rollback: `dpl_3oZp2oQ7ERFRPynMivbQ5PYp5gtz`, https://1ststep-resume-iktqofr2v-1ststep.vercel.app.

## Verification

- Clean `npm ci --ignore-scripts` and `npm run test:web-release`: passed. Output inventory: 55 static assets, 41 functions; forbidden source contents absent.
- Six existing allowlisted smoke warnings. Install reported one moderate dependency advisory; not auto-fixed in this UI release.
- Production candidate and live domain: all 29 checked routes/assets/boundaries passed. Public routes and selected CSS, JS, image and client module return 200. Ten forbidden paths return true 404, including stale extension ZIP.
- `/api/app-config`: 200. `/api/session-capabilities`: 403 `ORIGIN_FORBIDDEN` for no-origin anonymous request, consistent with inspected auth gate; not an authenticated workflow test.
- Browser: candidate landing, guided setup entry, close behavior and Needs You panel verified; live domain renders released navigation/landing. No search, employer action, payment or candidate transmission performed.
- Terms SHA-256: `c3d393ded7a8fdc246f47fd80362d0d30300e23bb6884a843d0714175fc4c87c`.
- Privacy SHA-256: `5391d01205fe3337e84fdb023f07aa4b8a17ef167e5bf3fa041bb4e7323982eb`.
- Both live hashes exactly match pre-release Production and committed release source.

## Boundaries and next modules

This is a verified UI release, not evidence of 2,000-user capacity, provider generation success, paid subscription lifecycle completion, or authenticated durable operation. No capability was enabled. Existing storage/RLS/recovery staging evidence gaps remain.

1. Consolidate locally tested discovery deadline/partial-result changes and reviewed disabled shared-feed ingestion in separate commits. Do not mix pending analytics CSP edits into them.
2. Build bounded shared-feed worker integration and fair resumable queue draining, disabled by default until isolated runtime tests pass.
3. Verify subscription admission and live quota arithmetic; no pricing/access policy changes without approval.
4. Obtain isolated staging database/Redis and a cost ceiling; prove cross-tenant isolation, recovery and ramp capacity there before claiming scale readiness.

The agent-team backend review used Codex fallback after Claude quota exhaustion; it is not independent cross-provider review. Real Redis/Lua evidence remains outstanding.

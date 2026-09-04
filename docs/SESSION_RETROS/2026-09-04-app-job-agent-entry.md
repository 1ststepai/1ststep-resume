# /app becomes the Job Agent entry point

Date: 2026-09-04

## Summary

- Repointed the `/app` rewrite from `app.html` to `concierge.html` so the primary
  app URL opens the existing Job Agent wizard. No second wizard was built; the
  `/concierge` route and its assets are unchanged.
- Added `/app/resume` -> `app.html` so the resume/tailoring app remains reachable
  as an agent capability rather than the primary product. Nothing was deleted.
- Copied the `/concierge` Content-Security-Policy and `Cache-Control: no-store`
  onto a new `/app` header block. Vercel matches header rules on the request
  path, so without this the Job Agent would have been served at `/app` under the
  looser app-shell CSP that allows `unsafe-inline`, the Tailwind CDN and Stripe.
  That would have been a silent security regression, not a cosmetic one.
- Updated the `pageRoutes` fixture in `scripts/vercel-output-boundary-test.mjs`,
  which asserted `/app` -> `app.html` and would otherwise have failed the
  release gate on a now-incorrect expectation.
- Repointed the marketing "Build my résumé" card to `/app/resume`. The hero and
  "Start my Job Agent" CTAs still target `/app`, which is what
  `scripts/homepage-viewport-qa.mjs` asserts.

## Files changed

- `vercel.json`: `/app` rewrite, new `/app/resume` rewrite, new `/app` header block.
- `scripts/vercel-output-boundary-test.mjs`: `pageRoutes` fixture.
- `index.html`: one `href` on the résumé-path card.

## Validation

- `npm run smoke`: pass (0 failures, 6 pre-existing warnings).
- `node scripts/web-release-boundary-test.mjs`: see run log.
- `npm run build:web` + `npm run test:deployment-output`: see run log.
- Not run: full `npm run release:gate` (includes live-network and signing steps
  outside the scope of a routing change).

## Risks / follow-ups

- `build-public-web.mjs` needs no change: `app.html` and `concierge.html` are
  both already in the public asset allowlist.
- `scripts/live-job-agent-asset-parity-test.mjs` pins `/concierge` and
  `/concierge.html` to the `concierge.html` bytes. `/app` now serves the same
  document but is not in that parity map. Adding it would strengthen the guard;
  it was left out here because that test compares against live deployed
  responses and would fail until this change ships.
- The concierge header logo and in-page links still point at `/concierge`, so a
  user entering at `/app` can be moved to `/concierge` mid-session. Both serve
  the same document, so nothing breaks, but the canonical URL is worth settling
  before launch copy is finalised.
- No commit, deploy, or extension permission change was made.

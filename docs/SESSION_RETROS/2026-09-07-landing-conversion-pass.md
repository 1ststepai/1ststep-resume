# Landing page conversion / semantics / SEO pass — 2026-09-07

Scope: `index.html` (the marketing homepage served at `/`), its stylesheet `home.css`,
one line in `build-public-web.mjs`, and one new image asset. No product, API, auth,
pricing, entitlement or Job Agent runtime behavior was changed.

## Cross-agent ownership record (agent-team protocol)

Checked before claiming files, per `~/.codex/skills/agent-team/SKILL.md`:

| File | In-flight state found | Action |
|---|---|---|
| `index.html` | Codex change already complete — one footer link to `/where-to-find-1ststep-ai/` plus an indentation change | Claimed as sole writer; Codex's footer link preserved verbatim |
| `home.css` | Clean | Claimed as sole writer |
| `build-public-web.mjs` | `MM` — Codex added `where-to-find-*` and `llms.txt` to the asset list | One additive line appended to the same list; trivially mergeable |
| `concierge.html`, `concierge.js`, `persistent-concierge.css`, `app.js`, `api/*`, `lib/*` | Codex's active copy/feature pass | **Read only.** Findings reported, not edited |

Working tree was left otherwise untouched: 100 dirty paths from the combined
cleanup + Codex pass were preserved.

## What changed and why

1. **Hero states the product category.** The old H1 ("Stop rewriting your résumé for
   every job.") was a strong pain hook but never said what the product *is*. The pill
   now names the category, the H1 names the job to be done, and the lede names the
   mechanism and the control guarantee.
2. **One canonical primary CTA.** Every primary conversion control on the page is now
   the identical string `Start my Job Agent — free` pointing at `/concierge`. Verified
   the full label still fits the desktop nav down to 901px (784px needed / 805px
   available), so no shortened variant was needed.
3. **Beta request demoted, access states separated.** The Job Agent card previously
   showed `Request a beta spot` and `Start my Job Agent` as two equal-weight buttons
   with two fine-print blocks between them. It now has one button, and the beta request
   is an inline link inside a note that names the actual distinction: setting up is open
   to everyone; letting the agent *run* is invite paced. All compliance sentences were
   preserved verbatim, not condensed.
4. **Benefit section moved above the product fork.** "What you get" now sits directly
   after the sources strip, before "Two ways to use it". `.band` classes were reassigned
   down the chain so the light/soft alternation is unchanged.
5. **Semantics.** Sources strip label is an `<h2>`; footer column labels are `<h2>`
   instead of `<h4>` (removes an h2 → h4 skip); the compact menu is a `<nav>` and now
   carries the primary CTA; logo alt names the destination.
6. **SEO.** Category-bearing `<title>`/description, `robots`, complete OpenGraph +
   Twitter card with a newly rendered accurate OG image, and a JSON-LD `@graph`
   (Organization, WebSite, SoftwareApplication, FAQPage).

## Claim verification

Every hero claim was checked against code before publishing:

| Claim | Evidence |
|---|---|
| Free to start, no credit card, nothing charged | `lib/job-agent-pricing.js` — `billingEnabled/createsCharges/checkoutConfigured: false`; `lib/job-agent-entitlement.js` hardcodes no charges |
| Nothing is sent to an employer without your approval | `lib/application-submission-provider.js` and `lib/application-submission-task-worker.js` are fail-closed behind `JOB_AGENT_FINAL_SUBMISSION_*` env approvals; `lib/job-agent-launch-manifest.js` blocks the capability |
| Setup takes about two minutes | Pre-existing claim; independently matched by the `/concierge` entry button's own "About two minutes · mostly taps" label. Not otherwise instrumented |
| Invite paced | `lib/job-agent-pilot-access.js` — `JOB_AGENT_PILOT_ENFORCEMENT` with an allowlist capped at 10 tenants |

No testimonials, logos, ratings, user counts, application counts or time-saved
statistics were invented. The honest principles block was kept and the fineprint now
states explicitly that none of those appear until they are attributable.

## Structured data notes

- No `offers` on `SoftwareApplication`: the Job Agent has no checkout and creates no
  charge, so publishing a price as an offer would misstate purchasability.
- No `aggregateRating` / `review`: there is nothing attributable to publish.
- `FAQPage` answers are byte-for-byte the visible FAQ text. Note that Google restricted
  FAQ rich results to authoritative government/health sites in 2023, so this is for
  correctness and AI/LLM parsing rather than an expected SERP feature.

## Verification run

| Check | Result |
|---|---|
| `node scripts/smoke-test.cjs` | pass — 0 failures, 6 pre-existing allowlisted-handler warnings (all in `app.html`) |
| `node scripts/job-agent-pricing-test.mjs` | pass |
| `node scripts/web-release-boundary-test.mjs` | pass |
| `npm run build:web` | pass — 68 intentional public assets |
| `node scripts/vercel-output-boundary-test.mjs` | pass — no leaks |
| `npm run inventory:release-source:check` | pass — `og-1ststep-ai.png` classified REQUIRED PRODUCTION SOURCE |
| `playwright test scripts/landing-agent-pricing-browser.spec.mjs` | 2 passed |
| Browser sweep at 375/390/430/768/1024/1440/1920 | no horizontal overflow, exactly one `<h1>`, no duplicate IDs, no heading-level skips, no console errors, JSON-LD parses, focus ring visible on all first 8 focusables |

## Reported but not changed (other owners / needs a decision)

- `persistent-concierge.css:165,166` hides `.access-control` ("Sign in" / "Pilot invite
  required") below 900px and forces `display:none!important` below 720px. A returning
  user on a phone has no visible sign-in on the `/concierge` entry screen, and an
  uninvited user never sees the invite-required state there.
- Marketing-page analytics do not exist. `api/app-config.js` returns
  `analytics: { enabled: false }` and `/api/track-event` requires an authenticated
  subject plus an email, so anonymous `landing_page_view` / `*_cta_click` cannot use it
  as built. Adding tracking is a privacy/consent decision and would break the stated
  "no third-party tracking, no network calls" contract at the top of `home.js`.
- The homepage shows no real product screenshots. The two candidate assets in the repo
  (`app_screenshot_linkedin.png`, `og-image.html`) both depict a retired UI and stale
  offers, so neither was used.
- Light marketing page → near-black `/concierge` workspace is a hard visual break at the
  exact moment of conversion.

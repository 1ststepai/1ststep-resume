# 1stStep.ai Live Copy/Icon/Link Sweep Report

## Launch Recommendation
Launch after production deploy confirmation.

## Summary
Reviewed the production-facing app shell, pricing/paywall copy, GHL landing snippets, legal pages, SVG/icon markup, subscription restore CTAs, and smoke coverage. Fixed the visible launch-polish issues found during the sweep: inconsistent score naming, remaining beta-facing landing language, a corrupted toolbar label, awkward job-board CTA labels, missing `rel="noopener"` on `_blank` links, and overly strong/inside-baseball landing copy.

## P0 Issues
None found in this focused copy/icon/link sweep.

## P1 Issues
- Issue: Old score naming still appeared as "Role/AI Match Score" and "AI Match Score".
  Location: `index.html`, `pricing.html`, `terms.html`, `resume-tailor-landing/ghl-cro-custom-code.html`, `resume-tailor-landing/ghl-custom-code.html`.
  Fix: Standardized visible pricing/landing/legal copy to "Role Match Score".
  Verification: Smoke test now checks public pages for old score naming.

- Issue: Landing page still presented the Chrome extension as beta.
  Location: `resume-tailor-landing/ghl-cro-custom-code.html`.
  Fix: Replaced beta wording with "Chrome extension workflow" language.
  Verification: Smoke test now checks GHL landing files for visible beta workflow copy.

- Issue: Resume toolbar Re-tailor button had corrupt visible prefix text.
  Location: `index.html`, `#retailorBtn`.
  Fix: Removed the stray `ao` prefix.
  Verification: Smoke test now checks the Re-tailor button for corrupt prefix text.

- Issue: Some job-board CTAs had awkward duplicated labels such as "Open on Indeed open" / "Search Indeed open".
  Location: `index.html`, `app.js`.
  Fix: Cleaned labels to "Open on Indeed", "Search Indeed", etc. Static quick links now have useful default destinations.
  Verification: Targeted copy scans returned clean.

## P2 Issues
- Issue: Several `target="_blank"` links were missing `rel="noopener"`.
  Location: `index.html`, `privacy.html`.
  Status: Fixed for app/footer/review/legal/external privacy links.

- Issue: Landing proof copy made an overstrong claim: "Interview invite likely."
  Location: `resume-tailor-landing/ghl-cro-custom-code.html`.
  Status: Replaced with calmer role-alignment proof copy.

- Issue: GHL landing copy included internal phrasing like "Give visitors a tiny win".
  Location: `resume-tailor-landing/ghl-cro-custom-code.html`.
  Status: Replaced with user-facing copy.

## Copy Consistency Fixes
- Standardized the score name to "Role Match Score".
- Kept paid plan naming as "Job Hunt Pass".
- Kept free plan naming as "Free Account" where pricing cards use plan names.
- Removed visible beta wording from the production landing snippets.
- Replaced misleading login-style landing CTA language in the default GHL snippet with "Open App" / "Start Free".

## SVG/Icon Fixes
- Verified SVG tag balance in the app and GHL landing snippets.
- Verified no missing `alt` attributes on images in checked production pages.
- No corrupt SVG markup found in the checked production-facing files.

## Link/CTA Fixes
- Start Free: landing/app CTAs remain routed to `https://app.1ststep.ai`.
- Job Hunt Pass: Stripe checkout URL remains `https://buy.stripe.com/5kQ4gA7OFgH14u89fhfIs00`.
- Already subscribed: previously fixed restore flow remains covered by smoke tests.
- Privacy: links exist and external privacy links now include `rel="noopener"`.
- Terms: links exist.
- Support / Report bug: mailto/support paths remain available.
- Checkout: checkout CTAs remain live Stripe links; `_blank` app links now include `rel="noopener"`.
- Billing/manage subscription: app still presents restore/verify and support-based cancellation language; full self-serve billing portal remains outside this copy/icon sweep.

## Placeholder/Test/Beta Cleanup
- Removed visible beta workflow language from production GHL landing snippets.
- Confirmed no placeholder GA ID (`G-YOURIDHERE`) in production-facing app/landing files.
- Confirmed no old `$12`, `$19`, or `$29` pricing in checked production-facing files.
- Confirmed no visible old "Role/AI" or "AI Match Score" naming in checked production-facing files.

## Known Non-Blocking Issues
- Internal code/API names still include `beta` for backward compatibility with legacy private-access users and endpoints. Public launch defaults are free/public and smoke tests confirm legacy beta signups resolve to the free tier only.
- Smoke test reports 6 allowlisted inline handler warnings. These are known existing handlers and are not new failures.
- PowerShell profile and local Git ignore permission warnings appear during local commands; they are environment noise.
- Could not perform external HTTP link checks from this restricted environment. Local static link inspection passed for checked production files.

## Verification
- node --check app.js: passed
- node scripts/smoke-test.cjs: passed with 0 failures and 6 allowlisted warnings
- git diff --check: passed
- Browser checks: not fully automated in this restricted sweep; static DOM/link/icon checks passed
- Mobile checks: not fully automated in this restricted sweep; existing layout collision smoke checks passed

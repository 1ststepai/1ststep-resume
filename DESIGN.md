# 1stStep.ai — Design System

Scope: the marketing homepage (`index.html`, `home.css`, `home.js`), served at `/`.
The authenticated workspace (`app.html`, `app.js`, `style.css`), served at `/app`, keeps
its own established styling and is **not** governed by this document.

## Voice

Premium, trustworthy, calm. We describe what the product does and refuse to overstate it.
Prefer "prepares", "verifies", "asks when needed" over "automatically applies".

**Never claim:** guaranteed interviews or offers · an application submitted without
authoritative employer receipt evidence · fully autonomous submission · stored employer
passwords · fabricated customer outcomes, job counts, or time-saved metrics · security
certifications or compliance attestations that have not been independently verified.

## Color

Light theme, derived from the logo (`1ststep-logo.png`: mark `#6366F1`, wordmark
`#0F172A`). Defined as custom properties on `:root` in `home.css`.

The logo colour itself is `--brand` and is used **only** for the mark. Interactive
blues are darkened one and two steps so they meet AA as fill and as text.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FFFFFF` | Page background |
| `--bg-soft` | `#F8FAFC` | Alternating section bands, quiet fills |
| `--surface` | `#FFFFFF` | Cards, panels |
| `--line` | `#E2E8F0` | Hairline borders |
| `--line-strong` | `#CBD5E1` | Button and input borders |
| `--ink` | `#0F172A` | Headings and emphasis |
| `--body` | `#475569` | Body text (~7.5:1 on white) |
| `--muted` | `#64748B` | Secondary text (~4.8:1 on white, AA) |
| `--primary` | `#4338CA` | Links, eyebrows (~8.0:1 on white, AA) |
| `--primary-fill` | `#4F46E5` | Button fill (~5.5:1 with white text, AA) |
| `--primary-tint` | `#EEF2FF` | Active step background |
| `--brand` | `#6366F1` | The logo mark's own colour. Decorative only — fails AA as text |
| `--cyan` | `#0A6E92` | Progress, verified signals |
| `--mint` | `#0A7A52` | Confirmed / receipt-verified |
| `--amber` | `#9A5B00` | Needs You and caution **only** |

Two shades of periwinkle exist deliberately: `--primary` is the accent used as text
and passes AA on white, while `--primary-fill` is the button fill that passes AA
behind **white** text. Do not use `--primary-fill` as body text, and do not use
`--primary` as a fill behind white text.

`--amber` is reserved for Needs You and caution states. Do not use it decoratively.

Semantic tints (`#E4F5ED` mint, `#E2F1F7` cyan, `#FDF3E2` amber, `#ECEFF5` muted)
back the status tags and the active states of the run card and receipt progression.
They pair only with their own token as the foreground.

## Typography

Inter, with a system sans-serif fallback stack. Body 17px / 1.62. Headings 700, with
800 for `h1` and `h2`. Tight tracking (`-0.021em`, `-0.032em` at h1). No text below
0.7rem, no weights under 400, no all-caps except short eyebrow and table-header
labels with widened tracking.

## Components

- Radii: `--r-sm` 10px, `--r` 16px, `--r-lg` 20px. Cards use 16–20px.
- Buttons: pill, min-height 48px (56px large) — comfortably above the 44px touch target.
- Borders soft (`--line`), shadows restrained and used only for lift.
- Section rhythm: `clamp(68px, 9vw, 118px)` vertical padding, `--wrap` 1160px.
- Alternating sections use `--bg-deep` with hairline top and bottom borders.

## Motion

Allowed: hero gradient drift, staggered scroll reveals, card hover lift, the agent status
progression, accordion transitions, a small verified-state pulse.

Not allowed: scroll hijacking, heavy parallax, fake loading delays, flashing, constant
motion, anything that blocks navigation or reveals a sensitive value.

`prefers-reduced-motion: reduce` disables reveals, the gradient drift, and the pulse, and
renders the agent card in its completed state. All animation uses transform and opacity.
The run demo starts only when scrolled into view so a background tab stays idle.

## Accessibility

- Semantic landmarks, one `h1`, ordered headings, skip link.
- Focus visible everywhere: 3px `--cyan` outline, 3px offset.
- WCAG AA contrast for all text.
- Wide content (the comparison table) scrolls inside `.table-scroll`; the body never
  scrolls horizontally.
- No inline event handlers — `scripts/smoke-test.cjs` flags them.

## Product architecture on the homepage

The homepage sells **two** paths, not three:

1. **Résumé Builder** — one role at a time, fully manual.
2. **Job Agent** (recommended) — ongoing search. **Interview practice** is a capability
   *of* the Job Agent, not a peer product.

### The Chrome assistant is not offered publicly (2026-08-31)

Assisted apply is **not marketed on the homepage**. It is gated by
`JOB_AGENT_EXTENSION_HANDOFF_ENABLED=false`, `JOB_AGENT_GREENHOUSE_EXTENSION_APPROVED=false`,
and `host_permissions` covers Greenhouse only — advertising a capability in that state is a
claim we cannot stand behind, so the card bullet, the comparison row and the FAQ entry were
removed rather than qualified further.

The code is untouched and the handoff contract still works: `1ststep-extension/background.js`
opens `/app?jobCaptureId=…&mode=…`. Nothing was deleted, so re-offering it is a copy change,
not a rebuild.

**Re-add it only when all three are true:** the flag is on in production, the Chrome Web Store
listing is approved, and `host_permissions` covers the ATS platforms the copy names. Then
present it as a capability of the Job Agent — never as a third product beside the two paths.

`scripts/homepage-viewport-qa.mjs` now asserts the *absence* of an assisted-apply claim, so
the copy cannot quietly come back before the feature does. Invert that assertion when you
re-add it.

## Testimonials — the rule

**Never ship a fabricated quote, name, employer, photo, or star rating.**

The section renders from `window.STEP_TESTIMONIALS`, an array of approved entries. Each
entry requires `quote`, `name`, and `source` (a traceable origin — where the quote came
from and evidence of permission to use it). `role` is optional.

```html
<script>
  window.STEP_TESTIMONIALS = [
    {
      quote: "Exact wording, unedited.",
      name: "Full name as approved",
      role: " · Title, Company",
      source: "Origin and permission record, e.g. support ticket #1234, written consent 2026-09-01"
    }
  ];
</script>
```

Add this **before** `/home.js` in `index.html`. Entries missing any required field are
skipped. While the array is empty the quotes grid stays hidden and the truthful
product-principle block renders instead — that is the current production state.

Quotes are inserted with `textContent`, never `innerHTML`.

## Routing contract

**File layout changed:** the former `index.html` (workspace) is now `app.html`; the
marketing page is `index.html`. `scripts/smoke-test.cjs` reads `app.html` for the required
workspace DOM IDs.

`/` serves `index.html` (the marketing homepage) directly from the filesystem and
**never redirects** — not for returning users, not for deep links, not for anyone.
`/app` rewrites to `/app.html` (the workspace).

**Changed 2026-08-31:** the forward guard in `home.js` was removed entirely. Deep
links now address the workspace directly instead of bouncing through `/`:

- job capture → `/app?jobCaptureId=…&mode=…` (`1ststep-extension/background.js`)
- extension "Open app" → `/app` (`1ststep-extension/popup.js`)
- install → `/concierge?welcome=extension` (unchanged)

Nothing in the repo constructs a root deep link any more. If you add one, point it
at `/app` rather than reintroducing a redirect. `?home=1` is now a no-op, kept only
so old links do not break.

Extension copies installed before this change still open `/?jobCaptureId=…`, which
now lands on the homepage. Ship the extension update alongside this.

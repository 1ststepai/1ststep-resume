# Chrome Web Store — Visual Asset Specs

Everything you need to produce the promo tile and screenshots. Colors and fonts match the existing extension popup so listing assets feel native.

---

## Brand palette (copy-paste)

| Token            | Hex       | Usage                              |
|------------------|-----------|------------------------------------|
| Brand primary    | `#4338CA` | CTAs, logo, key accents            |
| Brand dark       | `#3730A3` | Gradients, hover                   |
| Background       | `#F8FAFC` | Page background                    |
| Surface          | `#FFFFFF` | Cards, popup surface               |
| Text             | `#0F172A` | Headings                           |
| Text secondary   | `#475569` | Body copy                          |
| Success green    | `#059669` | "✓ Filled" indicators              |
| Success bg       | `#ECFDF5` | Success chip background            |

Font: **Inter** (400 / 500 / 600 / 700 / 800). Available at `fonts.google.com/specimen/Inter`.

---

## 1. Small promo tile — 440 × 280 px (REQUIRED)

I've built a ready-to-export HTML version at `1ststep-extension/promo_tile.html`. Open it in Chrome at 100% zoom, screenshot the 440×280 card (use DevTools device toolbar at 440×280), save as PNG.

If you'd rather rebuild in Canva/Figma, here's the exact layout:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   [1stStep logo]  1stStep.ai                            │
│                                                         │
│   Apply to more jobs.                                   │
│   In fewer clicks.                                      │
│                                                         │
│   ─────────                                             │
│                                                         │
│   ✨ Tailored resume + auto-fill in 1 click             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Background: linear-gradient `#4338CA → #3730A3` (diagonal 135°)
- Headline: Inter 800, 32px, white, -1px letter-spacing
- Sub-headline: Inter 500, 14px, white @ 80% opacity
- Logo: Inter 700, 14px, white
- Padding: 24px all sides
- Optional: subtle grid or dot pattern @ 6% opacity on the gradient

---

## 2. Marquee promo tile — 1400 × 560 px (OPTIONAL but recommended)

If featured, CWS uses this. Same design as small tile, scaled up, with room for a second column showing an extension popup mockup on the right. Skip for v1 if time-constrained.

---

## 3. Screenshots — 1280 × 800 px each (3–5 REQUIRED)

Chrome Web Store shows these in the listing carousel. Ship at least 3; 5 is ideal.

### Screenshot 1 — "Click one button, fill an application"
**Composition:**
- Left 60% (~768px): Full Greenhouse apply page screenshot with multiple fields filled (green checkmarks next to filled fields, or just the filled state)
- Right 40% (~512px): The extension popup floating over, showing "✓ 12/15" on the Auto-fill button
- Top banner (90px tall): "Apply in seconds, not minutes" in Inter 700, 36px, brand color

**How to capture:**
1. Open a Greenhouse apply page (e.g. any Airbnb Careers job)
2. Click the 1stStep extension icon
3. Click "Auto-fill This Form" and wait for "✓ N/M"
4. Take a full-page screenshot in Chrome (Ctrl+Shift+P → "Capture full size screenshot")
5. Composite the popup in Figma/Canva with the text banner on top

### Screenshot 2 — "Tailored resume for every job"
**Composition:**
- Side-by-side diff: Original resume bullet on left, tailored version on right with new keywords highlighted in brand color
- Header: "AI rewrites your resume to match each job description"
- Source: use your existing app.1ststep.ai resume tailor screen

### Screenshot 3 — "Works on every major ATS"
**Composition:**
- Centered headline: "Works where you apply"
- Grid of ATS logos: LinkedIn, Indeed, Greenhouse, Lever, Workday, iCIMS, Ashby, Jobvite, SmartRecruiters
- Logos in grayscale or monochrome on brand background strip
- Small footer: "— and more every month"

### Screenshot 4 — "Your data, your account" (trust / privacy)
**Composition:**
- Left: diagram of data flow — You → 1stStep account → extension (no 3rd parties)
- Right: 3 trust bullets:
  - "Profile stored in your 1stStep.ai account"
  - "No data sold. No ad tracking. Ever."
  - "Uninstall clears everything"

### Screenshot 5 — "How it works" (3-step flow)
**Composition:**
- 3 numbered steps, left to right:
  1. "Build your profile once" — screenshot of 1ststep.ai profile form
  2. "Open any job posting" — screenshot of a job page with popup showing job detected
  3. "Click to tailor & fill" — screenshot of tailored resume + auto-filled form
- Brand-color arrows connecting the steps

---

## 4. Icons — CHECK

- ✅ 16 × 16 → `icons/icon-16.png` (in bundle)
- ✅ 48 × 48 → `icons/icon-48.png` (in bundle)
- ✅ 128 × 128 → `icons/icon-128.png` (in bundle, this is also the store listing icon)
- ⚠️ 32 × 32 → optional, Chrome auto-scales from 48 if missing

**No action needed.** If you want pixel-perfect rendering in Windows system tray, generate a 32×32 later.

---

## 5. Tools you can use

- **Figma** (free) — easiest for compositing the mocked popup over real ATS screenshots
- **Canva** — has 1280×800 templates under "Chrome Web Store Screenshots"
- **Chrome DevTools** — for capturing the ATS page and for rendering the HTML promo tile at exactly 440×280

---

## 6. Delivery checklist

When all assets are ready, place them in `1ststep-extension/store-assets/`:

```
store-assets/
  promo-tile-440x280.png
  marquee-1400x560.png        (optional)
  screenshot-1-autofill.png
  screenshot-2-tailor.png
  screenshot-3-works-everywhere.png
  screenshot-4-privacy.png
  screenshot-5-how-it-works.png
```

Then drag-drop into the CWS developer console → Store listing tab → Graphic assets.

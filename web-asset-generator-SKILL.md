---
name: web-asset-generator
description: Generates professional web assets — favicons, PWA app icons, and Open Graph social images (Facebook, Twitter, WhatsApp, LinkedIn). Use when: "make a favicon", "generate app icons", "create OG images", "social media preview images", "web assets for launch".
---

# Web Asset Generator

## What This Skill Does

Generates all web assets needed for a professional launch:
- **Favicons** — all sizes (16x16, 32x32, 180x180, 192x192, 512x512)
- **PWA app icons** — for "Add to Home Screen" on iOS and Android
- **Open Graph images** — 1200x630 social preview images for Facebook, Twitter, WhatsApp, LinkedIn

## Setup (one-time)

The skill ships with Python scripts (stdlib only, no pip installs needed).

```bash
# After placing skill folder in ~/.claude/skills/web-asset-generator:
python ~/.claude/skills/web-asset-generator/scripts/check_dependencies.py
```

## Generation Commands

### From a logo image
```bash
python scripts/generate_favicons.py <source_image.png> <output_dir>
```

### From an emoji
```bash
python scripts/generate_favicons.py --emoji "🚀" <output_dir>
```

### Open Graph / social images
```bash
python scripts/generate_og_images.py <output_dir> --text "Your App Name"
```

## Workflow

1. Ask user: what source material do they have? (logo file / emoji / text only)
2. Ask: which assets are needed? (favicons, app icons, social images, everything)
3. Run appropriate scripts
4. Move output to workspace/outputs folder
5. Display the HTML `<head>` tags to paste into index.html
6. Offer to insert them automatically

## HTML Tags to Add After Generation

```html
<!-- Favicons -->
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">

<!-- PWA -->
<link rel="manifest" href="/site.webmanifest">

<!-- Open Graph -->
<meta property="og:image" content="https://yoursite.com/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://yoursite.com/og-image.png">
```

## For 1stStep.ai Specifically

1stStep.ai needs:
- **Favicon**: Use the "1st" text or a footstep/rocket emoji
- **OG image**: "1stStep.ai — AI-Powered Job Search" with a clean dark background matching the app's #0f0f1a color scheme
- **Apple touch icon**: Same as favicon, 180x180
- These go in `resume-app/` alongside index.html and are referenced with relative paths

After generating, drop the files into the `resume-app/` folder and the HTML tags into the `<head>` section of `index.html`.

## Testing Social Preview Images

After deploying to Vercel, validate with:
- Facebook: https://developers.facebook.com/tools/debug/
- Twitter: https://cards-dev.twitter.com/validator
- LinkedIn: https://www.linkedin.com/post-inspector/

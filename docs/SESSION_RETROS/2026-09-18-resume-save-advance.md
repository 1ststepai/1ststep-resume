# 2026-09-18 — Resume save advances into setup

## Changed
- Save resume now closes the overlay and continues into work setting.
- A saved resume auto-selects the matching job path, so first-run no longer asks the user to pick one.
- Work setting previews the resume text and the resume-based path, with optional Change controls.
- Live path compare keeps the resume-based path when results are empty/partial.

## Why
- Testers had to close resume setup by hand, click Continue, then pick a job path. Compare live paths also returned empty partial results without a usable next step.

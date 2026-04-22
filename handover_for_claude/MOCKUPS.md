# Design Mockups & Evolution

This document tracks the evolution of the UI designs through various mockup iterations. These files serve as the "Gold Standard" for UI layout and CSS styling.

## Current State of Mockups

| File | Status | Description |
| --- | --- | --- |
| `v3_layout_mockup.html` | Deprecated | Initial attempt at the App Shell (Sidebar + Main). Lacked full interactivity. |
| `v4_full_workflow_mockup.html` | **Current Reference** | High-fidelity mockup representing the final architecture. Includes Sidebar, Topbar, and SVG icons. Use this as the primary reference for CSS styling. |
| `v5_svg_interactivity_mockup.html` | Research | Exploratory iteration on SVG-heavy interaction and SVG filtering for the "Advanced" dashboard feel. |

### Key Reference: `v4_full_workflow_mockup.html`
- **Layout**: Fixed Topbar + Floating Sidebar.
- **Color System**: Uses the new semantic variables (`--surface`, `--surface2`, `--text`, `--brand-glow`).
- **Icons**: Uses official SVG 24x24 icons for navigation.

## Why this matters for Claude:
If you need to add a new panel or feature to `index.html`, refer to the CSS and HTML structure in `v4_full_workflow_mockup.html`. 

### Key CSS Rules to Preserve:
- `.app` / `.main` (flexbox config)
- `.sidebar` / `.topbar` (fixed positioning and shadows)
- `.nav-item` / `.sidebar-item` (hover/active states)
- `.more-dropdown` / `.user-dropdown` (hover-trigger positioning)

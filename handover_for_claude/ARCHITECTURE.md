# Technical Architecture — App Shell & Mode-Switching

This document details the CSS and JS architecture of the standardized layout.

## 1. CSS Framework (Global Layout)
The root container `.app` uses Flexbox to organize the layout into a horizontal stack of **Sidebar** and **Main Content**.

```css
.app {
  display: flex;
  height: 100vh;
  overflow: hidden; /* Prevents global scrollbars */
}

.main {
  flex: 1;
  display: flex;
  flex-direction: row; /* Default: Split View */
  overflow: hidden;
  position: relative;
}
```

### Layout Modes:
- **Default (Split)**: `flex-direction: row`. Left and Right panels are visible.
- **Centered (`mode-centered`)**: `flex-direction: column`. Panels are stacked and centered via `align-items: center`. 
  - *Applied via*: `document.getElementById('mainContainer').classList.toggle('mode-centered', isCenteredMode)`.

## 2. Navigation Synchronization (`switchMode`)
The `switchMode(mode)` function handles the following tasks:
1.  **Mutual Exclusion**: Hides all visibility-toggled panels (`.js-panel`, `.tracker-panel`).
2.  **Layout Toggling**: Adds/removes the `.mode-centered` class based on whether the destination is a utility tool (Tracker, AI Coach, etc.).
3.  **Active State Management**: Toggles `active` class on Sidebar and Topbar items.
4.  **Panel-Specific Initialization**: Calls functions like `renderTracker()` or `initAiCoachPanel()` only when relevant.

## 3. Sidebar vs. Topbar
- **Sidebar (`aside.sidebar`)**: Fixed on the left. Houses icons for high-frequency utility switching.
- **Top Bar (`header.topbar`)**: Fixed at the top. Houses Branding, Breadcrumbs/Nav, Usage Meter, and Account Profile.

## 4. Scroll Management
Each panel (`left-panel`, `right-panel`, `.js-panel`, etc.) now handles its own internal overflow.
```css
.left-panel, .right-panel, .js-panel, .tracker-panel {
  height: 100% !important;
  overflow-y: auto !important;
  padding: 24px !important;
  box-sizing: border-box;
}
```

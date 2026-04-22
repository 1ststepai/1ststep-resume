# Verification & Testing Guide

This guide ensures that the new App Shell and refined navigation are functioning correctly.

## 1. Visual Verification (Desktop - 1440px)
- [ ] **Top Bar**: Should be fixed at the top with a subtle shadow. 
- [ ] **Logo**: Clicking the logo should trigger the "Welcome" or "Reset" state (Resume Tailor).
- [ ] **Sidebar**: Should be a narrow column (56px) on the left with 5-6 icons vertically stacked.
- [ ] **Icons**: Icons should be high-quality SVG (not blurry emojis).
- [ ] **Layout**: There should be NO global scrollbar. Only internal panels should scroll.

## 2. Interaction Verification (`switchMode`)
- [ ] Click **Job Search** (Top Nav) --> Verify Split View.
- [ ] Click **History** (Top Nav) --> Verify Centered View.
- [ ] Click **Tracker icon** (Sidebar) --> Verify Centered View with "Tracker" content.
- [ ] Click **Coach icon** (Sidebar) --> Verify Centered View with "AI Career Coach" content.
- [ ] Click **Profile Audit icon** (Sidebar) --> Verify Centered View.
- [ ] Click **LinkedIn icon** (Sidebar) --> Verify Centered View.

## 3. Dropdown Menus
- [ ] Hover over **"More"** in Topbar --> Verify vertical list of links appears correctly positioned.
- [ ] Hover over **User Avatar** (Top Right) --> Verify vertical list (Account, Profile, Logout) appears correctly.

## 4. Responsive Check (Mobile - 390px)
- [ ] Verify the **Mobile Bottom Nav** is visible.
- [ ] Verify the **Top Bar** is simplified (Logo only).
- [ ] Verify clicking "More" on mobile opens the **Bottom Sheet** overlay.

## 5. Console Audit
- [ ] Open DevTools --> Console. Verify no `switchMode` or `ReferenceError` occurs during navigation.
- [ ] Check for "Undefined CSS variable" warnings.

@echo off
REM Commit script for Chrome extension auth bridge fix
cd /d "C:\Users\evanp\Documents\Claude\Projects\AI-Powered Job Search Platform"

echo.
echo === Staging files ===
git add "1ststep-extension/auth-bridge.js"
git add "1ststep-extension/EXTENSION_STATUS.md"
git add "1ststep-extension/AUTH_BRIDGE_FIX.md"
git add "index.html"

echo.
echo === Showing diff ===
git diff --cached --stat

echo.
echo === Committing ===
git commit -m "Fix Chrome extension auth bridge — Implement MV3 postMessage pattern

- Add postMessage listener in auth-bridge.js to relay profile/resume to chrome.storage.sync
- Update saveProfile() & saveResume() in index.html to trigger sync on user actions
- Add comprehensive AUTH_BRIDGE_FIX.md documentation explaining the issue and solution
- Resolves: 'No resume found' error when extension tries to access user data

Auth bridge now follows proper Manifest V3 isolation pattern:
  Page context → postMessage → content script → chrome.storage.sync

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

echo.
echo === Pushing to main ===
git push origin main

echo.
echo ✓ Done! Changes pushed to GitHub
pause

const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Sidebar Mapping Fix
html = html.replace(
  /const _sbMap = \{[^}]+\};/,
  "const _sbMap = { resume:'sbResume', jobs:'sbJobs', tailored:'sbTailored', tracker:'sbTracker', linkedin:'sbLinkedIn', bulkapply:'sbBulkApply', aicoach:'sbAiCoach', 'profile-audit':'sbProfileAudit' };"
);

// 2. Logic Fix: Ensure ALL utility panels are hidden before showing the active one.
// This prevents the side-by-side glitch.
const hideCode = `
      // Mutual Exclusion: Clear all full-width panels before showing the new one
      document.querySelectorAll('.js-panel, .tracker-panel').forEach(el => {
        el.classList.remove('visible');
        el.style.display = 'none'; // Forced secondary hide
      });
`;

if (!html.includes('// Mutual Exclusion')) {
    html = html.replace(/function switchMode\(mode\) \{([^]+?)currentMode = mode;/, (m, p1) => {
        return `function switchMode(mode) {${p1}currentMode = mode;${hideCode}`;
    });
}

// 3. Absolute Layout & Spacing Overrides
const layoutMarker = '/* --- DEFINITIVE ISOLATION FIX --- */';
const finalLayout = `
    /* --- DEFINITIVE ISOLATION FIX --- */
    html, body {
      height: 100vh !important;
      overflow: hidden !important;
      margin: 0 !important;
      background: var(--bg) !important;
    }

    .app {
      display: flex !important;
      flex-direction: column !important;
      height: 100vh !important;
      width: 100vw !important;
      overflow: hidden !important;
      background: var(--bg) !important;
    }

    .topbar {
      height: 56px !important;
      flex-shrink: 0 !important;
      z-index: 100 !important;
      border-bottom: 1px solid var(--border);
    }

    #appSidebar {
      width: 220px !important;
      z-index: 90 !important;
      border-right: 1px solid var(--border);
    }

    @media (min-width: 1024px) {
      .main {
        position: relative !important;
        display: flex !important;
        flex-direction: row !important;
        flex: 1 !important;
        min-height: 0 !important;
        margin-left: 220px !important;
        height: calc(100vh - 56px) !important;
        overflow: hidden !important;
        padding: 0 !important;
        gap: 0 !important;
        background: var(--bg) !important;
      }

      /* Dual-Panel (Resume / Jobs) */
      .left-panel:not(.js-panel) {
        flex: 0 0 520px !important;
        width: 520px !important;
        height: 100% !important;
        overflow-y: auto !important;
        padding: 16px 20px !important;
        border-right: 1px solid var(--border);
        box-sizing: border-box;
      }
      .right-panel:not(.js-panel) {
        flex: 1 !important;
        height: 100% !important;
        overflow-y: auto !important;
        padding: 16px 20px !important;
        box-sizing: border-box;
      }

      /* Single-Panel Tools (Overlay Strategy) */
      .js-panel.visible,
      .tracker-panel.visible {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        z-index: 50 !important;
        background: var(--bg) !important;
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        flex-direction: column !important;
        overflow-y: auto !important;
        padding: 24px !important;
        box-sizing: border-box;
      }

      /* Centering content inside tool panels */
      .js-panel.visible > div,
      .tracker-panel.visible > div {
        max-width: 860px !important;
        width: 100% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }

      /* Fix overlapping Resume/Tool collision */
      .main.mode-tool .left-panel,
      .main.mode-tool .right-panel {
        display: none !important;
      }
    }
`;

// Replace existing block or inject
if (html.includes('/* --- DEFINITIVE ISOLATION FIX --- */')) {
    const start = html.indexOf('/* --- DEFINITIVE ISOLATION FIX --- */');
    const end = html.indexOf('</style>', start);
    html = html.substring(0, start) + html.substring(end);
}
html = html.replace('</style>', finalLayout + '\n  </style>');

fs.writeFileSync('index.html', html, 'utf8');
console.log('Final absolute isolation polish applied.');

const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Structure Fix: Ensure .app wraps correctly and Topbar is properly constrained.
// We already removed one extra </div>. Let's make sure the structure is:
// <div class="app"> -> Topbar, Sidebar, Main.

// 2. CSS Overrides Consolidation
// I will inject a "GLOBAL LAYOUT OVERRIDE" block at the end of the <style> section 
// to ensure it wins the specificity/cascade battle.

const layoutStyles = `
    /* --- GLOBAL LAYOUT CONSOLIDATION --- */
    html, body {
      height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
    }

    .app {
      display: flex !important;
      flex-direction: column !important;
      height: 100vh !important;
      width: 100vw !important;
      overflow: hidden !important;
    }

    .topbar {
      height: 56px !important;
      flex-shrink: 0 !important;
      z-index: 1000 !important;
      padding: 0 20px !important;
    }

    @media (min-width: 1024px) {
      .main {
        display: flex !important;
        flex-direction: row !important;
        flex: 1 !important;
        min-height: 0 !important; /* Critical for flex scroll */
        margin-left: 220px !important; /* Matches Sidebar Width */
        padding: 16px 20px !important;
        gap: 18px !important;
        align-items: stretch !important;
        justify-content: flex-start !important;
        overflow: hidden !important;
        max-width: none !important;
      }

      .left-panel {
        flex: 0 0 520px !important;
        width: 520px !important;
        height: 100% !important;
        overflow-y: auto !important;
        padding-right: 10px;
        box-sizing: border-box;
      }

      .right-panel {
        flex: 1 !important;
        min-width: 0 !important;
        height: 100% !important;
        overflow-y: auto !important;
        margin-top: 0 !important;
        box-sizing: border-box;
      }

      /* Full-Width panels overrides */
      .left-panel.tracker-panel,
      .left-panel.js-panel,
      .left-panel.tailored-panel,
      .left-panel#linkedinPanel,
      .left-panel#bulkApplyPanel,
      .left-panel#aicoachPanel,
      .left-panel#profileAuditPanel,
      .right-panel.tracker-panel,
      .right-panel.js-panel,
      .right-panel.tailored-panel,
      .right-panel#linkedinPanel,
      .right-panel#bulkApplyPanel,
      .right-panel#aicoachPanel,
      .right-panel#profileAuditPanel {
         max-width: 100% !important;
         width: 100% !important;
         flex: 1 1 100% !important;
      }

      #tailorHeadline {
        margin-bottom: 12px !important;
      }
      #tailorHeadline p:first-child {
        margin-bottom: 2px !important;
      }
    }

    /* Mobile Reset: ensures my forced styles don't break the original mobile layout */
    @media (max-width: 1023px) {
      .main {
        margin-left: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        overflow-y: auto !important;
        height: auto !important;
        flex: none !important;
        padding-bottom: 100px !important; /* Bottom nav space */
      }
      .left-panel, .right-panel {
        width: 100% !important;
        height: auto !important;
        max-width: none !important;
        overflow: visible !important;
      }
    }
`;

// Find the last </style> tag and insert the consolidation block before it.
html = html.replace('</style>', layoutStyles + '\n  </style>');

fs.writeFileSync('index.html', html, 'utf8');
console.log('Layout consolidation styles injected.');

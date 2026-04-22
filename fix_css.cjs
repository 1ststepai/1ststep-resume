const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const oldBlock1 = `@media (min-width: 1024px) {
      .main {
        flex-direction: row !important;
        align-items: flex-start !important;
        justify-content: center !important;
        /* padding + gap overridden by density block below */
      }

      .left-panel {
        width: auto !important;
        flex-shrink: 0 !important;
        /* max-width: 520px set in density block below */
      }

      .right-panel {
        flex: 1 !important;
        min-width: 0 !important;
        /* max-width removed ï¿½ flex:1 fills remaining space */
        margin-top: 0 !important;
      }
    }`;

const oldBlock2 = `@media (min-width: 1024px) {
      .main {
        padding: 16px 28px 40px !important;
        gap: 18px !important;
        align-items: flex-start !important;
      }

      .left-panel {
        max-width: 520px !important;
        /* sticky so it stays in view while scrolling results */
        position: sticky !important;
        top: 72px !important;
        align-self: flex-start !important;
      }

      .right-panel {
        max-width: none !important;
        min-width: 0 !important;
        flex: 1 !important;
        /* Allow right panel to grow to fill available width */
      }
    }`;

const newBlock = `@media (min-width: 1024px) {
      .main {
        flex-direction: row !important;
        align-items: stretch !important;
        justify-content: center !important;
        overflow: hidden !important; /* Fix Desktop Scroll: prevents whole page scroll */
        padding: 16px 28px 16px !important; /* reduced bottom padding */
        gap: 18px !important;
      }

      .left-panel {
        /* FIXED: removed width: auto !important to allow 100% overrides */
        width: 100% !important;
        max-width: 520px !important;
        flex: 0 0 auto !important;
        height: 100% !important;
        overflow-y: auto !important; /* Independent scroll */
        position: static !important; /* Remove sticky so it scrolls normally */
        padding-bottom: 24px;
        box-sizing: border-box;
      }

      .right-panel {
        flex: 1 !important;
        min-width: 0 !important;
        max-width: none !important;
        margin-top: 0 !important;
        height: 100% !important;
        overflow-y: auto !important; /* Independent scroll */
        padding-bottom: 24px;
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
         flex: 1 1 100% !important;
      }
    }`;

// Since the `ï¿½` might cause exact string match failures due to encoding mismatches in NodeJS vs PS, I'll use regex for the blocks safely.
html = html.replace(/@media \(min-width: 1024px\) \{\s*\.main \{\s*flex-direction: row !important;[\s\S]*?margin-top: 0 !important;\s*\}\s*\}/, newBlock);

// Remove the second block entirely to avoid conflicts, since we consolidated everything into the newBlock.
html = html.replace(/@media \(min-width: 1024px\) \{\s*\.main \{\s*padding: 16px 28px 40px !important;[\s\S]*?\/\* Allow right panel to grow to fill available width \*\/\s*\}\s*\}/, '/* consolidated 1024px media query */');

// Wait, the user also mentioned "Ensure each panel has independent overflow-y: auto".
// I'll make sure there is no .left-panel rule overriding it elsewhere.
// Also we need to make sure the scrollbars look okay over white backgrounds if needed, but the native ones are fine.

fs.writeFileSync('index.html', html, 'utf8');

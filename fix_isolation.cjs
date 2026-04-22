const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Remove the previously injected "GLOBAL LAYOUT CONSOLIDATION" block to start fresh.
// I'll look for the comment I added.
const marker = '/* --- GLOBAL LAYOUT CONSOLIDATION --- */';
if (html.includes(marker)) {
    const start = html.indexOf(marker);
    const end = html.indexOf('</style>', start);
    html = html.substring(0, start) + html.substring(end);
}

// 2. Definitive Layout Fix
// We want .main to be a row ONLY for Resume/Jobs modes, 
// OR we want tools to explicitly hide their neighbors.

const toolFixes = `
    /* --- NEW ISOLATION FIX --- */
    
    html, body {
      height: 100vh !important;
      overflow: hidden !important;
    }

    .app {
      display: flex !important;
      flex-direction: column !important;
      height: 100vh !important;
      overflow: hidden !important;
    }

    .topbar {
      height: 56px !important;
      flex-shrink: 0 !important;
    }

    @media (min-width: 1024px) {
      .main {
        display: flex !important;
        flex-direction: row !important;
        flex: 1 !important;
        min-height: 0 !important;
        margin-left: 220px !important;
        padding: 0 !important; /* Managed by panels */
        overflow: hidden !important;
        gap: 0 !important;
        align-items: stretch !important;
      }

      /* Base panels (Resume) */
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

      /* Tool Panels (e.g. AI Coach, Tracker, LinkedIn) */
      /* These are direct children of .main and must take 100% when visible */
      .main > .js-panel.visible,
      .main > .tracker-panel.visible {
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
        padding: 0 !important; /* Inner content handles padding */
      }

      /* Ensure Job Search columns still work */
      #jobSearchLeft.visible,
      #jobSearchRight.visible {
        position: static !important;
        height: 100% !important;
        overflow-y: auto !important;
        flex: 1 !important;
        display: flex !important;
      }
      #jobSearchLeft.visible {
        flex: 0 0 520px !important;
        border-right: 1px solid var(--border);
      }
    }

    /* Fixed Sidebar Width */
    #appSidebar {
      width: 220px !important;
    }
`;

// Inject before the closing </style>
html = html.replace('</style>', toolFixes + '\n  </style>');

// 3. JS Reinforcement: Ensure switchMode is robust.
// I'll check if I need to wrap panels or if the absolute positioning fix above is enough.
// Absolute positioning with z-index is the safest "nuclear" option to ensure only ONE panel shows.

fs.writeFileSync('index.html', html, 'utf8');
console.log('Isolation fix applied.');

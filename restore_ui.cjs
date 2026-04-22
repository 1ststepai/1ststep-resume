const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// 1. Sidebar CSS
code = code.replace(
  '#appSidebar { display: flex; width: 220px; position: fixed; left: 0; top: 56px; bottom: 0; background: var(--surface); border-right: 1px solid var(--border); z-index: 100; }',
  '#appSidebar { display: none; flex-direction: column; }'
);

// 2. Mobile Bottom Nav CSS
code = code.replace(
  '.mobile-bottom-nav.nav-unlocked {',
  '.mobile-bottom-nav.nav-unlocked { display: flex !important;'
);

// 3. Remove .run-section empty warnings
code = code.replace(
  '    /* -- 9. run-section: tighter ------------------------------------------ */\r\n    .run-section {\r\n      /* already uses panel-section padding overridden above */\r\n    }',
  '    /* -- 9. run-section: tighter ------------------------------------------ */'
);

// 4. Update JS syntax error (fix what was already a template literal)
code = code.replace(
  "sbNameEl.textContent = p.firstName ? `${p.firstName}`.trim() : 'Account';",
  "sbNameEl.textContent = p.firstName ? p.firstName.trim() : 'Account';"
); 
code = code.replace(
  "sbNameEl.textContent = p.firstName ? ${p.firstName}.trim() : 'Account';",
  "sbNameEl.textContent = p.firstName ? p.firstName.trim() : 'Account';"
); 

// 5. Update Sidebar footer spacer
code = code.replace(
  /(<button class="sb-item" id="sbBulkApply".*?<\/button>)\s*<\/div>\s*<div class="sb-divider">/s,
  '$1<div style="flex:1"></div></div><div class="sb-divider">'
);

// 6. Fix switchMode mappings
code = code.replace(
  /\[\'sbResume\',\'sbJobs\',\'sbTailored\',\'sbTracker\',\'sbLinkedIn\',\'sbBulkApply\',\'sbAiCoach\',\'sbProfileAudit\'\]\.forEach\(\w+ => \{\s*document\.getElementById\(\w+\)\?\.classList\.remove\('active'\);\s*\}\);\s*const _sbMap = \{.+?\};/s, 
  `['sbResume','sbJobs','sbTailored','sbTracker','sbLinkedIn','sbBulkApply','sbAiCoach','sbProfileAudit'].forEach(id => {
        document.getElementById(id)?.classList.remove('active');
      });
      const _sbMap = { resume:'sbResume', jobs:'sbJobs', tailored:'sbTailored', tracker:'sbTracker', linkedin:'sbLinkedIn', bulkapply:'sbBulkApply', 'profile-audit':'sbProfileAudit', aicoach:'sbAiCoach' };`
);

// 7. Fix setMobileNav mappings
const oldSetMobileNav = `    function setMobileNav(mode) {
      document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
      let mapping = {
        'resume': 'mobileNavResume',
        'jobs': 'mobileNavJobs',
        'tailored': 'mobileNavTailored',
        'tracker': 'mobileNavTracker',
        'linkedin': 'mobileNavLinkedIn'
      };
      const id = mapping[mode];
      if (id) {
        const btn = document.getElementById(id);
        if (btn) btn.classList.add('active');
      }
    }`;
const newSetMobileNav = `    function setMobileNav(mode) {
      document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
      let mapping = {
        'resume': 'mobileNavResume',
        'jobs': 'mobileNavJobs',
        'tailored': 'mobileNavTailored',
        'tracker': 'mobileNavTracker',
        'linkedin': 'mobileNavMore',
        'profile-audit': 'mobileNavMore',
        'aicoach': 'mobileNavMore',
        'bulkapply': 'mobileNavMore'
      };
      const id = mapping[mode];
      if (id) {
        const btn = document.getElementById(id);
        if (btn) btn.classList.add('active');
      }
    }`;
code = code.replace(oldSetMobileNav, newSetMobileNav);

// Remove the inline style from AiCoach
code = code.replace(/<button class="sb-item" id="sbAiCoach"([^>]*?)style="display:none"/g, '<button class="sb-item" id="sbAiCoach"$1');


// 8. Find mobile nav and replace with standard sheet 
const mobileNavStart = code.lastIndexOf('<!-- Mobile Bottom Navigation -->');
let finalCode = code;
if (mobileNavStart !== -1) {
  const chopStart = mobileNavStart;
  
  // Need to preserve the GHL Widget and Modals at the bottom of the file
  let suffixIndex = code.indexOf('<!-- GHL Live Chat Widget -->', chopStart);
  if (suffixIndex === -1) suffixIndex = code.indexOf('<!-- GHL Live Chat Widget Module -->', chopStart);
  if (suffixIndex === -1) suffixIndex = code.indexOf('<script src="https://widgets.leadconnectorhq.com/loader.js"', chopStart);
  
  const suffix = suffixIndex !== -1 ? code.substring(suffixIndex) : '</body></html>';

  const tail = `  <!-- Mobile Bottom Navigation -->
  <nav class="mobile-bottom-nav">
    <button class="mobile-nav-item active" id="mobileNavResume" onclick="switchMode('resume'); setMobileNav('resume')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      Tailor
    </button>
    <button class="mobile-nav-item" id="mobileNavJobs" onclick="switchMode('jobs'); setMobileNav('jobs')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      Jobs
    </button>
    <button class="mobile-nav-item" id="mobileNavTailored" onclick="switchMode('tailored'); setMobileNav('tailored')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      Resumes
      <span class="mobile-nav-badge" id="mobileNavTailoredBadge" style="display:none">0</span>
    </button>
    <button class="mobile-nav-item" id="mobileNavTracker" onclick="switchMode('tracker'); setMobileNav('tracker')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
      Tracker
      <span class="mobile-nav-badge" id="mobileNavTrackerBadge" style="display:none">0</span>
    </button>
    <button class="mobile-nav-item" id="mobileNavMore" onclick="openMobileMoreSheet()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
      More
    </button>
  </nav>

  <!-- Mobile More Bottom Sheet -->
  <div id="mobileMoreSheet" style="display:none;position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px)" onclick="closeMobileMoreSheet()">
    <div onclick="event.stopPropagation()" style="position:absolute;bottom:0;left:0;right:0;background:var(--surface);border-radius:24px 24px 0 0;padding:8px 0 calc(24px + env(safe-area-inset-bottom))">
      <div style="width:36px;height:4px;background:var(--border2);border-radius:100px;margin:12px auto 16px"></div>
      <div style="padding:0 20px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--muted)">More Tools</div>
      
      <button onclick="switchMode('linkedin');setMobileNav('linkedin');closeMobileMoreSheet()" style="width:100%;display:flex;align-items:center;gap:14px;padding:13px 24px;background:none;border:none;font-family:'Inter',sans-serif;font-size:16px;font-weight:600;color:var(--text);cursor:pointer;text-align:left;transition:background 0.1s" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background='none'">
        <span style="font-size:20px;width:28px;text-align:center">💼</span>
        <span>LinkedIn Optimizer</span>
      </button>
      
      <button onclick="switchMode('profile-audit');setMobileNav('profile-audit');closeMobileMoreSheet()" style="width:100%;display:flex;align-items:center;gap:14px;padding:13px 24px;background:none;border:none;font-family:'Inter',sans-serif;font-size:16px;font-weight:600;color:var(--text);cursor:pointer;text-align:left;transition:background 0.1s" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background='none'">
        <span style="font-size:20px;width:28px;text-align:center">🔍</span>
        <span>Profile Audit</span>
      </button>
      
      <button onclick="switchMode('aicoach');setMobileNav('aicoach');closeMobileMoreSheet()" style="width:100%;display:flex;align-items:center;gap:14px;padding:13px 24px;background:none;border:none;font-family:'Inter',sans-serif;font-size:16px;font-weight:600;color:var(--text);cursor:pointer;text-align:left;transition:background 0.1s" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background='none'">
        <span style="font-size:20px;width:28px;text-align:center">💬</span>
        <span>AI Career Coach</span>
      </button>
      
      <button onclick="switchMode('bulkapply');setMobileNav('bulkapply');closeMobileMoreSheet()" style="width:100%;display:flex;align-items:center;gap:14px;padding:13px 24px;background:none;border:none;font-family:'Inter',sans-serif;font-size:16px;font-weight:600;color:var(--text);cursor:pointer;text-align:left;transition:background 0.1s" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background='none'">
        <span style="font-size:20px;width:28px;text-align:center">⚡</span>
        <span>Bulk Apply <span style="font-size:11px;font-weight:500;color:var(--muted)">· Complete plan</span></span>
      </button>
      
      <div style="height:1px;background:var(--border);margin:8px 24px"></div>
      
      <button onclick="openProfileModal();closeMobileMoreSheet()" style="width:100%;display:flex;align-items:center;gap:14px;padding:13px 24px;background:none;border:none;font-family:'Inter',sans-serif;font-size:16px;font-weight:500;color:var(--text2);cursor:pointer;text-align:left;transition:background 0.1s" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background='none'">
        <span style="font-size:20px;width:28px;text-align:center">👤</span>
        <span>Account & Subscription</span>
      </button>
      <button onclick="openFeedbackForm();closeMobileMoreSheet()" style="width:100%;display:flex;align-items:center;gap:14px;padding:13px 24px;background:none;border:none;font-family:'Inter',sans-serif;font-size:16px;font-weight:500;color:var(--text2);cursor:pointer;text-align:left;transition:background 0.1s" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background='none'">
        <span style="font-size:20px;width:28px;text-align:center">✉️</span>
        <span>Give Feedback</span>
      </button>
      <button onclick="signOutAndClear();closeMobileMoreSheet()" style="width:100%;display:flex;align-items:center;gap:14px;padding:13px 24px;background:none;border:none;font-family:'Inter',sans-serif;font-size:16px;font-weight:500;color:var(--red);cursor:pointer;text-align:left;transition:background 0.1s" onmouseenter="this.style.background='rgba(239, 68, 68, 0.08)'" onmouseleave="this.style.background='none'">
        <span style="font-size:20px;width:28px;text-align:center">🚪</span>
        <span>Logout</span>
      </button>
    </div>
  </div>

`;
  finalCode = code.substring(0, chopStart) + tail + suffix;
}

fs.writeFileSync('index.html', finalCode, 'utf8');

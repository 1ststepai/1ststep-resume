/**
 * resume-builder.js — Drop-in Resume Builder Wizard for 1stStep.ai
 *
 * Usage: <script src="resume-builder.js"></script> before </body>
 * Opens via: openResumeBuilder()
 *
 * What this file contains:
 *  1. Master Resume JSON schema (MASTER_RESUME_SCHEMA)
 *  2. Wizard UI — 5-step form injected into a modal overlay
 *  3. AI bullet-point enhancer (enhanceBullets) → calls /api/claude
 *  4. Export helpers:
 *       - resumeToPlainText()  → feeds existing tailoring engine
 *       - openResumeTemplate() → opens existing tplClassic/tplModern/etc.
 *
 * Compatibility: uses the same JSON shape as parseResumeForTemplate()
 * so all 4 existing resume templates (Classic, Modern, Minimal, Executive)
 * work with the wizard output with zero changes.
 *
 * Dependencies: Tailwind CDN (already in index.html), /api/claude proxy
 * No npm packages required.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. MASTER RESUME SCHEMA
//    Every field is optional — the wizard fills what the user provides.
//    ATS-compatible: plain text bullets, array-based skills, standard sections.
// ─────────────────────────────────────────────────────────────────────────────

const MASTER_RESUME_SCHEMA = {
  meta: {
    version: '1.0',
    createdAt: null,   // ISO timestamp — set on first save
    updatedAt: null,   // ISO timestamp — updated on each save
  },

  // ── Section 1: Profile ───────────────────────────────────────────────────
  // Maps directly to: name, email, phone, location, linkedin, website, title, summary
  // in parseResumeForTemplate() — zero conversion needed.
  name:     '',        // "Jane Smith"
  title:    '',        // "Senior Product Manager" — shown under name on resume
  email:    '',
  phone:    '',        // "+1 (555) 123-4567"
  location: '',        // "New York, NY" — city + state only (ATS standard)
  linkedin: '',        // "linkedin.com/in/janesmith" (no https:// needed)
  website:  '',        // portfolio URL

  summary:  '',        // 2-4 sentence professional summary. ATS reads this first.

  // ── Section 2: Experience ────────────────────────────────────────────────
  // Array order = display order on resume. Most recent first.
  experience: [
    // {
    //   id:        'exp_1',      // internal — used by wizard for keyed re-renders
    //   company:   'Acme Corp',
    //   title:     'Product Manager',
    //   dates:     'Jan 2022 – Present',  // single string for template compat
    //   location:  'New York, NY',
    //   remote:    false,                 // if true, appends "(Remote)" to location display
    //   bullets:   [                      // plain text — no markdown, no HTML
    //     'Led cross-functional team of 8 to ship payment redesign, reducing checkout drop-off by 23%',
    //   ],
    // }
  ],

  // ── Section 3: Education ─────────────────────────────────────────────────
  education: [
    // {
    //   id:      'edu_1',
    //   school:  'State University',
    //   degree:  'Bachelor of Science',
    //   field:   'Computer Science',
    //   dates:   'Sep 2016 – May 2020',
    //   location: 'Boston, MA',
    //   gpa:     '3.8',           // omit or leave blank if not including
    //   honors:  'Magna Cum Laude',
    // }
  ],

  // ── Section 4: Skills ────────────────────────────────────────────────────
  // ATS tip: keep skills as arrays of individual terms.
  // The template renderers join them with commas.
  skills: [],           // flat array for template compat: ['Python', 'React', 'SQL']
  _skillCategories: {   // structured version — wizard populates both
    technical: [],      // ['Python', 'React', 'SQL']
    tools:     [],      // ['Figma', 'Jira', 'AWS']
    soft:      [],      // ['Leadership', 'Communication']
    languages: [],      // ['Spanish (conversational)']
  },

  // ── Section 5: Extras ────────────────────────────────────────────────────
  certifications: [
    // { name: 'AWS Solutions Architect', issuer: 'Amazon', date: '2023', url: '' }
  ],
  projects: [
    // { id: 'prj_1', name: 'OpenResume', url: 'github.com/...', bullets: ['Built...'] }
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. WIZARD STATE
// ─────────────────────────────────────────────────────────────────────────────

const _wb = {   // wizard "black box" — all state lives here
  step:   1,
  total:  5,
  resume: null,   // deep clone of MASTER_RESUME_SCHEMA, populated as user types
  el:     null,   // root DOM node of the wizard modal
};

const STEP_LABELS = ['Profile', 'Experience', 'Education', 'Skills', 'Review'];
// Short labels for the step bar on narrow screens
const STEP_SHORT  = ['Info', 'Exp', 'Edu', 'Skills', 'Done'];

function _uid() { return '_' + Math.random().toString(36).slice(2, 9); }

function _deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

/** Returns true when the browser viewport is phone-width (≤ 540px). */
function _isMobile() { return window.innerWidth <= 540; }

/** Returns a CSS grid-template-columns value: 2 cols on desktop, 1 on mobile. */
function _m2col() { return _isMobile() ? '1fr' : '1fr 1fr'; }

function _wbResume() {
  if (!_wb.resume) {
    _wb.resume = _deepClone(MASTER_RESUME_SCHEMA);
    _wb.resume.meta.createdAt = new Date().toISOString();
    // Pre-populate from existing session resume if available
    const existing = typeof loadResume === 'function' ? loadResume() : null;
    if (existing?.text) {
      // Existing resume is plain text — AI will parse it later
      _wb.resume._rawImported = existing.text;
    }
  }
  return _wb.resume;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. WIZARD MODAL — OPEN / CLOSE
// ─────────────────────────────────────────────────────────────────────────────

function openResumeBuilder() {
  if (document.getElementById('resumeBuilderModal')) return; // already open

  _wb.step = 1;
  _wb.resume = null; // reset — will re-init on _wbResume() call
  _wbResume();       // trigger pre-populate from session if available

  const modal = document.createElement('div');
  modal.id = 'resumeBuilderModal';
  modal.style.cssText = [
    'position:fixed;inset:0;z-index:99999',
    'display:flex;align-items:center;justify-content:center',
    'background:rgba(0,0,0,0.55);backdrop-filter:blur(4px)',
    'font-family:system-ui,sans-serif',
  ].join(';');

  modal.innerHTML = `
    <div id="rbCard" style="
      width:min(680px,95vw);max-height:90vh;overflow-y:auto;
      background:#0F172A;border-radius:16px;
      border:1px solid rgba(99,102,241,0.25);
      box-shadow:0 24px 64px rgba(0,0,0,0.5);
      display:flex;flex-direction:column;
    ">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:20px 24px 0;flex-shrink:0">
        <div>
          <h2 style="margin:0;font-size:18px;font-weight:700;color:#F1F5F9">
            Build Your Resume
          </h2>
          <p style="margin:4px 0 0;font-size:12px;color:#64748B">
            Your data stays in your browser — never stored on our servers
          </p>
        </div>
        <button onclick="closeResumeBuilder()"
          style="background:none;border:none;color:#64748B;cursor:pointer;font-size:20px;
                 line-height:1;padding:4px 8px;border-radius:6px"
          onmouseenter="this.style.color='#F1F5F9'" onmouseleave="this.style.color='#64748B'"
        >✕</button>
      </div>

      <!-- Step indicator -->
      <div id="rbStepBar" style="padding:12px 16px 0;flex-shrink:0"></div>

      <!-- Step content -->
      <div id="rbContent" style="padding:16px;flex:1;min-height:0"></div>

      <!-- Footer nav -->
      <div id="rbFooter" style="
        display:flex;justify-content:space-between;align-items:center;
        padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);flex-shrink:0;
        gap:8px
      "></div>
    </div>
  `;

  document.body.appendChild(modal);
  _wb.el = modal;
  _rbRender();
}

function closeResumeBuilder() {
  const modal = document.getElementById('resumeBuilderModal');
  if (modal) modal.remove();
  _wb.el = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. RENDER DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

function _rbRender() {
  _rbRenderStepBar();
  _rbRenderContent();
  _rbRenderFooter();
}

function _rbRenderStepBar() {
  const bar = document.getElementById('rbStepBar');
  if (!bar) return;
  const mobile = _isMobile();
  const labels = mobile ? STEP_SHORT : STEP_LABELS;
  bar.innerHTML = `
    <div style="display:flex;gap:${mobile ? '4px' : '6px'};align-items:center;margin-bottom:6px;overflow:hidden">
      ${labels.map((label, i) => {
        const n = i + 1;
        const active   = n === _wb.step;
        const done     = n < _wb.step;
        const dotColor  = done ? '#6366F1' : active ? '#818CF8' : '#1E293B';
        const textColor = done || active ? '#C7D2FE' : '#475569';
        return `
          <div style="display:flex;align-items:center;gap:${mobile ? '3px' : '6px'};min-width:0;flex-shrink:${active ? 0 : 1}">
            <div style="
              width:${mobile ? '20px' : '22px'};height:${mobile ? '20px' : '22px'};
              border-radius:50%;background:${dotColor};flex-shrink:0;
              display:flex;align-items:center;justify-content:center;
              font-size:10px;font-weight:700;color:#fff;
            ">${done ? '✓' : n}</div>
            <span style="
              font-size:${mobile ? '10px' : '12px'};color:${textColor};
              font-weight:${active ? 600 : 400};
              white-space:nowrap;overflow:hidden;
              max-width:${active ? '80px' : mobile ? '28px' : '60px'};
              transition:max-width .2s;
            ">${label}</span>
            ${n < labels.length
              ? `<div style="flex:1;height:1px;background:rgba(255,255,255,0.08);min-width:${mobile ? '6px' : '12px'}"></div>`
              : ''}
          </div>`;
      }).join('')}
    </div>
  `;
}

function _rbRenderContent() {
  const el = document.getElementById('rbContent');
  if (!el) return;
  const steps = [null, _rbStep1, _rbStep2, _rbStep3, _rbStep4, _rbStep5];
  el.innerHTML = steps[_wb.step]?.() || '';
  steps[_wb.step + '_init']?.(); // optional post-render hook
}

function _rbRenderFooter() {
  const el = document.getElementById('rbFooter');
  if (!el) return;
  const isFirst = _wb.step === 1;
  const isLast  = _wb.step === _wb.total;
  el.innerHTML = `
    <button onclick="_rbBack()" style="
      padding:9px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;
      background:${isFirst ? 'transparent' : 'rgba(255,255,255,0.06)'};
      color:${isFirst ? '#1E293B' : '#94A3B8'};border:1px solid transparent;
      transition:all .15s;
    " ${isFirst ? 'disabled' : ''}
      onmouseenter="if(!this.disabled)this.style.background='rgba(255,255,255,0.1)'"
      onmouseleave="if(!this.disabled)this.style.background='rgba(255,255,255,0.06)'"
    >← Back</button>

    <span style="font-size:12px;color:#475569">Step ${_wb.step} of ${_wb.total}</span>

    ${isLast
      ? `<button onclick="_rbExport()" style="
            padding:9px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;
            background:linear-gradient(135deg,#6366F1,#4F46E5);color:#fff;border:none;
          ">Finish & Use Resume →</button>`
      : `<button onclick="_rbNext()" style="
            padding:9px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;
            background:linear-gradient(135deg,#6366F1,#4F46E5);color:#fff;border:none;
          ">Next →</button>`
    }
  `;
}

function _rbBack() {
  _rbSaveCurrentStep();
  if (_wb.step > 1) { _wb.step--; _rbRender(); }
}

function _rbNext() {
  _rbSaveCurrentStep();
  if (_wb.step < _wb.total) { _wb.step++; _rbRender(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. STEP RENDERERS
// ─────────────────────────────────────────────────────────────────────────────

/** Shared input style */
const _inp = `
  style="width:100%;box-sizing:border-box;
  background:#1E293B;border:1px solid rgba(255,255,255,0.1);
  border-radius:8px;padding:9px 12px;font-size:13px;color:#F1F5F9;
  outline:none;margin-top:4px"
  onfocus="this.style.borderColor='rgba(99,102,241,0.6)'"
  onblur="this.style.borderColor='rgba(255,255,255,0.1)'"
`;

function _field(label, inputHtml, hint = '') {
  return `
    <div style="margin-bottom:14px">
      <label style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;
                    letter-spacing:.04em">${label}</label>
      ${inputHtml}
      ${hint ? `<p style="margin:4px 0 0;font-size:11px;color:#475569">${hint}</p>` : ''}
    </div>`;
}

// ── LinkedIn OAuth flow — works as popup (desktop) or new tab (mobile) ────────
function _rbLinkedInConnect() {
  // Clear any stale auth result and cancel any in-flight attempt before starting
  localStorage.removeItem('1ststep_li_auth');
  if (window._rbLiPollInterval) { clearInterval(window._rbLiPollInterval); window._rbLiPollInterval = null; }
  if (window._rbLiOnMessage)    { window.removeEventListener('message', window._rbLiOnMessage); window._rbLiOnMessage = null; }

  fetch('/api/subscription?action=linkedin-init')
    .then(r => r.json())
    .then(({ url, error }) => {
      if (error || !url) { _rbShowToast('LinkedIn not configured'); return; }

      // Try popup first (desktop). On mobile this opens a new tab.
      const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
      let popup = null;
      if (!isMobile) {
        popup = window.open(url, 'linkedin_auth',
          'width=520,height=640,top=' + Math.round((screen.height-640)/2) + ',left=' + Math.round((screen.width-520)/2));
      }
      // If popup was blocked or mobile — redirect the current tab
      if (!popup || popup.closed) {
        window.location.href = url;
        return;
      }

      // Desktop popup: listen for postMessage
      window.addEventListener('message', onMessage);
      window._rbLiOnMessage = onMessage;
      const checkClosed = setInterval(() => {
        if (popup && popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', onMessage);
          window._rbLiOnMessage = null;
        }
      }, 800);
    })
    .catch(() => _rbShowToast('Could not reach LinkedIn'));

  // Also poll localStorage — catches the mobile redirect-back case
  const pollStart = Date.now();
  window._rbLiPollInterval = setInterval(() => {
    const raw = localStorage.getItem('1ststep_li_auth');
    if (!raw) {
      if (Date.now() - pollStart > 5 * 60 * 1000) { clearInterval(window._rbLiPollInterval); window._rbLiPollInterval = null; } // 5 min timeout
      return;
    }
    try {
      const { ts, payload } = JSON.parse(raw);
      if (Date.now() - ts > 5 * 60 * 1000) { localStorage.removeItem('1ststep_li_auth'); return; } // stale
      localStorage.removeItem('1ststep_li_auth');
      clearInterval(window._rbLiPollInterval); window._rbLiPollInterval = null;
      if (window._rbLiOnMessage) { window.removeEventListener('message', window._rbLiOnMessage); window._rbLiOnMessage = null; }
      _rbHandleLinkedInProfile(payload);
    } catch(e) { localStorage.removeItem('1ststep_li_auth'); }
  }, 500);

  function onMessage(e) {
    if (e.origin !== window.location.origin) return;
    if (!e.data || e.data.type !== '1ststep_linkedin') return;
    window.removeEventListener('message', onMessage); window._rbLiOnMessage = null;
    clearInterval(window._rbLiPollInterval); window._rbLiPollInterval = null;
    _rbHandleLinkedInProfile(e.data.payload);
  }
}

function _rbHandleLinkedInProfile({ profile, error } = {}) {
  if (error || !profile) {
    _rbShowToast(error === 'access_denied' ? 'LinkedIn connection cancelled' : 'LinkedIn sign-in failed');
    return;
  }

  // Populate Step 1 fields
  const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  set('rb_name',  profile.name);
  set('rb_email', profile.email);

  // Save into the in-progress resume object
  const r = _wbResume();
  if (profile.name)      r.name  = profile.name;
  if (profile.email)     r.email = profile.email;
  if (profile.firstName) r._liFirstName = profile.firstName;
  if (profile.lastName)  r._liLastName  = profile.lastName;
  _wbSetResume(r);

  // Update button to connected state
  const btn = document.getElementById('rb_li_btn');
  if (btn) {
    btn.innerHTML = `<span style="font-size:15px">✓</span> Connected as ${_esc(profile.firstName || profile.name)}`;
    btn.style.cssText += ';background:rgba(34,197,94,0.15);border-color:rgba(34,197,94,0.4);color:#4ADE80';
    btn.disabled = true;
  }

  _rbShowToast('LinkedIn connected — fields filled ✓');

  // Offer LinkedIn PDF resume import
  setTimeout(() => {
    const importBanner = document.getElementById('rb_li_import_banner');
    if (importBanner) importBanner.style.display = 'flex';
  }, 600);

  // Focus first empty field
  setTimeout(() => {
    const next = ['rb_phone','rb_location','rb_title','rb_summary']
      .map(id => document.getElementById(id))
      .find(el => el && !el.value.trim());
    if (next) next.focus();
  }, 300);
}

function _rbShowToast(msg) {
  if (typeof showToast === 'function') { showToast(msg); return; }
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1E293B;color:#F1F5F9;padding:10px 18px;border-radius:8px;font-size:13px;z-index:9999;border:1px solid rgba(255,255,255,0.1)';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Step 1: Profile ──────────────────────────────────────────────────────────
function _rbStep1() {
  const r = _wbResume();
  return `
    <h3 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#F1F5F9">Profile</h3>

    <!-- LinkedIn connect button -->
    <button id="rb_li_btn" onclick="_rbLinkedInConnect()" style="
      width:100%;display:flex;align-items:center;justify-content:center;gap:10px;
      padding:11px 16px;border-radius:10px;margin-bottom:20px;cursor:pointer;
      background:rgba(10,102,194,0.12);border:1.5px solid rgba(10,102,194,0.35);
      color:#93C5FD;font-size:13.5px;font-weight:600;transition:all 0.15s
    "
    onmouseenter="this.style.background='rgba(10,102,194,0.22)'"
    onmouseleave="this.style.background='rgba(10,102,194,0.12)'">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      Continue with LinkedIn
    </button>
    <!-- LinkedIn PDF import banner — shown after OAuth success -->
    <div id="rb_li_import_banner" style="
      display:none;align-items:flex-start;gap:12px;
      background:rgba(10,102,194,0.1);border:1.5px solid rgba(10,102,194,0.3);
      border-radius:10px;padding:14px 16px;margin-bottom:20px
    ">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#60A5FA" style="flex-shrink:0;margin-top:1px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:#93C5FD;margin-bottom:4px">Import your resume from LinkedIn</div>
        <div style="font-size:12px;color:#94A3B8;line-height:1.5;margin-bottom:10px">
          Don't have a resume file? Download your LinkedIn profile as a PDF and we'll convert it into a formatted resume automatically.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noopener" style="
            font-size:12px;font-weight:600;color:#93C5FD;text-decoration:none;
            padding:6px 12px;border-radius:7px;border:1px solid rgba(10,102,194,0.4);
            background:rgba(10,102,194,0.15);display:inline-flex;align-items:center;gap:5px
          ">↗ Download LinkedIn PDF</a>
          <button onclick="openLinkedInPdfModal();closeResumeBuilder?.()" style="
            font-size:12px;font-weight:600;color:#F1F5F9;cursor:pointer;
            padding:6px 12px;border-radius:7px;border:1px solid rgba(99,102,241,0.4);
            background:rgba(99,102,241,0.2)
          ">Upload & Import →</button>
        </div>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
      <div style="flex:1;height:1px;background:rgba(255,255,255,0.08)"></div>
      <span style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.6px">or fill in manually</span>
      <div style="flex:1;height:1px;background:rgba(255,255,255,0.08)"></div>
    </div>

    <div style="display:grid;grid-template-columns:${_m2col()};gap:0 16px">
      ${_field('Full Name', `<input id="rb_name" ${_inp} value="${_esc(r.name)}" placeholder="Jane Smith">`)}
      ${_field('Professional Title', `<input id="rb_title" ${_inp} value="${_esc(r.title)}" placeholder="Senior Product Manager">`)}
      ${_field('Email', `<input id="rb_email" ${_inp} type="email" value="${_esc(r.email)}" placeholder="jane@example.com">`)}
      ${_field('Phone', `<input id="rb_phone" ${_inp} value="${_esc(r.phone)}" placeholder="+1 (555) 123-4567">`)}
      ${_field('Location', `<input id="rb_location" ${_inp} value="${_esc(r.location)}" placeholder="New York, NY">`)}
      ${_field('LinkedIn', `<input id="rb_linkedin" ${_inp} value="${_esc(r.linkedin)}" placeholder="linkedin.com/in/janesmith">`)}
    </div>
    ${_field('Website / Portfolio', `<input id="rb_website" ${_inp} value="${_esc(r.website)}" placeholder="portfolio.com">`)}
    ${_field('Professional Summary',
      `<textarea id="rb_summary" ${_inp} rows="4" style="width:100%;box-sizing:border-box;
       background:#1E293B;border:1px solid rgba(255,255,255,0.1);border-radius:8px;
       padding:9px 12px;font-size:13px;color:#F1F5F9;resize:vertical;margin-top:4px"
       onfocus="this.style.borderColor='rgba(99,102,241,0.6)'"
       onblur="this.style.borderColor='rgba(255,255,255,0.1)'"
       placeholder="Results-driven PM with 5+ years building B2B SaaS products..."
       >${_esc(r.summary)}</textarea>`,
      'ATS tip: include your target job title and 2–3 key skills in the first sentence.'
    )}
  `;
}

// ── Step 2: Experience ───────────────────────────────────────────────────────
function _rbStep2() {
  const r = _wbResume();
  if (!r.experience.length) r.experience.push(_newExp());

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#F1F5F9">Experience</h3>
      <button onclick="_rbAddExp()" style="
        padding:6px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;
        background:rgba(99,102,241,0.15);color:#818CF8;border:1px solid rgba(99,102,241,0.3)
      ">+ Add Position</button>
    </div>
    <div id="rbExpList">
      ${r.experience.map((exp, i) => _rbExpCard(exp, i)).join('')}
    </div>
  `;
}

function _newExp() {
  return { id: _uid(), company: '', title: '', dates: '', location: '', remote: false, bullets: [''] };
}

function _rbExpCard(exp, i) {
  return `
    <div id="expCard_${exp.id}" style="
      background:#1E293B;border-radius:10px;padding:16px;margin-bottom:12px;
      border:1px solid rgba(255,255,255,0.07)
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:13px;font-weight:600;color:#94A3B8">Position ${i + 1}</span>
        ${i > 0 ? `<button onclick="_rbRemoveExp('${exp.id}')" style="
          background:none;border:none;color:#EF4444;cursor:pointer;font-size:12px;padding:2px 6px;
          border-radius:4px" onmouseenter="this.style.background='rgba(239,68,68,0.1)'"
          onmouseleave="this.style.background='none'"
        >✕ Remove</button>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:${_m2col()};gap:0 12px">
        ${_field('Company', `<input id="exp_company_${exp.id}" ${_inp} value="${_esc(exp.company)}" placeholder="Acme Corp">`)}
        ${_field('Job Title', `<input id="exp_title_${exp.id}"
          style="width:100%;box-sizing:border-box;background:#1E293B;border:1px solid rgba(255,255,255,0.1);
                 border-radius:8px;padding:9px 12px;font-size:13px;color:#F1F5F9;outline:none;margin-top:4px"
          onfocus="this.style.borderColor='rgba(99,102,241,0.6)'"
          onblur="this.style.borderColor='rgba(255,255,255,0.1)';
                  if(this.value.trim()&&document.getElementById('exp_company_${exp.id}')?.value.trim()&&
                     !document.getElementById('infer_checks_${exp.id}'))
                    inferResponsibilities('${exp.id}')"
          value="${_esc(exp.title)}" placeholder="Product Manager"
        >`, 'Tab out after entering title to get AI-suggested responsibilities.')}
        ${_field('Dates', `<input id="exp_dates_${exp.id}" ${_inp} value="${_esc(exp.dates)}" placeholder="Jan 2022 – Present">`)}
        ${_field('Location', `<input id="exp_location_${exp.id}" ${_inp} value="${_esc(exp.location)}" placeholder="New York, NY">`)}
      </div>
      <label style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;
                    letter-spacing:.04em;display:block;margin-bottom:8px">Bullet Points</label>
      <div id="bullets_${exp.id}">
        ${exp.bullets.map((b, bi) => _rbBulletRow(exp.id, bi, b)).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button onclick="_rbAddBullet('${exp.id}')" style="
          font-size:12px;color:#6366F1;background:none;border:none;cursor:pointer;padding:0
        ">+ Add bullet</button>
        <button onclick="enhanceBullets('${exp.id}')" style="
          font-size:12px;color:#A78BFA;background:none;border:none;cursor:pointer;padding:0
        ">✨ AI Enhance</button>
      </div>
    </div>
  `;
}

function _rbBulletRow(expId, idx, text) {
  return `
    <div style="display:flex;gap:8px;align-items:start;margin-bottom:6px">
      <span style="color:#6366F1;margin-top:9px;font-size:11px;flex-shrink:0">•</span>
      <input id="bullet_${expId}_${idx}" ${_inp}
        style="flex:1;background:#0F172A;border:1px solid rgba(255,255,255,0.08);
               border-radius:6px;padding:7px 10px;font-size:12.5px;color:#E2E8F0;
               margin-top:0;box-sizing:border-box"
        value="${_esc(text)}"
        placeholder="Led team of 5 engineers to ship new checkout flow, reducing drop-off by 22%"
        onfocus="this.style.borderColor='rgba(99,102,241,0.5)'"
        onblur="this.style.borderColor='rgba(255,255,255,0.08)'"
      >
      <button onclick="_rbRemoveBullet('${expId}', ${idx})"
        style="background:none;border:none;color:#475569;cursor:pointer;padding:4px;
               margin-top:4px;font-size:14px;flex-shrink:0"
        onmouseenter="this.style.color='#EF4444'" onmouseleave="this.style.color='#475569'"
      >✕</button>
    </div>`;
}

function _rbAddExp() {
  _rbSaveCurrentStep();
  _wbResume().experience.push(_newExp());
  _rbRenderContent();
}

function _rbRemoveExp(id) {
  const r = _wbResume();
  r.experience = r.experience.filter(e => e.id !== id);
  _rbRenderContent();
}

function _rbAddBullet(expId) {
  _rbSaveCurrentStep();
  const exp = _wbResume().experience.find(e => e.id === expId);
  if (exp) { exp.bullets.push(''); _rbRenderContent(); }
}

function _rbRemoveBullet(expId, idx) {
  _rbSaveCurrentStep();
  const exp = _wbResume().experience.find(e => e.id === expId);
  if (exp && exp.bullets.length > 1) {
    exp.bullets.splice(idx, 1);
    _rbRenderContent();
  }
}

// ── Step 3: Education ────────────────────────────────────────────────────────
function _rbStep3() {
  const r = _wbResume();
  if (!r.education.length) r.education.push(_newEdu());

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h3 style="margin:0;font-size:15px;font-weight:700;color:#F1F5F9">Education</h3>
      <button onclick="_rbAddEdu()" style="
        padding:6px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;
        background:rgba(99,102,241,0.15);color:#818CF8;border:1px solid rgba(99,102,241,0.3)
      ">+ Add School</button>
    </div>
    <div id="rbEduList">
      ${r.education.map((edu, i) => _rbEduCard(edu, i)).join('')}
    </div>
  `;
}

function _newEdu() {
  return { id: _uid(), school: '', degree: '', field: '', dates: '', location: '', gpa: '', honors: '' };
}

function _rbEduCard(edu, i) {
  return `
    <div id="eduCard_${edu.id}" style="
      background:#1E293B;border-radius:10px;padding:16px;margin-bottom:12px;
      border:1px solid rgba(255,255,255,0.07)
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:13px;font-weight:600;color:#94A3B8">School ${i + 1}</span>
        ${i > 0 ? `<button onclick="_rbRemoveEdu('${edu.id}')" style="
          background:none;border:none;color:#EF4444;cursor:pointer;font-size:12px;padding:2px 6px"
        >✕ Remove</button>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:${_m2col()};gap:0 12px">
        ${_field('School / University', `<input id="edu_school_${edu.id}" ${_inp} value="${_esc(edu.school)}" placeholder="State University">`)}
        ${_field('Degree', `<input id="edu_degree_${edu.id}" ${_inp} value="${_esc(edu.degree)}" placeholder="Bachelor of Science">`)}
        ${_field('Field of Study', `<input id="edu_field_${edu.id}" ${_inp} value="${_esc(edu.field)}" placeholder="Computer Science">`)}
        ${_field('Dates', `<input id="edu_dates_${edu.id}" ${_inp} value="${_esc(edu.dates)}" placeholder="Sep 2016 – May 2020">`)}
        ${_field('Location', `<input id="edu_location_${edu.id}" ${_inp} value="${_esc(edu.location)}" placeholder="Boston, MA">`)}
        ${_field('GPA (optional)', `<input id="edu_gpa_${edu.id}" ${_inp} value="${_esc(edu.gpa)}" placeholder="3.8">`)}
      </div>
      ${_field('Honors / Activities (optional)',
        `<input id="edu_honors_${edu.id}" ${_inp} value="${_esc(edu.honors)}" placeholder="Magna Cum Laude, Dean's List, Robotics Club">`,
        'Include if GPA ≥ 3.5 or within last 3 years.'
      )}
    </div>
  `;
}

function _rbAddEdu() {
  _rbSaveCurrentStep();
  _wbResume().education.push(_newEdu());
  _rbRenderContent();
}

function _rbRemoveEdu(id) {
  const r = _wbResume();
  r.education = r.education.filter(e => e.id !== id);
  _rbRenderContent();
}

// ── Step 4: Skills & Extras ──────────────────────────────────────────────────
function _rbStep4() {
  const r = _wbResume();
  const sc = r._skillCategories;
  return `
    <h3 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#F1F5F9">Skills & Extras</h3>

    ${_skillTagSection('Technical Skills', 'sk_technical', sc.technical,
      'Python, React, SQL, Node.js, REST APIs')}
    ${_skillTagSection('Tools & Platforms', 'sk_tools', sc.tools,
      'Figma, Jira, Salesforce, AWS, Git')}
    ${_skillTagSection('Soft Skills', 'sk_soft', sc.soft,
      'Leadership, Stakeholder Management, Agile')}
    ${_skillTagSection('Languages', 'sk_languages', sc.languages,
      'Spanish (conversational), French (basic)')}

    <div style="border-top:1px solid rgba(255,255,255,0.06);margin:16px 0"></div>

    ${_field('Certifications (one per line)',
      `<textarea id="rb_certs" rows="3" style="width:100%;box-sizing:border-box;
        background:#1E293B;border:1px solid rgba(255,255,255,0.1);border-radius:8px;
        padding:9px 12px;font-size:13px;color:#F1F5F9;resize:vertical;margin-top:4px"
        onfocus="this.style.borderColor='rgba(99,102,241,0.6)'"
        onblur="this.style.borderColor='rgba(255,255,255,0.1)'"
        placeholder="AWS Solutions Architect — Amazon, 2023&#10;Google Analytics Certified — Google, 2022"
      >${_esc(r.certifications.map(c => `${c.name} — ${c.issuer}${c.date ? ', ' + c.date : ''}`).join('\n'))}</textarea>`,
      'Format: Certification Name — Issuer, Year'
    )}
  `;
}

function _skillTagSection(label, id, tags, placeholder) {
  return `
    <div style="margin-bottom:14px">
      <label style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;
                    letter-spacing:.04em">${label}</label>
      <input id="${id}" ${_inp}
        value="${tags.map(_esc).join(', ')}"
        placeholder="${placeholder}"
      >
      <p style="margin:4px 0 0;font-size:11px;color:#475569">
        Separate with commas. ATS scans this section for keyword matches.
      </p>
    </div>`;
}

// ── Step 5: Review & Export ──────────────────────────────────────────────────
function _rbStep5() {
  const r = _wbResume();
  return `
    <h3 style="margin:0 0 4px;font-size:15px;font-weight:700;color:#F1F5F9">Review & Export</h3>
    <p style="margin:0 0 16px;font-size:13px;color:#64748B">
      Your resume is ready. Choose what to do with it:
    </p>

    <!-- Quick summary -->
    <div style="background:#1E293B;border-radius:10px;padding:14px 16px;margin-bottom:16px;
                border:1px solid rgba(255,255,255,0.07)">
      <div style="font-size:16px;font-weight:700;color:#F1F5F9">${_esc(r.name) || '(Name not set)'}</div>
      <div style="font-size:13px;color:#818CF8;margin-bottom:10px">${_esc(r.title) || ''}</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        ${[r.email, r.phone, r.location].filter(Boolean).map(v =>
          `<span style="font-size:12px;color:#94A3B8">${_esc(v)}</span>`
        ).join('')}
      </div>
      <div style="margin-top:8px;font-size:12px;color:#64748B">
        ${r.experience.length} experience ${r.experience.length === 1 ? 'entry' : 'entries'} ·
        ${r.education.length} education ${r.education.length === 1 ? 'entry' : 'entries'} ·
        ${r.skills.length} skills
      </div>
    </div>

    <!-- Action buttons -->
    <div style="display:grid;grid-template-columns:${_m2col()};gap:10px">
      ${_actionCard('📄', 'Use with Resume Tailor',
        'Load this resume into the AI tailoring engine to match job descriptions.',
        '_rbUseInTailor()')}
      ${_actionCard('🎨', 'Open in Template',
        'Preview as a formatted, printable PDF using your existing resume templates.',
        '_rbOpenTemplate()')}
      ${_actionCard('💾', 'Download as JSON',
        'Save a backup of your structured resume data for future use.',
        '_rbDownloadJSON()')}
      ${_actionCard('🔄', 'Start Over',
        'Clear all data and start from scratch.',
        '_rbReset()')}
    </div>

    ${_rbRenderATSSidebar(r)}
  `;
}

function _actionCard(icon, title, desc, onclick) {
  return `
    <div onclick="${onclick}" style="
      background:#1E293B;border-radius:10px;padding:14px;cursor:pointer;
      border:1px solid rgba(255,255,255,0.07);transition:border-color .15s
    "
    onmouseenter="this.style.borderColor='rgba(99,102,241,0.4)'"
    onmouseleave="this.style.borderColor='rgba(255,255,255,0.07)'"
    >
      <div style="font-size:22px;margin-bottom:6px">${icon}</div>
      <div style="font-size:13px;font-weight:700;color:#F1F5F9;margin-bottom:4px">${title}</div>
      <div style="font-size:12px;color:#64748B;line-height:1.5">${desc}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SAVE CURRENT STEP → UPDATE _wb.resume
//    Called before every navigation (Next / Back) and before export.
// ─────────────────────────────────────────────────────────────────────────────

function _rbSaveCurrentStep() {
  const r = _wbResume();
  const g = id => document.getElementById(id);

  if (_wb.step === 1) {
    r.name     = g('rb_name')?.value.trim()     || '';
    r.title    = g('rb_title')?.value.trim()    || '';
    r.email    = g('rb_email')?.value.trim()    || '';
    r.phone    = g('rb_phone')?.value.trim()    || '';
    r.location = g('rb_location')?.value.trim() || '';
    r.linkedin = g('rb_linkedin')?.value.trim() || '';
    r.website  = g('rb_website')?.value.trim()  || '';
    r.summary  = g('rb_summary')?.value.trim()  || '';
  }

  if (_wb.step === 2) {
    r.experience.forEach(exp => {
      exp.company  = g(`exp_company_${exp.id}`)?.value.trim()  || '';
      exp.title    = g(`exp_title_${exp.id}`)?.value.trim()    || '';
      exp.dates    = g(`exp_dates_${exp.id}`)?.value.trim()    || '';
      exp.location = g(`exp_location_${exp.id}`)?.value.trim() || '';
      exp.bullets  = exp.bullets.map((_, bi) =>
        g(`bullet_${exp.id}_${bi}`)?.value.trim() || ''
      ).filter(Boolean);
    });
  }

  if (_wb.step === 3) {
    r.education.forEach(edu => {
      edu.school   = g(`edu_school_${edu.id}`)?.value.trim()   || '';
      edu.degree   = g(`edu_degree_${edu.id}`)?.value.trim()   || '';
      edu.field    = g(`edu_field_${edu.id}`)?.value.trim()    || '';
      edu.dates    = g(`edu_dates_${edu.id}`)?.value.trim()    || '';
      edu.location = g(`edu_location_${edu.id}`)?.value.trim() || '';
      edu.gpa      = g(`edu_gpa_${edu.id}`)?.value.trim()      || '';
      edu.honors   = g(`edu_honors_${edu.id}`)?.value.trim()   || '';
    });
  }

  if (_wb.step === 4) {
    const parseTags = id => (g(id)?.value || '')
      .split(',').map(s => s.trim()).filter(Boolean);

    r._skillCategories.technical = parseTags('sk_technical');
    r._skillCategories.tools     = parseTags('sk_tools');
    r._skillCategories.soft      = parseTags('sk_soft');
    r._skillCategories.languages = parseTags('sk_languages');

    // Flatten all categories into skills[] for template compat
    r.skills = [
      ...r._skillCategories.technical,
      ...r._skillCategories.tools,
      ...r._skillCategories.soft,
      ...r._skillCategories.languages,
    ];

    // Parse certifications from textarea
    const certsRaw = g('rb_certs')?.value || '';
    r.certifications = certsRaw.split('\n')
      .map(line => line.trim()).filter(Boolean)
      .map(line => {
        const [name, rest = ''] = line.split('—').map(s => s.trim());
        const [issuer, date]    = rest.split(',').map(s => s.trim());
        return { name: name || '', issuer: issuer || '', date: date || '', url: '' };
      });
  }

  r.meta.updatedAt = new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. EXPORT ACTIONS (Step 5)
// ─────────────────────────────────────────────────────────────────────────────

function _rbUseInTailor() {
  _rbSaveCurrentStep();
  const text = resumeToPlainText(_wbResume());
  if (typeof saveResume === 'function') {
    saveResume({ source: 'builder', text, builderData: _wbResume() });
    // Also populate the resumeText textarea so the tailor panel shows it immediately
    const ta = document.getElementById('resumeText');
    if (ta) { ta.value = text; ta.dispatchEvent(new Event('input')); }
    const fileDrop   = document.getElementById('fileDrop');
    const fileLoaded = document.getElementById('fileLoaded');
    const fileName   = document.getElementById('fileName');
    if (fileDrop)   fileDrop.style.display   = 'none';
    if (fileLoaded) fileLoaded.style.display  = 'flex';
    if (fileName)   fileName.textContent      = _wbResume().name ? `${_wbResume().name} (built)` : 'My Resume (built)';
  }
  closeResumeBuilder();
  if (typeof switchMode === 'function') switchMode('resume');

  const hasJD = !!(document.getElementById('jobText')?.value.trim());

  if (typeof showToast === 'function') {
    showToast(
      hasJD
        ? '✅ Resume loaded — hit "Tailor My Resume" to get started!'
        : '✅ Resume built — paste a job description to tailor it.',
      'success'
    );
  }

  if (hasJD) {
    // Inject pulse keyframes once
    if (!document.getElementById('_rbPulseStyle')) {
      const s = document.createElement('style');
      s.id = '_rbPulseStyle';
      s.textContent = `@keyframes _rbPulse{0%,100%{box-shadow:0 4px 20px rgba(67,56,202,.4),0 1px 0 rgba(255,255,255,.1) inset}50%{box-shadow:0 0 0 6px rgba(99,102,241,.35),0 8px 32px rgba(67,56,202,.7),0 1px 0 rgba(255,255,255,.15) inset;transform:scale(1.02)}}._rb-pulse-ready{animation:_rbPulse .7s ease 2}`;
      document.head.appendChild(s);
    }
    setTimeout(() => {
      const btn = document.getElementById('runBtn');
      if (!btn) return;
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      btn.classList.add('_rb-pulse-ready');
      btn.addEventListener('animationend', () => btn.classList.remove('_rb-pulse-ready'), { once: true });
    }, 350); // wait for switchMode transition to settle
  }
}

function _rbOpenTemplate() {
  _rbSaveCurrentStep();
  const data = _wbResume();

  // openTemplateWindow(id, data) is the correct low-level caller — it accepts
  // a data object directly and opens the template in a new window.
  // openTemplateModal() reads from #resumeOutput (needs a tailored resume first).
  if (typeof openTemplateWindow !== 'function') {
    if (typeof showToast === 'function') showToast('Template renderer not available.', 'error');
    return;
  }

  // Show an inline template picker in the wizard content area
  const el = document.getElementById('rbContent');
  if (!el) return;
  el.innerHTML = `
    <h3 style="margin:0 0 6px;font-size:15px;font-weight:700;color:#F1F5F9">Choose a Template</h3>
    <p style="margin:0 0 16px;font-size:13px;color:#64748B">Each opens in a new tab — use Print → Save as PDF</p>
    <div style="display:grid;grid-template-columns:${_m2col()};gap:10px">
      ${[
        { id: 'classic',   label: 'Classic',   desc: 'Traditional format — highest ATS compatibility' },
        { id: 'modern',    label: 'Modern',     desc: 'Clean sidebar layout, great for tech roles' },
        { id: 'minimal',   label: 'Minimal',    desc: 'Clean whitespace, works for any industry' },
        { id: 'executive', label: 'Executive',  desc: 'Bold header, suited for senior roles' },
      ].map(t => `
        <div onclick="openTemplateWindow('${t.id}', _wbResume())" style="
          background:#1E293B;border-radius:10px;padding:14px;cursor:pointer;
          border:1px solid rgba(255,255,255,0.07);transition:border-color .15s
        "
        onmouseenter="this.style.borderColor='rgba(99,102,241,0.5)'"
        onmouseleave="this.style.borderColor='rgba(255,255,255,0.07)'"
        >
          <div style="font-size:13px;font-weight:700;color:#F1F5F9;margin-bottom:4px">${t.label}</div>
          <div style="font-size:12px;color:#64748B;line-height:1.5">${t.desc}</div>
        </div>`).join('')}
    </div>
    <button onclick="_rbRenderContent()" style="
      margin-top:14px;background:none;border:none;color:#64748B;
      font-size:12px;cursor:pointer;padding:0
    ">← Back to review</button>
  `;
}

function _rbDownloadJSON() {
  _rbSaveCurrentStep();
  const json = JSON.stringify(_wbResume(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `resume_${(_wbResume().name || 'export').replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function _rbReset() {
  if (confirm('Clear all resume data and start over?')) {
    _wb.resume = null;
    _wb.step   = 1;
    _wbResume();
    _rbRender();
  }
}

function _rbExport() {
  _rbSaveCurrentStep();
  _rbRenderContent();  // show review step content
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. AI BULLET ENHANCER
//    Callable from wizard: enhanceBullets('expId')
//    Also callable standalone: enhanceBullets(null, ['bullet1', 'bullet2'], targetRole)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * enhanceBullets(expId, rawBullets?, targetRole?)
 *
 * Reads bullet inputs from the DOM (if expId given), calls /api/claude,
 * then routes through Truth-Check before writing back — any metric the AI
 * *invented* (not present in the user's original) is flagged with [VERIFY: X]
 * and surfaced for user confirmation before being saved.
 *
 * Prompt strategy:
 *  - Haiku (fast + cheap) for bullet rewriting
 *  - AI must mark any invented numbers/percentages with [VERIFY: X] syntax
 *  - Returns JSON array so parsing is deterministic
 */
async function enhanceBullets(expId, rawBullets = null, targetRole = '') {
  // ── 1. Collect bullets ──────────────────────────────────────────────────
  let bullets = rawBullets;
  if (!bullets && expId) {
    const exp = _wbResume().experience.find(e => e.id === expId);
    if (!exp) return;
    // Always read live from DOM — state may not be saved yet
    bullets = exp.bullets.map((_, bi) => {
      const el = document.getElementById(`bullet_${expId}_${bi}`);
      return el?.value.trim() || '';
    }).filter(Boolean);
  }

  if (!bullets?.length) {
    if (typeof showToast === 'function') showToast('Add at least one bullet point first.', 'info');
    return;
  }

  // ── 2. Show loading state ───────────────────────────────────────────────
  const btnEl = document.querySelector(`[onclick="enhanceBullets('${expId}')"]`);
  if (btnEl) { btnEl.textContent = '⏳ Enhancing…'; btnEl.disabled = true; }

  // ── 3. Build prompt — AI must flag invented metrics ─────────────────────
  const ENHANCE_PROMPT = `You are a professional resume writer specializing in ATS optimization.

Rewrite these bullet points to be more impactful. Rules:
- Start each bullet with a strong past-tense action verb (Led, Built, Designed, Reduced, Grew, etc.)
- IMPORTANT: If the user's bullet already contains a real number (%, $, a count), keep it EXACTLY as written.
- If you add a number or metric that was NOT in the original bullet, you MUST wrap it in [VERIFY: X] — e.g. "Increased sales by [VERIFY: 20%]". This is mandatory so the user can confirm it.
- Keep each bullet under 20 words
- Never use: "responsible for", "helped with", "assisted in", "worked on"
- Output ONLY a JSON array of strings — no markdown, no explanation
${targetRole ? `- The target role is: ${targetRole}` : ''}

Input bullets:
${JSON.stringify(bullets)}

Output format: ["Enhanced bullet 1", "Enhanced bullet 2", ...]`;

  // ── 4. Call API ─────────────────────────────────────────────────────────
  try {
    let tierToken = '';
    try { tierToken = JSON.parse(localStorage.getItem('1ststep_sub_cache') || '{}').tierToken || ''; } catch {}
    const userEmail = (() => { try { return JSON.parse(localStorage.getItem('1ststep_sub_cache') || '{}').email || ''; } catch { return ''; } })();

    const response = await fetch('/api/claude', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        callType:   'utility',
        userEmail,
        tierToken,
        messages: [{ role: 'user', content: ENHANCE_PROMPT }],
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    const result   = await response.json();
    const rawText  = result.content?.[0]?.text || '[]';
    const cleaned  = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const enhanced = JSON.parse(cleaned);

    if (!enhanced?.length) throw new Error('Empty response');

    // ── 5. Route through Truth-Check if AI invented any metrics ────────────
    if (expId) {
      const hasUnverified = enhanced.some(b => /\[VERIFY:/i.test(b));
      if (hasUnverified) {
        // Show truth-check panel — do NOT write to state yet
        _rbShowTruthCheck(expId, enhanced, bullets);
        if (typeof showToast === 'function') showToast('⚠️ Check the highlighted numbers before saving.', 'info');
      } else {
        // No invented metrics — safe to apply directly (same as before)
        const exp = _wbResume().experience.find(e => e.id === expId);
        if (exp) exp.bullets = enhanced;
        _rbRenderContent();
        if (typeof showToast === 'function') showToast('✨ Bullets enhanced!', 'success');
      }
    }

    return enhanced;

  } catch (err) {
    console.error('enhanceBullets error:', err);
    if (typeof showToast === 'function') showToast('Enhancement failed — try again.', 'error');
  } finally {
    if (btnEl) { btnEl.textContent = '✨ AI Enhance'; btnEl.disabled = false; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. RESUME → PLAIN TEXT CONVERTER
//    Used to feed the structured resume into the existing tailoring engine,
//    which expects a plain text string (not JSON).
// ─────────────────────────────────────────────────────────────────────────────

function resumeToPlainText(r) {
  const lines = [];

  // Header
  if (r.name)     lines.push(r.name.toUpperCase(), '');
  const contact = [r.email, r.phone, r.location, r.linkedin, r.website].filter(Boolean);
  if (contact.length) lines.push(contact.join(' | '), '');

  // Summary
  if (r.summary) { lines.push('PROFESSIONAL SUMMARY', r.summary, ''); }

  // Experience
  if (r.experience?.length) {
    lines.push('EXPERIENCE');
    r.experience.forEach(exp => {
      const loc = [exp.location, exp.remote ? '(Remote)' : ''].filter(Boolean).join(' ');
      lines.push(`${exp.company}${loc ? ' — ' + loc : ''}`);
      lines.push(`${exp.title}${exp.dates ? ' | ' + exp.dates : ''}`);
      (exp.bullets || []).forEach(b => lines.push(`• ${b}`));
      lines.push('');
    });
  }

  // Education
  if (r.education?.length) {
    lines.push('EDUCATION');
    r.education.forEach(edu => {
      lines.push(`${edu.school}${edu.location ? ' — ' + edu.location : ''}`);
      const deg = [edu.degree, edu.field].filter(Boolean).join(', ');
      lines.push(`${deg}${edu.dates ? ' | ' + edu.dates : ''}${edu.gpa ? ' | GPA: ' + edu.gpa : ''}`);
      if (edu.honors) lines.push(edu.honors);
      lines.push('');
    });
  }

  // Skills
  if (r.skills?.length) {
    lines.push('SKILLS', r.skills.join(', '), '');
  }

  // Certifications
  if (r.certifications?.length) {
    lines.push('CERTIFICATIONS');
    r.certifications.forEach(c => {
      lines.push(`${c.name}${c.issuer ? ' — ' + c.issuer : ''}${c.date ? ', ' + c.date : ''}`);
    });
    lines.push('');
  }

  return lines.join('\n').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. INFERENCE ENGINE
//     Fires on Job Title blur (if Company is also filled).
//     Calls Haiku for 7 probable responsibilities → renders as checkboxes.
//     User checks the true ones → they become seed bullets.
// ─────────────────────────────────────────────────────────────────────────────

async function inferResponsibilities(expId) {
  // Read live from DOM — state not saved yet
  const title   = document.getElementById(`exp_title_${expId}`)?.value.trim();
  const company = document.getElementById(`exp_company_${expId}`)?.value.trim();
  if (!title || !company) return;

  // Don't overwrite bullets the user already typed
  const exp = _wbResume().experience.find(e => e.id === expId);
  if (exp?.bullets.some(b => b.trim().length > 0)) return;

  // Don't re-trigger if panel already showing
  if (document.getElementById(`infer_checks_${expId}`)) return;

  const bulletsContainer = document.getElementById(`bullets_${expId}`);
  if (!bulletsContainer) return;

  // ── Loading pill — matches secondary button style ────────────────────────
  const loaderId = `infer_loader_${expId}`;
  bulletsContainer.insertAdjacentHTML('beforebegin', `
    <div id="${loaderId}" style="
      display:flex;align-items:center;gap:8px;
      padding:9px 12px;margin-bottom:8px;
      background:rgba(99,102,241,0.08);border-radius:8px;
      border:1px solid rgba(99,102,241,0.2);
      font-size:12px;color:#818CF8;
    ">
      <span style="display:inline-block;animation:rb-spin 1s linear infinite">⟳</span>
      Looking up common responsibilities for ${_esc(title)} at ${_esc(company)}…
    </div>
    <style>@keyframes rb-spin{to{transform:rotate(360deg)}}</style>
  `);

  try {
    let tierToken = '';
    try { tierToken = JSON.parse(localStorage.getItem('1ststep_sub_cache') || '{}').tierToken || ''; } catch {}
    const userEmail = (() => { try { return JSON.parse(localStorage.getItem('1ststep_sub_cache') || '{}').email || ''; } catch { return ''; } })();

    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 400,
        callType:   'utility',
        userEmail,
        tierToken,
        messages: [{
          role: 'user',
          content: `List 7 specific, realistic past-tense job responsibilities for a ${title} at ${company}.
Rules: short action statements only (under 12 words each), no metrics, no percentages — the user will add those.
Return ONLY a JSON array of 7 strings. No markdown, no explanation.`,
        }],
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data  = await res.json();
    const raw   = data?.content?.[0]?.text || data?.text || '[]';
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const items = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] || '[]');

    document.getElementById(loaderId)?.remove();
    if (!items.length) return;

    // ── Checkbox panel — matches expCard inner style ─────────────────────
    const panelHtml = `
      <div id="infer_checks_${expId}" style="
        background:#0F172A;border-radius:8px;padding:12px 14px;margin-bottom:10px;
        border:1px solid rgba(99,102,241,0.2);
      ">
        <p style="
          margin:0 0 10px;
          font-size:11px;font-weight:600;color:#818CF8;
          text-transform:uppercase;letter-spacing:.04em;
          display:flex;align-items:center;gap:6px
        ">✓ Check everything that applies to your role</p>
        <div id="infer_list_${expId}">
          ${items.map((item, i) => `
            <label style="
              display:flex;align-items:flex-start;gap:8px;margin-bottom:7px;cursor:pointer;
            ">
              <input type="checkbox" id="infer_cb_${expId}_${i}"
                data-text="${_esc(item)}"
                style="margin-top:2px;accent-color:#6366F1;flex-shrink:0;cursor:pointer"
              >
              <span style="font-size:12.5px;color:#CBD5E1;line-height:1.4">${_esc(item)}</span>
            </label>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button onclick="_rbApplyInferred('${expId}', ${items.length})" style="
            padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
            background:linear-gradient(135deg,#6366F1,#4F46E5);color:#fff;border:none;
          ">Use checked items →</button>
          <button onclick="document.getElementById('infer_checks_${expId}')?.remove()" style="
            padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
            background:rgba(255,255,255,0.05);color:#94A3B8;
            border:1px solid rgba(255,255,255,0.1);
          ">I'll type my own</button>
        </div>
      </div>
    `;
    bulletsContainer.insertAdjacentHTML('beforebegin', panelHtml);

  } catch (err) {
    console.warn('inferResponsibilities failed silently:', err);
    document.getElementById(loaderId)?.remove();
    // Fail silently — user can still type bullets manually
  }
}

function _rbApplyInferred(expId, count) {
  const checked = [];
  for (let i = 0; i < count; i++) {
    const cb = document.getElementById(`infer_cb_${expId}_${i}`);
    if (cb?.checked && cb.dataset.text) checked.push(cb.dataset.text);
  }
  if (!checked.length) {
    if (typeof showToast === 'function') showToast('Check at least one item first.', 'info');
    return;
  }

  const exp = _wbResume().experience.find(e => e.id === expId);
  if (exp) exp.bullets = checked;

  document.getElementById(`infer_checks_${expId}`)?.remove();
  _rbSaveCurrentStep();
  _rbRenderContent();
  if (typeof showToast === 'function') showToast('✅ Responsibilities added — now hit ✨ AI Enhance to polish them.', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. TRUTH-CHECK PANEL
//     Shown when enhanceBullets detects [VERIFY: X] markers in AI output.
//     Invented metrics are highlighted and editable inline — user confirms
//     or corrects each one before bullets are written to state.
// ─────────────────────────────────────────────────────────────────────────────

function _rbShowTruthCheck(expId, enhanced, original) {
  // Remove any existing panel
  document.getElementById(`truthCheck_${expId}`)?.remove();

  const card = document.getElementById(`expCard_${expId}`);
  if (!card) return;

  const panelHtml = `
    <div id="truthCheck_${expId}" style="
      background:#1E293B;border-radius:10px;padding:14px;margin-top:10px;
      border:1px solid rgba(250,204,21,0.25);
    ">
      <!-- Header — matches expCard label style but in warning colour -->
      <p style="
        margin:0 0 4px;
        font-size:11px;font-weight:600;color:#FCD34D;
        text-transform:uppercase;letter-spacing:.04em;
        display:flex;align-items:center;gap:6px;
      ">⚠️ Verify these numbers before adding to your resume</p>
      <p style="margin:0 0 12px;font-size:11.5px;color:#94A3B8;line-height:1.5">
        Numbers highlighted in yellow were estimated by the AI — not taken from your original bullets.
        Click any to edit, then confirm they reflect your real experience.
      </p>

      <!-- Enhanced bullets — [VERIFY: X] rendered as editable marks -->
      <div style="margin-bottom:12px">
        ${enhanced.map((bullet, i) => {
          const rendered = bullet.replace(/\[VERIFY:\s*([^\]]+)\]/gi, (_, val) =>
            `<mark contenteditable="true" spellcheck="false"
              style="
                background:rgba(250,204,21,0.12);color:#FCD34D;
                border:1px dashed rgba(250,204,21,0.35);border-radius:4px;
                padding:1px 5px;cursor:text;font-style:normal;outline:none;
                display:inline-block;min-width:24px;
              "
              title="Click to edit this number"
            >${_esc(val.trim())}</mark>`
          );
          const hasFlag = /\[VERIFY:/i.test(bullet);
          return `
            <div style="
              display:flex;align-items:flex-start;gap:8px;margin-bottom:7px;
              padding:7px 9px;border-radius:7px;
              background:${hasFlag ? 'rgba(250,204,21,0.04)' : 'transparent'};
            ">
              <span style="color:#6366F1;flex-shrink:0;font-size:11px;margin-top:3px">•</span>
              <span id="tc_bullet_${expId}_${i}"
                style="font-size:12.5px;color:#E2E8F0;flex:1;line-height:1.5"
              >${rendered}</span>
            </div>`;
        }).join('')}
      </div>

      <!-- Footer actions — match primary / ghost button patterns -->
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="_rbAcceptTruthChecked('${expId}', ${enhanced.length})" style="
          padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
          background:linear-gradient(135deg,#6366F1,#4F46E5);color:#fff;border:none;
        ">✓ Numbers are accurate — save these bullets</button>
        <button onclick="document.getElementById('truthCheck_${expId}')?.remove()" style="
          padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
          background:rgba(255,255,255,0.05);color:#94A3B8;
          border:1px solid rgba(255,255,255,0.1);
        ">Keep my originals</button>
      </div>
    </div>
  `;

  card.insertAdjacentHTML('beforeend', panelHtml);
}

function _rbAcceptTruthChecked(expId, count) {
  const exp = _wbResume().experience.find(e => e.id === expId);
  if (!exp) return;

  const bullets = [];
  for (let i = 0; i < count; i++) {
    const el = document.getElementById(`tc_bullet_${expId}_${i}`);
    if (el) {
      // innerText reads the live text including any user edits to contenteditable marks
      const text = el.innerText.replace(/\s+/g, ' ').trim();
      if (text) bullets.push(text);
    }
  }

  if (!bullets.length) return;

  exp.bullets = bullets;
  document.getElementById(`truthCheck_${expId}`)?.remove();
  _rbSaveCurrentStep();
  _rbRenderContent();
  if (typeof showToast === 'function') showToast('✅ Verified bullets saved.', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. ATS SIDEBAR (Step 5 — Review)
//     Uses the existing resumeToPlainText() — zero extra API calls.
//     Shows raw parse + section detection so users see exactly what an
//     ATS robot reads before they submit anywhere.
// ─────────────────────────────────────────────────────────────────────────────

function _rbRenderATSSidebar(r) {
  const plain = resumeToPlainText(r);

  // Section detection — check for standard ATS section headers
  const EXPECTED = ['EXPERIENCE', 'EDUCATION', 'SKILLS'];
  const warnings = [];
  const upperPlain = plain.toUpperCase();

  if (!plain.includes('@'))
    warnings.push('No email detected — ATS contact parsing may fail');
  if (plain.length < 150)
    warnings.push('Very short resume — may score low on keyword density');
  EXPECTED.forEach(s => {
    if (!upperPlain.includes(s))
      warnings.push(`"${s}" section not found — ATS may not parse this section`);
  });

  const allGood = warnings.length === 0;

  return `
    <div style="
      background:#0F172A;border-radius:10px;padding:14px 16px;margin-top:14px;
      border:1px solid rgba(255,255,255,0.07);
    ">
      <!-- Header — matches wizard section-label style -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="
          font-size:11px;font-weight:700;color:#818CF8;
          text-transform:uppercase;letter-spacing:.05em;
          display:flex;align-items:center;gap:6px;
        ">📡 ATS Raw Text View</span>
        <span style="font-size:11px;color:#475569">What Workday / Greenhouse actually reads</span>
      </div>

      <!-- Scan result chip — matches toast / hint colour system -->
      ${allGood
        ? `<div style="
              font-size:11.5px;color:#34D399;
              background:rgba(52,211,153,0.06);border-radius:6px;
              padding:6px 10px;margin-bottom:10px;
            ">✅ All key sections detected — looks ATS-readable</div>`
        : warnings.map(w => `
            <div style="
              font-size:11.5px;color:#FCD34D;
              background:rgba(250,204,21,0.06);border-radius:6px;
              padding:6px 10px;margin-bottom:4px;
            ">⚠️ ${_esc(w)}</div>`).join('')
      }

      <!-- Raw text pane — matches inner card bg (#060D1A used in bullet inputs) -->
      <pre style="
        margin:${allGood ? '0' : '10px'} 0 0;
        font-size:11px;line-height:1.6;color:#64748B;
        background:#060D1A;border-radius:6px;padding:10px 12px;
        border:1px solid rgba(255,255,255,0.05);
        max-height:200px;overflow-y:auto;
        white-space:pre-wrap;word-break:break-word;font-family:monospace;
      ">${_esc(plain) || '(Nothing to show yet — fill in your details above)'}</pre>

      <!-- Tip — matches hint text style -->
      <p style="margin:8px 0 0;font-size:11px;color:#334155;line-height:1.5">
        💡 ATS parsers read this plain-text version, not the styled PDF.
        Name and email at the top + labelled sections = you're set.
      </p>
    </div>
  `;
}

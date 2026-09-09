(function () {
  'use strict';

  var VERSION = '20260909-v2';
  var ROOT_ID = 'fs-motion';
  var ACTIVE_CLASS = 'fs-site-motion-active';
  var RUNNING_CLASS = 'fs-site-motion-running';
  var REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

  var styles = `
#${ROOT_ID} {
  --fs-ink: #172033;
  --fs-body: #52627a;
  --fs-muted: #718096;
  --fs-line: #dce2f2;
  --fs-surface: #ffffff;
  --fs-soft: #f7f8ff;
  --fs-violet: #5b4df7;
  --fs-violet-deep: #4338ca;
  --fs-violet-pale: #eeedff;
  --fs-mint: #0f9f74;
  --fs-ease: cubic-bezier(.22, 1, .36, 1);
  width: min(1180px, calc(100% - 40px));
  margin: clamp(30px, 5vw, 72px) auto clamp(68px, 8vw, 112px);
  scroll-margin-top: 92px;
  color: var(--fs-body);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.55;
}
#${ROOT_ID}, #${ROOT_ID} *, #${ROOT_ID} *::before, #${ROOT_ID} *::after { box-sizing: border-box; }
#${ROOT_ID} button { font: inherit; }
#${ROOT_ID} .fs-stage {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: clamp(34px, 6vw, 74px);
  border: 1px solid rgba(91,77,247,.18);
  border-radius: clamp(24px, 4vw, 38px);
  background:
    radial-gradient(circle at 12% 4%, rgba(123,109,255,.18), transparent 31%),
    radial-gradient(circle at 88% 92%, rgba(166,155,255,.17), transparent 34%),
    linear-gradient(145deg, #fbfbff 0%, #f4f3ff 54%, #fbfcff 100%);
  box-shadow: 0 34px 90px -54px rgba(49,46,129,.48);
}
#${ROOT_ID} .fs-stage::before,
#${ROOT_ID} .fs-stage::after {
  content: "";
  position: absolute;
  z-index: -1;
  width: 420px;
  height: 145px;
  border: 1px solid rgba(124,111,255,.24);
  border-radius: 50%;
  filter: blur(.2px);
  transform: rotate(-24deg);
  pointer-events: none;
}
#${ROOT_ID} .fs-stage::before { top: -84px; right: -95px; }
#${ROOT_ID} .fs-stage::after { bottom: -100px; left: -110px; transform: rotate(24deg); }
#${ROOT_ID} .fs-head { max-width: 720px; margin: 0 auto; text-align: center; }
#${ROOT_ID} .fs-head h2 {
  margin: 0;
  color: var(--fs-ink);
  font-size: clamp(2rem, 4.4vw, 3.65rem);
  line-height: 1.02;
  letter-spacing: -.055em;
  text-wrap: balance;
}
#${ROOT_ID} .fs-head p { max-width: 610px; margin: 18px auto 0; font-size: clamp(.98rem, 1.5vw, 1.12rem); }
#${ROOT_ID} .fs-controls { display: flex; justify-content: center; margin: 24px 0 30px; }
#${ROOT_ID} .fs-motion-toggle {
  min-height: 44px;
  padding: 9px 17px;
  border: 1px solid #c9c5ff;
  border-radius: 999px;
  color: var(--fs-violet-deep);
  background: rgba(255,255,255,.84);
  cursor: pointer;
  font-size: .82rem;
  font-weight: 700;
  box-shadow: 0 8px 22px -18px rgba(67,56,202,.8);
}
#${ROOT_ID} .fs-motion-toggle:hover { background: #fff; border-color: #a9a2ff; }
#${ROOT_ID} :focus-visible { outline: 3px solid rgba(91,77,247,.48); outline-offset: 3px; }
#${ROOT_ID} .fs-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  max-width: 780px;
  margin: 0 auto 16px;
  padding: 6px;
  border: 1px solid rgba(91,77,247,.13);
  border-radius: 18px;
  background: rgba(255,255,255,.64);
  backdrop-filter: blur(12px);
}
#${ROOT_ID} .fs-step {
  min-height: 52px;
  padding: 9px 14px;
  border: 0;
  border-radius: 13px;
  color: #64748b;
  background: transparent;
  cursor: pointer;
  font-size: .8rem;
  font-weight: 700;
  transition: color .28s ease, background .28s ease, box-shadow .28s ease, transform .28s var(--fs-ease);
}
#${ROOT_ID} .fs-step:hover { color: var(--fs-ink); }
#${ROOT_ID} .fs-step[aria-selected="true"] {
  color: var(--fs-violet-deep);
  background: #fff;
  box-shadow: 0 8px 24px -18px rgba(49,46,129,.72);
  transform: translateY(-1px);
}
#${ROOT_ID} .fs-step span { display: inline-grid; place-items: center; width: 23px; height: 23px; margin-right: 6px; border-radius: 8px; background: var(--fs-violet-pale); }
#${ROOT_ID} .fs-viewport {
  position: relative;
  min-height: 410px;
  overflow: hidden;
  border: 1px solid rgba(113,101,238,.18);
  border-radius: 25px;
  background: rgba(255,255,255,.9);
  box-shadow: 0 28px 65px -43px rgba(30,41,59,.55);
}
#${ROOT_ID} .fs-grid {
  display: grid;
  grid-template-columns: minmax(0, .94fr) 72px minmax(0, 1.06fr);
  align-items: center;
  gap: 18px;
  min-height: 410px;
  padding: clamp(24px, 4vw, 48px);
}
#${ROOT_ID} .fs-window,
#${ROOT_ID} .fs-paper {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--fs-line);
  background: #fff;
  box-shadow: 0 18px 42px -31px rgba(15,23,42,.58);
  transition: transform .7s var(--fs-ease), opacity .45s ease, border-color .45s ease, box-shadow .45s ease;
}
#${ROOT_ID} .fs-window { border-radius: 18px; }
#${ROOT_ID} .fs-window-bar { display: flex; align-items: center; gap: 5px; height: 34px; padding: 0 13px; border-bottom: 1px solid #edf0f7; background: #fafbfe; }
#${ROOT_ID} .fs-window-bar i { width: 6px; height: 6px; border-radius: 50%; background: #d7dceb; }
#${ROOT_ID} .fs-window-body { min-height: 245px; padding: 24px; }
#${ROOT_ID} .fs-company { display: flex; align-items: center; gap: 10px; color: var(--fs-ink); font-size: .75rem; font-weight: 800; }
#${ROOT_ID} .fs-company-mark { display: grid; place-items: center; width: 29px; height: 29px; border-radius: 9px; color: #fff; background: linear-gradient(135deg,#7c6fff,#4f46e5); }
#${ROOT_ID} .fs-role { margin: 20px 0 8px; color: var(--fs-ink); font-size: clamp(1rem, 2vw, 1.28rem); font-weight: 800; letter-spacing: -.025em; }
#${ROOT_ID} .fs-role-meta { color: var(--fs-muted); font-size: .72rem; }
#${ROOT_ID} .fs-requirements { display: grid; gap: 8px; margin-top: 21px; }
#${ROOT_ID} .fs-requirements i { display: block; height: 8px; border-radius: 999px; background: #edf0f7; }
#${ROOT_ID} .fs-requirements i:nth-child(1) { width: 92%; }
#${ROOT_ID} .fs-requirements i:nth-child(2) { width: 76%; }
#${ROOT_ID} .fs-requirements i:nth-child(3) { width: 84%; }
#${ROOT_ID} .fs-capture {
  position: absolute;
  right: 15px;
  bottom: 15px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 13px;
  border: 1px solid #d7d2ff;
  border-radius: 13px;
  color: var(--fs-violet-deep);
  background: rgba(255,255,255,.96);
  box-shadow: 0 13px 28px -18px rgba(49,46,129,.7);
  font-size: .72rem;
  font-weight: 800;
  transform: translateY(14px) scale(.96);
  opacity: 0;
}
#${ROOT_ID} .fs-capture-badge { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 8px; color: #fff; background: var(--fs-violet); }
#${ROOT_ID} .fs-bridge { position: relative; height: 160px; }
#${ROOT_ID} .fs-bridge::before { content: ""; position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: #d9d6ff; }
#${ROOT_ID} .fs-flow-dot { position: absolute; top: calc(50% - 6px); left: 0; width: 12px; height: 12px; border-radius: 50%; background: var(--fs-violet); box-shadow: 0 0 0 6px rgba(91,77,247,.13); opacity: 0; }
#${ROOT_ID} .fs-paper { min-height: 302px; padding: 24px 25px; border-radius: 12px; }
#${ROOT_ID} .fs-paper-head { display: flex; justify-content: space-between; gap: 14px; padding-bottom: 16px; border-bottom: 1px solid #e9edf5; }
#${ROOT_ID} .fs-person strong { display: block; color: var(--fs-ink); font-size: .86rem; }
#${ROOT_ID} .fs-person span { color: var(--fs-muted); font-size: .62rem; }
#${ROOT_ID} .fs-match { color: var(--fs-violet-deep); font-size: .65rem; font-weight: 800; }
#${ROOT_ID} .fs-section-label { margin: 18px 0 10px; color: #64748b; font-size: .58rem; font-weight: 900; letter-spacing: .12em; }
#${ROOT_ID} .fs-line { position: relative; height: 8px; margin-top: 8px; overflow: hidden; border-radius: 999px; background: #edf0f6; }
#${ROOT_ID} .fs-line::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(90deg,#dcd8ff,#8176ff); transform: translateX(-105%); }
#${ROOT_ID} .fs-line:nth-of-type(2) { width: 91%; }
#${ROOT_ID} .fs-line:nth-of-type(3) { width: 76%; }
#${ROOT_ID} .fs-line:nth-of-type(4) { width: 85%; }
#${ROOT_ID} .fs-packet { position: absolute; right: 18px; bottom: 18px; display: flex; gap: 8px; transform: translateY(16px); opacity: 0; }
#${ROOT_ID} .fs-doc-chip { padding: 7px 9px; border: 1px solid #dcd8ff; border-radius: 9px; color: var(--fs-violet-deep); background: #fff; font-size: .62rem; font-weight: 800; box-shadow: 0 8px 20px -16px rgba(49,46,129,.8); }
#${ROOT_ID} .fs-status {
  position: absolute;
  left: 50%;
  bottom: 17px;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: min(86%, 430px);
  padding: 11px 15px;
  border: 1px solid rgba(91,77,247,.16);
  border-radius: 14px;
  color: var(--fs-ink);
  background: rgba(255,255,255,.94);
  box-shadow: 0 16px 34px -24px rgba(49,46,129,.7);
  font-size: .75rem;
  font-weight: 750;
  transform: translate(-50%, 10px);
  opacity: 0;
  transition: opacity .45s ease, transform .55s var(--fs-ease);
}
#${ROOT_ID} .fs-status i { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: var(--fs-mint); box-shadow: 0 0 0 5px rgba(15,159,116,.11); }
#${ROOT_ID}[data-step="0"] .fs-window { border-color: #bbb5ff; box-shadow: 0 24px 52px -34px rgba(67,56,202,.72); transform: translateY(-4px); }
#${ROOT_ID}[data-step="0"] .fs-capture { opacity: 1; transform: none; }
#${ROOT_ID}[data-step="1"] .fs-window { opacity: .72; transform: translateX(-4px) scale(.98); }
#${ROOT_ID}[data-step="1"] .fs-paper { border-color: #aaa2ff; transform: translateY(-4px); box-shadow: 0 24px 52px -34px rgba(67,56,202,.72); }
#${ROOT_ID}[data-step="1"] .fs-line::after { transform: none; transition: transform 1.1s var(--fs-ease); }
#${ROOT_ID}[data-step="2"] .fs-window { opacity: .58; transform: translateX(-6px) scale(.97); }
#${ROOT_ID}[data-step="2"] .fs-paper { border-color: #9ddfc9; transform: translateY(-4px); box-shadow: 0 24px 52px -34px rgba(15,159,116,.45); }
#${ROOT_ID}[data-step="2"] .fs-line::after { transform: none; }
#${ROOT_ID}[data-step="2"] .fs-packet { opacity: 1; transform: none; transition: opacity .48s ease .16s, transform .6s var(--fs-ease) .16s; }
#${ROOT_ID} .fs-status { opacity: 1; transform: translate(-50%, 0); }
#${ROOT_ID}.fs-running .fs-flow-dot { animation: fs-flow 2.15s var(--fs-ease) infinite; }
#${ROOT_ID}.fs-running[data-step="0"] .fs-capture { animation: fs-capture-pulse 2.8s ease-in-out infinite; }
#${ROOT_ID}.fs-running[data-step="1"] .fs-line::after { animation: fs-line-shine 2.6s ease-in-out infinite; }
#${ROOT_ID}.fs-running[data-step="2"] .fs-doc-chip { animation: fs-chip-lift 2.7s ease-in-out infinite; }
#${ROOT_ID}.fs-running[data-step="2"] .fs-doc-chip:nth-child(2) { animation-delay: .22s; }
@keyframes fs-flow { 0% { opacity:0; transform:translateX(0) scale(.75); } 18% { opacity:1; } 78% { opacity:1; } 100% { opacity:0; transform:translateX(60px) scale(1); } }
@keyframes fs-capture-pulse { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
@keyframes fs-line-shine { 0%,100% { opacity:.72; } 50% { opacity:1; } }
@keyframes fs-chip-lift { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }

html.${ACTIVE_CLASS} #stp-cro .stp-preview,
html.${ACTIVE_CLASS} #stp-cro .stp-score-ring,
html.${ACTIVE_CLASS} #stp-cro .stp-drop,
html.${ACTIVE_CLASS} #stp-cro .fs-reveal-target { will-change: transform, opacity; }
html.${ACTIVE_CLASS} #stp-cro .fs-reveal-target { opacity: 1; transform: translateY(18px); transition: transform .72s cubic-bezier(.22,1,.36,1); }
html.${ACTIVE_CLASS} #stp-cro .fs-reveal-target.fs-in { transform: none; }
html.${ACTIVE_CLASS}.${RUNNING_CLASS} #stp-cro .stp-preview { animation: fs-hero-float 7s ease-in-out infinite; }
html.${ACTIVE_CLASS}.${RUNNING_CLASS} #stp-cro .stp-score-ring { animation: fs-score-breathe 3.8s ease-in-out infinite; }
html.${ACTIVE_CLASS}.${RUNNING_CLASS} #stp-cro .stp-drop { animation: fs-drop-breathe 4.8s ease-in-out infinite; }
@keyframes fs-hero-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-7px); } }
@keyframes fs-score-breathe { 0%,100% { transform:scale(1); } 50% { transform:scale(1.045); } }
@keyframes fs-drop-breathe { 0%,100% { box-shadow:0 0 0 0 rgba(91,77,247,0); } 50% { box-shadow:0 0 0 7px rgba(91,77,247,.08); } }

@media (max-width: 760px) {
  #${ROOT_ID} { width: min(100% - 24px, 1180px); margin-top: 24px; }
  #${ROOT_ID} .fs-stage { padding: 32px 14px 20px; border-radius: 25px; }
  #${ROOT_ID} .fs-head { padding-inline: 8px; }
  #${ROOT_ID} .fs-controls { margin: 18px 0 20px; }
  #${ROOT_ID} .fs-steps { grid-template-columns: 1fr; gap: 4px; border-radius: 16px; }
  #${ROOT_ID} .fs-step { min-height: 44px; text-align: left; }
  #${ROOT_ID} .fs-viewport { min-height: 590px; border-radius: 20px; }
  #${ROOT_ID} .fs-grid { grid-template-columns: 1fr; align-content: start; gap: 16px; min-height: 590px; padding: 20px 18px 80px; }
  #${ROOT_ID} .fs-window-body { min-height: 190px; padding: 18px; }
  #${ROOT_ID} .fs-requirements { margin-top: 15px; }
  #${ROOT_ID} .fs-bridge { height: 34px; width: 100%; }
  #${ROOT_ID} .fs-bridge::before { top: 0; bottom: 0; left: 50%; right: auto; width: 1px; height: auto; }
  #${ROOT_ID} .fs-flow-dot { top: 0; left: calc(50% - 6px); }
  #${ROOT_ID}.fs-running .fs-flow-dot { animation-name: fs-flow-mobile; }
  #${ROOT_ID} .fs-paper { min-height: 238px; padding: 18px; }
  #${ROOT_ID} .fs-status { bottom: 15px; width: calc(100% - 30px); min-width: 0; }
  @keyframes fs-flow-mobile { 0% { opacity:0; transform:translateY(0) scale(.75); } 18% { opacity:1; } 78% { opacity:1; } 100% { opacity:0; transform:translateY(28px) scale(1); } }
}
@media (prefers-reduced-motion: reduce) {
  #${ROOT_ID}:not(.fs-motion-opt-in) *,
  #${ROOT_ID}:not(.fs-motion-opt-in) *::before,
  #${ROOT_ID}:not(.fs-motion-opt-in) *::after,
  html.${ACTIVE_CLASS}:not(.fs-motion-opt-in) #stp-cro * { animation: none !important; transition-duration: .001ms !important; }
  html.${ACTIVE_CLASS}:not(.fs-motion-opt-in) #stp-cro .fs-reveal-target { opacity:1; transform:none; }
}
`;

  var markup = `
<section class="fs-stage" aria-labelledby="fs-motion-title">
  <div class="fs-head">
    <h2 id="fs-motion-title">From job post to application-ready.</h2>
    <p>Bring in the role, tailor your real experience, and keep the finished résumé and cover letter together for your review.</p>
  </div>
  <div class="fs-controls"><button class="fs-motion-toggle" type="button" aria-pressed="false">Pause motion</button></div>
  <div class="fs-steps" role="tablist" aria-label="Résumé preparation steps">
    <button class="fs-step" type="button" role="tab" aria-selected="true" data-fs-step="0"><span>1</span>Capture the role</button>
    <button class="fs-step" type="button" role="tab" aria-selected="false" data-fs-step="1"><span>2</span>Tailor the résumé</button>
    <button class="fs-step" type="button" role="tab" aria-selected="false" data-fs-step="2"><span>3</span>Review your packet</button>
  </div>
  <div class="fs-viewport" role="tabpanel" aria-live="polite">
    <div class="fs-grid">
      <div class="fs-window" aria-hidden="true">
        <div class="fs-window-bar"><i></i><i></i><i></i></div>
        <div class="fs-window-body">
          <div class="fs-company"><span class="fs-company-mark">N</span>Northline Careers</div>
          <div class="fs-role">Operations Specialist</div>
          <div class="fs-role-meta">Remote · Full time</div>
          <div class="fs-requirements"><i></i><i></i><i></i></div>
          <div class="fs-capture"><span class="fs-capture-badge">1st</span><span>Role captured</span></div>
        </div>
      </div>
      <div class="fs-bridge" aria-hidden="true"><span class="fs-flow-dot"></span></div>
      <div class="fs-paper" aria-hidden="true">
        <div class="fs-paper-head">
          <div class="fs-person"><strong>Your Name</strong><span>Operations · Customer experience</span></div>
          <div class="fs-match">ROLE-SPECIFIC</div>
        </div>
        <div class="fs-section-label">EXPERIENCE</div>
        <div class="fs-line"></div><div class="fs-line"></div><div class="fs-line"></div>
        <div class="fs-section-label">SKILLS &amp; STRENGTHS</div>
        <div class="fs-line"></div><div class="fs-line"></div>
        <div class="fs-packet"><span class="fs-doc-chip">Résumé ready</span><span class="fs-doc-chip">Cover letter ready</span></div>
      </div>
    </div>
    <div class="fs-status"><i></i><span>Saved to My Jobs — nothing submitted</span></div>
  </div>
</section>`;

  function mount() {
    if (document.getElementById(ROOT_ID)) return true;
    var hero = document.querySelector('#stp-cro .stp-hero') || document.querySelector('.stp-hero');
    if (!hero) return false;

    var style = document.createElement('style');
    style.id = 'fs-motion-styles';
    style.textContent = styles;
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.dataset.version = VERSION;
    root.dataset.step = '0';
    root.innerHTML = markup;
    hero.after(root);

    var html = document.documentElement;
    var motionQuery = window.matchMedia(REDUCE_QUERY);
    var toggle = root.querySelector('.fs-motion-toggle');
    var stepButtons = Array.from(root.querySelectorAll('[data-fs-step]'));
    var status = root.querySelector('.fs-status span');
    var statuses = [
      'Saved to My Jobs — nothing submitted',
      'Résumé tailored from your confirmed experience',
      'Application packet ready for your review'
    ];
    var currentStep = 0;
    var manualPause = false;
    var motionOptIn = false;
    var visible = false;
    var timer = null;

    html.classList.add(ACTIVE_CLASS);

    function clearTimer() {
      window.clearTimeout(timer);
      timer = null;
    }

    function stopped() {
      return manualPause || (motionQuery.matches && !motionOptIn) || document.hidden || !visible;
    }

    function renderStep(nextStep) {
      currentStep = nextStep;
      root.dataset.step = String(currentStep);
      stepButtons.forEach(function (button, index) {
        button.setAttribute('aria-selected', String(index === currentStep));
        button.tabIndex = index === currentStep ? 0 : -1;
      });
      status.textContent = statuses[currentStep];
    }

    function schedule() {
      clearTimer();
      if (stopped()) return;
      timer = window.setTimeout(function () {
        renderStep((currentStep + 1) % stepButtons.length);
        schedule();
      }, 4200);
    }

    function sync() {
      var isStopped = stopped();
      root.classList.toggle('fs-running', !isStopped);
      root.classList.toggle('fs-motion-opt-in', motionOptIn);
      html.classList.toggle(RUNNING_CLASS, !isStopped);
      html.classList.toggle('fs-motion-opt-in', motionOptIn);
      toggle.textContent = isStopped ? 'Play motion' : 'Pause motion';
      toggle.setAttribute('aria-pressed', String(isStopped));
      schedule();
    }

    toggle.addEventListener('click', function () {
      if (motionQuery.matches && !motionOptIn) {
        motionOptIn = true;
        manualPause = false;
      } else {
        manualPause = !manualPause;
      }
      sync();
    });

    stepButtons.forEach(function (button, index) {
      button.addEventListener('click', function () {
        renderStep(index);
        schedule();
      });
      button.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        var direction = event.key === 'ArrowRight' ? 1 : -1;
        var next = (index + direction + stepButtons.length) % stepButtons.length;
        renderStep(next);
        stepButtons[next].focus();
        schedule();
      });
    });

    var motionObserver;
    if ('IntersectionObserver' in window) {
      motionObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target === root) visible = entry.isIntersecting;
        });
        sync();
      }, { threshold: .16 });
      motionObserver.observe(root);

      var revealTargets = Array.from(document.querySelectorAll(
        '#stp-cro .stp-section > .stp-wrap > h2, #stp-cro .stp-section > .stp-wrap > article, #stp-cro .stp-section .stp-price-card, #stp-cro .stp-section .stp-trust-card'
      ));
      var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('fs-in');
          revealObserver.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -7% 0px', threshold: .08 });
      revealTargets.forEach(function (target) {
        target.classList.add('fs-reveal-target');
        revealObserver.observe(target);
      });
    } else {
      visible = true;
    }

    motionQuery.addEventListener('change', function () {
      motionOptIn = false;
      sync();
    });
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', function () {
      clearTimer();
      root.classList.remove('fs-running');
      html.classList.remove(RUNNING_CLASS);
    });
    window.addEventListener('pageshow', sync);

    renderStep(0);
    sync();
    return true;
  }

  function ready() {
    if (mount()) return;
    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      if (mount() || attempts >= 24) window.clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  } else {
    ready();
  }
})();

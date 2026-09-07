/* 1stStep.ai marketing homepage behavior (index.html, served at /).
   No inline handlers, no third-party tracking, no network calls. */
(function () {
  'use strict';

  // ── No forward guard ────────────────────────────────────────────────────────
  // `/` always renders the marketing homepage — for everyone, every time.
  // Deep links go straight to the workspace instead of bouncing through `/`:
  //   • job capture  → /app?jobCaptureId=…&mode=…   (1ststep-extension/background.js)
  //   • extension UI → /app                          (1ststep-extension/popup.js)
  //   • install      → /concierge?welcome=extension  (1ststep-extension/background.js)
  // Nothing in this repo constructs a root deep link any more. If you add one,
  // point it at /app directly rather than reintroducing a redirect here.

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Sticky nav backdrop ──────────────────────────────────────────────────
    var nav = document.getElementById('siteNav');
    if (nav) {
      var onScroll = function () {
        if (window.scrollY > 8) nav.classList.add('is-stuck');
        else nav.classList.remove('is-stuck');
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // ── Mobile menu ──────────────────────────────────────────────────────────
    var toggle = document.getElementById('navToggle');
    var sheet = document.getElementById('navSheet');
    if (toggle && sheet) {
      toggle.addEventListener('click', function () {
        var open = sheet.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      sheet.addEventListener('click', function (event) {
        if (event.target.tagName === 'A') {
          sheet.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && sheet.classList.contains('is-open')) {
          sheet.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.focus();
        }
      });
    }

    // ── Scroll reveal ────────────────────────────────────────────────────────
    var revealables = document.querySelectorAll('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(revealables, function (el) { el.classList.add('is-in'); });
    } else {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      Array.prototype.forEach.call(revealables, function (el) { observer.observe(el); });
    }

    // Marketing-only motion: no requests, application state, or user data.
    var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    var motionButton = document.getElementById('motionToggle');
    var scenes = Array.prototype.slice.call(document.querySelectorAll('[data-motion-scene]'));
    var manualPause = false;
    var visibleScenes = new Set();
    var timer = null;
    var demo = document.getElementById('runSteps');
    var demoIndex = 0;
    var frames = [
      ['A role worth a closer look.', 'Your experience comes first', 'Only facts you have confirmed.', 'Match found · example only'],
      ['Made for this opportunity.', 'Résumé and cover letter prepared', 'Ready for you to read and edit.', 'Documents prepared · not sent'],
      ['Your call. Always.', 'Your application is ready to review', 'Check the answers and attachments first.', 'Waiting for your review · not sent']
    ];
    function showFrame() {
      if (!demo) return;
      var frame = frames[demoIndex];
      demo.dataset.demoStep = String(demoIndex);
      ['demoHeadline', 'demoDocument', 'demoDetail', 'demoStatus'].forEach(function (id, i) {
        document.getElementById(id).textContent = frame[i];
      });
      demo.querySelectorAll('.demo-progress li').forEach(function (item, i) {
        item.classList.toggle('is-current', i === demoIndex);
      });
    }
    function syncMotion() {
      window.clearTimeout(timer);
      timer = null;
      var paused = manualPause || motionQuery.matches || document.hidden;
      scenes.forEach(function (scene) {
        scene.classList.toggle('motion-running', !paused && visibleScenes.has(scene));
      });
      if (motionButton) {
        motionButton.textContent = motionQuery.matches ? 'Reduced motion on' : manualPause ? 'Play animations' : 'Pause animations';
        motionButton.disabled = motionQuery.matches;
        motionButton.setAttribute('aria-pressed', String(manualPause || motionQuery.matches));
      }
      if (!paused && demo && visibleScenes.has(demo.closest('[data-motion-scene]'))) {
        timer = window.setTimeout(function () {
          demoIndex = (demoIndex + 1) % frames.length;
          showFrame();
          syncMotion();
        }, 3600);
      }
    }
    if ('IntersectionObserver' in window) {
      var sceneObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visibleScenes.add(entry.target);
          else visibleScenes.delete(entry.target);
        });
        syncMotion();
      }, { threshold: 0.15 });
      scenes.forEach(function (scene) { sceneObserver.observe(scene); });
    } else {
      // Static fallback avoids uncontrolled motion in older browsers.
      manualPause = true;
    }
    if (motionButton) motionButton.addEventListener('click', function () {
      manualPause = !manualPause;
      syncMotion();
    });
    motionQuery.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
    window.addEventListener('pagehide', function () { window.clearTimeout(timer); });
    window.addEventListener('pageshow', syncMotion);
    showFrame();
    syncMotion();

    // ── Testimonials ─────────────────────────────────────────────────────────
    // Rendered ONLY from verified, attributable quotes. `window.STEP_TESTIMONIALS`
    // is the structured location for approved entries — see DESIGN.md. While it is
    // empty the section stays hidden and the truthful product-principle block is
    // shown instead. No placeholder names, employers, photos, or ratings ship.
    var approved = Array.isArray(window.STEP_TESTIMONIALS) ? window.STEP_TESTIMONIALS : [];
    var quotesSection = document.getElementById('testimonials');
    var quotesGrid = document.getElementById('quotesGrid');
    var principlesBlock = document.getElementById('principles');
    if (quotesSection && quotesGrid && principlesBlock) {
      var usable = approved.filter(function (item) {
        return item && typeof item.quote === 'string' && item.quote.trim() &&
               typeof item.name === 'string' && item.name.trim() &&
               typeof item.source === 'string' && item.source.trim();
      });
      if (usable.length) {
        principlesBlock.hidden = true;
        quotesGrid.hidden = false;
        usable.slice(0, 6).forEach(function (item) {
          var figure = document.createElement('figure');
          figure.className = 'quote';
          var block = document.createElement('blockquote');
          block.textContent = item.quote; // textContent — never innerHTML
          var caption = document.createElement('figcaption');
          var name = document.createElement('b');
          name.textContent = item.name;
          caption.appendChild(name);
          if (item.role) caption.appendChild(document.createTextNode(item.role));
          figure.appendChild(block);
          figure.appendChild(caption);
          quotesGrid.appendChild(figure);
        });
      } else {
        quotesGrid.hidden = true;
        principlesBlock.hidden = false;
      }
    }

    // ── Year ─────────────────────────────────────────────────────────────────
    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  });
})();

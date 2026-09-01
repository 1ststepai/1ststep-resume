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

    // ── Agent run demonstration ──────────────────────────────────────────────
    // Synthetic, clearly-labelled fixture data. It never depicts an application as
    // submitted without the receipt-verified step being reached first.
    var steps = Array.prototype.slice.call(document.querySelectorAll('#runSteps .step'));
    if (steps.length) {
      if (reduceMotion) {
        steps.forEach(function (step) { step.classList.add('is-done'); });
        steps[steps.length - 1].classList.add('is-active');
      } else {
        var index = 0;
        var advance = function () {
          steps.forEach(function (step, i) {
            step.classList.toggle('is-active', i === index);
            step.classList.toggle('is-done', i < index);
          });
          index = (index + 1) % (steps.length + 1);
          if (index === steps.length) {
            // Hold the completed state briefly before restarting.
            window.setTimeout(function () { index = 0; advance(); }, 2600);
            steps.forEach(function (step) { step.classList.add('is-done'); step.classList.remove('is-active'); });
            return;
          }
          window.setTimeout(advance, 1700);
        };
        // Only animate while the card is on screen, so a background tab stays idle.
        var card = document.getElementById('runSteps');
        var started = false;
        if ('IntersectionObserver' in window) {
          var runObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting && !started) { started = true; advance(); runObserver.disconnect(); }
            });
          }, { threshold: 0.25 });
          runObserver.observe(card);
        } else {
          advance();
        }
      }
    }

    // ── Receipt progression ──────────────────────────────────────
    // The same synthetic application moving Package ready → Awaiting you → Receipt
    // verified. Mirrors the run card: never shows the verified state before the
    // approval step has been reached.
    var receiptRows = Array.prototype.slice.call(document.querySelectorAll('#receiptFlow .panel-row'));
    if (receiptRows.length) {
      if (reduceMotion) {
        receiptRows.forEach(function (row) { row.classList.add('is-done'); });
        receiptRows[receiptRows.length - 1].classList.add('is-active');
      } else {
        var rIndex = 0;
        var rAdvance = function () {
          receiptRows.forEach(function (row, i) {
            row.classList.toggle('is-active', i === rIndex);
            row.classList.toggle('is-done', i < rIndex);
          });
          rIndex = (rIndex + 1) % (receiptRows.length + 1);
          if (rIndex === receiptRows.length) {
            receiptRows.forEach(function (row) { row.classList.add('is-done'); row.classList.remove('is-active'); });
            receiptRows[receiptRows.length - 1].classList.add('is-active');
            window.setTimeout(function () { rIndex = 0; rAdvance(); }, 2600);
            return;
          }
          window.setTimeout(rAdvance, 1700);
        };
        var receiptCard = document.getElementById('receiptFlow');
        var rStarted = false;
        if ('IntersectionObserver' in window) {
          var receiptObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting && !rStarted) { rStarted = true; rAdvance(); receiptObserver.disconnect(); }
            });
          }, { threshold: 0.25 });
          receiptObserver.observe(receiptCard);
        } else {
          rAdvance();
        }
      }
    }

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

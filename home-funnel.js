/* 1stStep.ai public landing funnel: lead capture before signup, plus first-party events.
   No résumé text, Saved Info values, or job answers are sent. */
(function () {
  'use strict';

  var LEAD_FLAG = '1ststep_waitlist_joined';
  var EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function campaignFromSearch() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return params.get('utm_campaign') || params.get('utm_source') || '';
    } catch (_) {
      return '';
    }
  }

  function hasLead() {
    try { return localStorage.getItem(LEAD_FLAG) === '1'; } catch (_) { return false; }
  }

  function markLead() {
    try { localStorage.setItem(LEAD_FLAG, '1'); } catch (_) {}
  }

  function track(eventName) {
    if (!eventName) return;
    fetch('/api/public-funnel-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: eventName, page: location.pathname || '/' }),
      keepalive: true,
    }).catch(function () {});
  }

  function continueToSignup() {
    window.location.href = '/concierge';
  }

  function focusLeadForm() {
    var email = document.getElementById('heroLeadEmail');
    var status = document.getElementById('heroLeadStatus');
    if (location.hash !== '#lead') location.hash = 'lead';
    if (email) {
      email.focus();
      if (typeof email.scrollIntoView === 'function') email.scrollIntoView({ block: 'center' });
    }
    if (status && !status.textContent) status.textContent = 'Enter your email first. We save it so we can follow up.';
  }

  function saveLead(input) {
    var email = String(input.email || '').trim();
    var status = input.status;
    var submit = input.submit;
    if (!EMAIL_OK.test(email)) {
      if (status) status.textContent = 'Enter a valid email address.';
      return Promise.resolve({ ok: false, invalid: true });
    }
    if (status) status.textContent = 'Saving…';
    if (submit) submit.disabled = true;
    return fetch('/api/public-waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        name: input.name || '',
        marketingConsent: input.marketingConsent === true,
        source: input.source || 'landing',
        page: location.pathname + (input.pageHash || location.hash || ''),
        campaign: campaignFromSearch(),
      }),
    }).then(function (response) {
      return response.json().then(function (data) {
        return { ok: response.ok, status: response.status, data: data };
      }).catch(function () {
        return { ok: false, status: response.status, data: {} };
      });
    }).then(function (result) {
      if (result.ok && result.data && result.data.ok) {
        markLead();
        track('waitlist_submitted');
        return result;
      }
      var message = 'The waitlist could not be saved. Email sales@1ststep.ai if this keeps happening.';
      if (result.status === 400) message = (result.data && result.data.error) || 'Enter a valid email address.';
      else if (result.data && result.data.error && /sales@1ststep\.ai/i.test(result.data.error)) message = result.data.error;
      if (status) status.textContent = message;
      return { ok: false };
    }).catch(function () {
      if (status) status.textContent = 'The waitlist could not be saved. Email sales@1ststep.ai if this keeps happening.';
      return { ok: false };
    }).then(function (result) {
      if (submit) submit.disabled = false;
      return result;
    });
  }

  ready(function () {
    track('landing_viewed');

    if (hasLead()) {
      document.querySelectorAll('a[data-funnel-cta="primary"]').forEach(function (link) {
        link.setAttribute('href', '/concierge');
      });
    }

    document.addEventListener('click', function (event) {
      var target = event.target.closest('[data-funnel-cta]');
      if (!target) return;
      var kind = target.getAttribute('data-funnel-cta');
      if (kind === 'demo') {
        track('product_demo_interaction');
        return;
      }
      if (kind !== 'primary') return;
      track('primary_cta');
      if (target.tagName === 'BUTTON') return;
      if (hasLead()) return;
      event.preventDefault();
      focusLeadForm();
    });

    var heroForm = document.getElementById('heroLeadForm');
    var heroStatus = document.getElementById('heroLeadStatus');
    if (heroForm && heroStatus) {
      heroForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var email = (document.getElementById('heroLeadEmail') || {}).value || '';
        var submit = heroForm.querySelector('button[type="submit"]');
        saveLead({
          email: email,
          status: heroStatus,
          submit: submit,
          source: 'landing',
          pageHash: '#lead',
        }).then(function (result) {
          if (!result || !result.ok) return;
          track('signup_started');
          heroStatus.textContent = 'Lead saved. Continuing to Job Agent…';
          continueToSignup();
        });
      });
    }

    var form = document.getElementById('waitlistForm');
    var status = document.getElementById('waitlistStatus');
    if (!form || !status) return;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = (document.getElementById('waitlistEmail') || {}).value || '';
      var name = (document.getElementById('waitlistName') || {}).value || '';
      var updates = document.getElementById('waitlistUpdates');
      var submit = form.querySelector('button[type="submit"]');
      saveLead({
        email: email,
        name: name,
        marketingConsent: Boolean(updates && updates.checked),
        status: status,
        submit: submit,
        source: 'landing',
        pageHash: '#waitlist',
      }).then(function (result) {
        if (!result || !result.ok) return;
        status.textContent = (result.data && result.data.message) || 'You are on the waitlist. This does not grant Job Agent beta access.';
        form.reset();
      });
    });
  });
})();

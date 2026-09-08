/* Shared 1stStep.ai appearance control. No network calls or user data. */
(function () {
  'use strict';

  var STORAGE_KEY = '1ststep_theme';
  var root = document.documentElement;

  function savedTheme() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch { return null; }
  }

  function applyTheme(theme, persist) {
    var next = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = next;
    root.style.colorScheme = next;
    var color = next === 'dark' ? '#080b17' : '#ffffff';
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) { meta.content = color; });
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      var dark = next === 'dark';
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      button.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
      button.innerHTML = dark
        ? '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg><span>Light</span>'
        : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 14.4A8.5 8.5 0 0 1 9.6 3.5 8.5 8.5 0 1 0 20.5 14.4Z"></path></svg><span>Dark</span>';
    });
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* preference remains in this tab */ }
    }
  }

  function bind() {
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    if (!buttons.length) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'site-theme-toggle site-theme-toggle--floating';
      button.dataset.themeToggle = '';
      document.body.appendChild(button);
      buttons = [button];
    }
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
      });
    });
    applyTheme(root.dataset.theme || savedTheme() || 'light', false);
  }

  applyTheme(savedTheme() || 'light', false);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY && (event.newValue === 'dark' || event.newValue === 'light')) applyTheme(event.newValue, false);
  });
})();

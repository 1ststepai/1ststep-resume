const STORE_KEY = 'firststep_outreach_prospects';
    const PARTNER_KEY = 'firststep_growth_partner';
    const APP_BASE_URL = 'https://app.1ststep.ai/';
    const $ = id => document.getElementById(id);

    function encode(q) {
      return encodeURIComponent(q.replace(/\s+/g, ' ').trim());
    }

    function googleFreshnessParam(days) {
      if (days === '7') return '&tbs=qdr:w';
      if (days === '30') return '&tbs=qdr:m';
      return '';
    }

    function normalizePartnerCode(value) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
        .replace(/^-+|-+$/g, '');
    }

    function loadPartner() {
      try { return JSON.parse(localStorage.getItem(PARTNER_KEY) || '{}'); } catch { return {}; }
    }

    function savePartner(partner) {
      localStorage.setItem(PARTNER_KEY, JSON.stringify(partner));
    }

    function setCodeError(message) {
      const el = $('codeError');
      if (!el) return;
      el.textContent = message || '';
      el.style.display = message ? 'block' : 'none';
    }

    function getPartner({ showErrors = false } = {}) {
      const current = loadPartner();
      const partnerName = $('partnerName')?.value.trim() || current.partnerName || '';
      const rawCode = $('referralCode')?.value || current.referralCode || '';
      const referralCode = normalizePartnerCode(rawCode);
      if (!referralCode && showErrors) {
        setCodeError('Enter a partner code using letters, numbers, spaces, underscores, or hyphens.');
      } else {
        setCodeError('');
      }
      return { partnerName, referralCode };
    }

    function referralLink(partner = getPartner()) {
      const code = normalizePartnerCode(partner.referralCode || '');
      const params = new URLSearchParams({
        ref: code,
        utm_source: 'partner',
        utm_medium: 'referral',
        utm_campaign: 'growth_finder'
      });
      return `${APP_BASE_URL}?${params.toString()}`;
    }

    function renderGeneratedLink(partner) {
      const link = referralLink(partner);
      $('referralCode').value = partner.referralCode;
      $('referralLink').value = link;
      $('referralLinkText').textContent = link;
      $('testReferralBtn').href = link;
      $('generatedLinkBox').style.display = 'block';
      $('copyStatus').textContent = '';
      return link;
    }

    function hydratePartnerForm() {
      const partner = loadPartner();
      $('partnerName').value = partner.partnerName || '';
      $('referralCode').value = partner.referralCode || '';
      if (partner.referralCode) renderGeneratedLink(partner);
    }

    function getSubject() {
      return 'A job application workflow that may help';
    }

    function getMessage(name = '[Name]', item = {}) {
      const signal = item.platform === 'Reddit' ? 'your post about the job search' : 'your #OpenToWork post';
      const partner = getPartner();
      const link = item.referralLink || (partner.referralCode ? referralLink(partner) : 'https://app.1ststep.ai');
      return `Hey ${name}, saw ${signal}. 1stStep.ai helps organize job applications and build role-specific materials, and its Chrome extension can capture supported job pages without copying and pasting. Might be useful here: ${link}`;
    }

    function getTemplate(name = '[Name]', item = {}) {
      return `Subject: ${getSubject()}\n\n${getMessage(name, item)}`;
    }

    function prospectTemplate(item) {
      const firstName = String(item.name || '[Name]').trim().split(/\s+/)[0] || '[Name]';
      return getTemplate(firstName, item);
    }

    function buildQueries() {
      const role = $('role').value.trim() || 'marketing manager';
      const location = $('location').value.trim();
      const keywords = $('keywords').value.trim() || '#OpenToWork';
      const days = $('days').value;
      const platform = $('platform').value;
      const freshness = googleFreshnessParam(days);
      const core = `"open to work" OR "#OpenToWork" ${role} ${location} ${keywords}`;
      const searches = [];

      if (platform === 'linkedin' || platform === 'google') {
        searches.push({
          title: 'Google: LinkedIn posts and profiles',
          hint: 'Best free starting point. Open results manually and qualify fit before messaging.',
          url: `https://www.google.com/search?q=${encode(`site:linkedin.com/in OR site:linkedin.com/posts ${core}`)}${freshness}`
        });
        searches.push({
          title: 'Google: LinkedIn exact phrase',
          hint: 'Narrower search for explicit #OpenToWork language.',
          url: `https://www.google.com/search?q=${encode(`site:linkedin.com/posts "#OpenToWork" "${role}" "${location}"`)}${freshness}`
        });
      }

      if (platform === 'x' || platform === 'google') {
        searches.push({
          title: 'Google: X / Twitter public posts',
          hint: 'Useful for people who announce layoffs or job searches publicly.',
          url: `https://www.google.com/search?q=${encode(`site:x.com OR site:twitter.com ${core}`)}${freshness}`
        });
      }

      if (platform === 'reddit' || platform === 'google') {
        searches.push({
          title: 'Google: Reddit job-search threads',
          hint: 'Find public Reddit discussions where a helpful, no-link-first reply can work.',
          url: `https://www.google.com/search?q=${encode(`site:reddit.com/r/careerguidance OR site:reddit.com/r/resumes OR site:reddit.com/r/jobs ${role} ${location} "resume" OR "not getting interviews" OR "laid off"`)}${freshness}`
        });
      }

      searches.push({
        title: 'LinkedIn manual search',
        hint: 'Paste the generated query into LinkedIn search manually. Do not automate scraping.',
        url: `https://www.linkedin.com/search/results/content/?keywords=${encode(`#OpenToWork ${role} ${location}`)}`
      });

      return searches;
    }

    function renderSearches() {
      const list = $('searchList');
      list.innerHTML = '';
      buildQueries().forEach(item => {
        const card = document.createElement('article');
        card.className = 'search-card';
        card.innerHTML = `
          <h3>${item.title}</h3>
          <p>${item.hint}</p>
          <a class="btn primary" href="${item.url}" target="_blank" rel="noopener">Open Search</a>
        `;
        list.appendChild(card);
      });
    }

    function loadProspects() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
    }

    function saveProspects(items) {
      localStorage.setItem(STORE_KEY, JSON.stringify(items));
      renderStats();
    }

    function renderProspects() {
      const items = loadProspects();
      const box = $('prospects');
      renderDmConsole(items);
      if (!items.length) {
        box.innerHTML = '<div class="empty">No prospects saved yet.</div>';
        return;
      }
      box.innerHTML = '';
      items.forEach((item, index) => {
        const card = document.createElement('article');
        card.className = 'prospect-card';
        const status = item.status || 'NEW';
        card.innerHTML = `
          <h3>${escapeHtml(item.name || 'Unnamed prospect')}</h3>
          <div class="status ${['DM_SENT', 'SIGNED_UP'].includes(status) ? 'sent' : ''}">${escapeHtml(status)}</div>
          <p>${escapeHtml(item.note || '')}</p>
          <div class="meta">${escapeHtml(item.platform || 'Prospect')} · ${escapeHtml(item.field || '')}</div>
          <div class="template">${escapeHtml(item.template || prospectTemplate(item))}</div>
          <div class="btns">
            <a class="btn secondary" href="${escapeAttr(item.profile || '#')}" target="_blank" rel="noopener">Open Profile</a>
            <button class="primary" data-open-copy="${index}">Open + Copy</button>
            <button class="secondary" data-copy="${index}">Copy Subject + DM</button>
            <button class="green" data-sent="${index}">Mark DM Sent</button>
            <button class="green" data-signup="${index}">Mark Signup</button>
            <button class="danger" data-remove="${index}">Remove</button>
          </div>
        `;
        box.appendChild(card);
      });
      box.querySelectorAll('[data-open-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = loadProspects()[Number(btn.dataset.openCopy)];
          copyText(item.template || prospectTemplate(item));
          if (item.profile) window.open(item.profile, '_blank', 'noopener');
        });
      });
      box.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = loadProspects()[Number(btn.dataset.copy)];
          copyText(item.template || prospectTemplate(item));
        });
      });
      box.querySelectorAll('[data-sent]').forEach(btn => {
        btn.addEventListener('click', () => {
          const next = loadProspects();
          next[Number(btn.dataset.sent)].status = 'DM_SENT';
          next[Number(btn.dataset.sent)].dmSentAt = new Date().toISOString();
          saveProspects(next);
          renderProspects();
        });
      });
      box.querySelectorAll('[data-signup]').forEach(btn => {
        btn.addEventListener('click', () => {
          const next = loadProspects();
          next[Number(btn.dataset.signup)].status = 'SIGNED_UP';
          next[Number(btn.dataset.signup)].signedUpAt = new Date().toISOString();
          saveProspects(next);
          renderProspects();
        });
      });
      box.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          const next = loadProspects();
          next.splice(Number(btn.dataset.remove), 1);
          saveProspects(next);
          renderProspects();
        });
      });
    }

    function renderDmConsole(items) {
      const box = $('dmConsole');
      const nextIndex = items.findIndex(item => !['DM_SENT', 'SIGNED_UP'].includes(item.status || 'NEW'));
      if (nextIndex < 0) {
        box.innerHTML = '<div class="empty">No unsent messages. Nice.</div>';
        return;
      }
      const item = items[nextIndex];
      box.innerHTML = `
        <article class="prospect-card">
          <h3>Next: ${escapeHtml(item.name || 'Unnamed prospect')}</h3>
          <div class="meta">${escapeHtml(item.platform || 'Prospect')} · ${escapeHtml(item.field || '')}</div>
          <div class="template">${escapeHtml(item.template || prospectTemplate(item))}</div>
          <div class="btns">
            <button class="primary" id="nextOpenCopy">Open Profile + Copy Message</button>
            <button class="green" id="nextSent">Mark DM Sent</button>
          </div>
        </article>
      `;
      $('nextOpenCopy').addEventListener('click', () => {
        copyText(item.template || prospectTemplate(item));
        if (item.profile) window.open(item.profile, '_blank', 'noopener');
      });
      $('nextSent').addEventListener('click', () => {
        const next = loadProspects();
        next[nextIndex].status = 'DM_SENT';
        next[nextIndex].dmSentAt = new Date().toISOString();
        saveProspects(next);
        renderProspects();
      });
    }

    function renderStats() {
      const partner = getPartner();
      if (partner.referralCode && $('referralLink')) {
        $('referralLink').value = referralLink(partner);
      }
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/`/g, '&#96;');
    }

    function parseResult(raw) {
      const text = String(raw || '').trim();
      const compact = text.replace(/\s+/g, ' ');
      const urlMatch = text.match(/https?:\/\/[^\s]+(?:linkedin\.com|x\.com|twitter\.com|reddit\.com)[^\s]*/i);
      let name = '';
      const linkedinName = text.match(/LinkedIn\s*-\s*([^\n|]+?)(?:\s+\d+\s+reactions|\n|$)/i);
      const postName = text.match(/([A-Z][A-Za-z .'-]{2,80})'s Post/);
      const xName = text.match(/(?:X|Twitter)\s*-\s*@?([A-Za-z0-9_]{2,30})/i);
      const redditName = text.match(/(?:reddit\.com\/user\/|u\/)([A-Za-z0-9_-]{2,30})/i);
      if (linkedinName) name = linkedinName[1].trim();
      if (!name && postName) name = postName[1].trim();
      if (!name && xName) name = `@${xName[1].trim().replace(/^@/, '')}`;
      if (!name && redditName) name = redditName[1].trim();
      const url = urlMatch ? urlMatch[0] : '';
      const platform = /reddit\.com/i.test(url || text) ? 'Reddit' : (/x\.com|twitter\.com/i.test(url || text) ? 'X' : 'LinkedIn');
      return {
        name,
        profile: url,
        platform,
        field: $('role').value.trim(),
        note: compact.slice(0, 240),
      };
    }

    function splitPastedResults(raw) {
      const text = String(raw || '').trim();
      if (!text) return [];
      const blocks = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
      if (blocks.length > 1) return blocks;
      return text
        .split(/(?=\n(?:LinkedIn|X|Twitter|Reddit)\s*-)|(?=\nhttps?:\/\/(?:www\.)?(?:linkedin|x|twitter|reddit)\.com)/i)
        .map(s => s.trim())
        .filter(Boolean);
    }

    function buildProspectItem(source) {
      const partner = getPartner();
      const item = {
        name: source.name || '',
        profile: source.profile || '',
        partnerName: partner.partnerName || '',
        referralCode: partner.referralCode || '',
        referralLink: partner.referralCode ? referralLink(partner) : '',
        field: source.field || '',
        note: source.note || '',
        subject: getSubject(),
        template: '',
        status: 'NEW',
        savedAt: new Date().toISOString()
      };
      item.template = prospectTemplate(item);
      return item;
    }

    function saveItem(item) {
      if (!item.name && !item.profile) return false;
      const items = loadProspects();
      items.unshift(item);
      saveProspects(items);
      renderProspects();
      return true;
    }

    function parseAndSaveProspect() {
      const parsed = splitPastedResults($('resultPaste').value).map(block => buildProspectItem(parseResult(block)));
      const valid = parsed.filter(item => item.name || item.profile);
      if (!valid.length) return;
      const items = loadProspects();
      const first = valid[0];
      saveProspects([...valid.reverse(), ...items]);
      $('name').value = first.name;
      $('profile').value = first.profile;
      $('field').value = first.field;
      $('note').value = first.note;
      $('template').textContent = first.template;
      renderProspects();
    }

    function saveProspect() {
      const item = buildProspectItem({
        name: $('name').value.trim(),
        profile: $('profile').value.trim(),
        field: $('field').value.trim(),
        note: $('note').value.trim()
      });
      if (!saveItem(item)) return;
      ['name', 'profile', 'field', 'note'].forEach(id => $(id).value = '');
    }

    function exportCsv() {
      const rows = [['Partner', 'Referral Code', 'Referral Link', 'Name', 'Profile URL', 'Platform', 'Field', 'Note', 'Subject', 'Template', 'Status', 'DM Sent At', 'Signed Up At', 'Saved At'], ...loadProspects().map(item => [
        item.partnerName, item.referralCode, item.referralLink, item.name, item.profile, item.platform, item.field, item.note, item.subject || getSubject(), item.template || prospectTemplate(item), item.status || 'NEW', item.dmSentAt, item.signedUpAt, item.savedAt
      ])];
      const csv = rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `firststep-outreach-prospects-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        try {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.setAttribute('readonly', '');
          textarea.style.position = 'fixed';
          textarea.style.top = '-1000px';
          document.body.appendChild(textarea);
          textarea.select();
          const ok = document.execCommand('copy');
          textarea.remove();
          return ok;
        } catch {
          return false;
        }
      }
    }

    $('buildBtn').addEventListener('click', renderSearches);
    $('copyDmBtn').addEventListener('click', () => copyText(getTemplate()));
    $('copyTemplateBtn').addEventListener('click', () => copyText(getTemplate()));
    $('savePartnerBtn').addEventListener('click', () => {
      const partner = getPartner({ showErrors: true });
      if (!partner.referralCode) return;
      savePartner(partner);
      renderGeneratedLink(partner);
      renderStats();
    });
    $('copyReferralBtn').addEventListener('click', async () => {
      const link = $('referralLink').value || referralLink(getPartner());
      const copied = await copyText(link);
      $('copyStatus').textContent = copied ? 'Copied!' : 'Copy failed. Select the link and copy it manually.';
    });
    $('parseBtn').addEventListener('click', parseAndSaveProspect);
    $('saveBtn').addEventListener('click', saveProspect);
    $('copyAllBtn').addEventListener('click', () => {
      const messages = loadProspects()
        .filter(item => !['DM_SENT', 'SIGNED_UP'].includes(item.status || 'NEW'))
        .map(item => item.template || prospectTemplate(item));
      copyText(messages.join('\n\n---\n\n'));
    });
    $('exportBtn').addEventListener('click', exportCsv);
    $('clearBtn').addEventListener('click', () => {
      if (confirm('Clear all saved prospects?')) {
        saveProspects([]);
        renderProspects();
      }
    });
    $('referralCode').addEventListener('input', () => setCodeError(''));

    const navToggle = $('navToggle');
    const mobileNav = $('mobileNav');
    navToggle.addEventListener('click', () => {
      const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!isOpen));
      mobileNav.hidden = isOpen;
      navToggle.textContent = isOpen ? 'Menu' : 'Close';
    });
    mobileNav.addEventListener('click', event => {
      if (event.target.closest('a')) {
        mobileNav.hidden = true;
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.textContent = 'Menu';
      }
    });

    function updateCalculator() {
      const referrals = Number($('referralRange').value);
      const months = Number($('activeMonthsRange').value);
      const monthly = referrals * 39 * 0.30;
      $('referralCount').textContent = referrals;
      $('activeMonths').textContent = months;
      $('monthlyPotential').textContent = monthly.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
      $('commissionEstimate').textContent = (monthly * months).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    }
    $('referralRange').addEventListener('input', updateCalculator);
    $('activeMonthsRange').addEventListener('input', updateCalculator);

    const motionToggle = $('motionToggle');
    function setMotionPaused(paused) {
      document.documentElement.classList.toggle('motion-paused', paused);
      motionToggle.setAttribute('aria-pressed', String(paused));
      motionToggle.textContent = paused ? 'Resume motion' : 'Pause motion';
      try { localStorage.setItem('firststep_partner_motion_paused', paused ? '1' : '0'); } catch {}
    }
    motionToggle.addEventListener('click', () => setMotionPaused(!document.documentElement.classList.contains('motion-paused')));
    try { setMotionPaused(localStorage.getItem('firststep_partner_motion_paused') === '1'); } catch { setMotionPaused(false); }

    const revealItems = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -30px' });
      revealItems.forEach(item => revealObserver.observe(item));
    } else {
      revealItems.forEach(item => item.classList.add('is-visible'));
    }

    $('template').textContent = getTemplate();
    updateCalculator();
    hydratePartnerForm();
    renderSearches();
    renderProspects();
    renderStats();

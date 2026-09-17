const byId = id => document.getElementById(id);
const views = ['loading', 'pathChoice', 'unavailable', 'application', 'status'];
const allowedPaths = new Set(['existing-user', 'affiliate-only']);
const selectedPath = allowedPaths.has(new URLSearchParams(location.search).get('path'))
  ? new URLSearchParams(location.search).get('path')
  : '';

function show(id) {
  for (const view of views) byId(view).hidden = view !== id;
}

function signIn() {
  const returnTo = `${location.pathname}${location.search}`;
  location.replace(`/login.html?returnTo=${encodeURIComponent(returnTo)}`);
}

function render(partner) {
  if (!partner) {
    if (!selectedPath) return show('pathChoice');
    byId('pathLabel').textContent = selectedPath === 'existing-user'
      ? 'Existing 1stStep user — adding a separate partner role'
      : 'Affiliate-only applicant — no Job Agent role or data';
    return show('application');
  }
  show('status');
  const status = ['pending', 'approved', 'rejected'].includes(partner.status) ? partner.status : 'unavailable';
  const copy = {
    pending: ['Application pending', 'Your application is under review. No referral link or commission is active.'],
    approved: ['Partner approved', 'Your partner role is approved. Beta referrals can be attributed, but they do not earn commission.'],
    rejected: ['Application not approved', 'Your partner application was not approved. Contact support if you believe this is an error.'],
    unavailable: ['Status unavailable', 'The saved partner status could not be verified. Contact support before sharing a link.'],
  }[status];
  byId('badge').textContent = status;
  byId('statusTitle').textContent = copy[0];
  byId('statusCopy').textContent = copy[1];
  byId('approved').hidden = status !== 'approved';
  if (status === 'approved') byId('referralLink').value = `https://app.1ststep.ai/app?ref=${encodeURIComponent(partner.code)}`;
}

async function load() {
  show('loading');
  try {
    const response = await fetch('/api/partner', { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) return signIn();
    if (!response.ok) throw new Error(data.error || 'We could not verify your partner status.');
    render(data.partner);
  } catch (error) {
    byId('errorText').textContent = error.message || 'We could not verify your partner status.';
    show('unavailable');
  }
}

byId('retry').addEventListener('click', load);
byId('partnerForm').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = byId('submit');
  submit.disabled = true;
  byId('formStatus').textContent = 'Saving your application…';
  try {
    const response = await fetch('/api/partner', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: byId('displayName').value, code: byId('code').value, path: selectedPath, acceptedTerms: byId('terms').checked }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) return signIn();
    if (!response.ok) throw new Error(data.error || 'Your application could not be saved.');
    render(data.partner);
  } catch (error) {
    byId('formStatus').textContent = error.message || 'Your application could not be saved.';
  } finally {
    submit.disabled = false;
  }
});
byId('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(byId('referralLink').value);
    byId('copyStatus').textContent = 'Link copied.';
  } catch {
    byId('copyStatus').textContent = 'Copy failed. Select the link and copy it manually.';
  }
});

load();

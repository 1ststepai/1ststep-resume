const $ = id => document.getElementById(id);
const views = ['loading', 'unavailable', 'application', 'status'];
function show(id) { views.forEach(view => { $(view).hidden = view !== id; }); }
function render(partner) {
  if (!partner) return show('application');
  show('status');
  const status = ['pending', 'approved', 'rejected'].includes(partner.status) ? partner.status : 'unavailable';
  const copy = {
    pending: ['Application pending', 'We are reviewing your application. Your referral link will appear here after approval.'],
    approved: ['Partner approved', 'Your referral link is active. Beta referrals can be attributed, but they do not earn commission.'],
    rejected: ['Application not approved', 'This application is not approved. Contact support if you believe this is an error.'],
    unavailable: ['Status unavailable', 'We could not interpret the saved partner status. Contact support before sharing a link.'],
  }[status];
  $('badge').textContent = status;
  $('statusTitle').textContent = copy[0];
  $('statusCopy').textContent = copy[1];
  $('approved').hidden = status !== 'approved';
  if (status === 'approved') $('referralLink').value = `https://resume.1ststep.ai/?ref=${encodeURIComponent(partner.code)}`;
}
async function load() {
  show('loading');
  try {
    const response = await fetch('/api/partner', { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 409) return location.replace('/login.html?returnTo=%2Fpartner');
    if (!response.ok) throw new Error(data.error || 'We could not verify your partner status.');
    render(data.partner);
  } catch (error) { $('errorText').textContent = error.message || 'We could not verify your partner status.'; show('unavailable'); }
}
$('retry').addEventListener('click', load);
$('partnerForm').addEventListener('submit', async event => {
  event.preventDefault();
  $('submit').disabled = true; $('formStatus').textContent = 'Saving your application…';
  try {
    const response = await fetch('/api/partner', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: $('displayName').value, code: $('code').value, acceptedTerms: $('terms').checked }), signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) return location.replace('/login.html?returnTo=%2Fpartner');
    if (!response.ok) throw new Error(data.error || 'Your application could not be saved.');
    render(data.partner);
  } catch (error) { $('formStatus').textContent = error.message || 'Your application could not be saved.'; }
  finally { $('submit').disabled = false; }
});
$('copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('referralLink').value); $('copyStatus').textContent = 'Link copied.'; } catch { $('copyStatus').textContent = 'Copy failed. Select the link and copy it manually.'; } });
load();

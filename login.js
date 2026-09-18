const status = document.getElementById('loginStatus');
const retry = document.getElementById('retryLogin');
const mode = new URLSearchParams(location.search).get('mode');
const callback = `${location.origin}/login.html`;
let exchanging = false;

function loadScript(src, publishableKey) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (publishableKey) script.dataset.clerkPublishableKey = publishableKey;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Secure sign-in could not load. Please try again.'));
    document.head.appendChild(script);
  });
}

async function exchange() {
  if (exchanging || !window.Clerk.session) return;
  exchanging = true;
  status.textContent = 'Checking your account and subscription…';
  try {
    const token = await window.Clerk.session.getToken({ skipCache: true });
    if (!token) throw new Error('Your sign-in expired. Please sign in again.');
    const response = await fetch('/api/user-session?action=clerk-exchange', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}', signal: AbortSignal.timeout(25000),
    });
    const data = await response.json();
    if (!response.ok || !data.signedIn) throw new Error(data.error || 'We could not finish signing you in. Please try again.');
    // Display cache only. The server's HttpOnly session authorizes every request.
    localStorage.setItem('1ststep_sub_cache', JSON.stringify({
      email: data.email, tier: data.tier, ts: Date.now(), jobAgentSession: true,
      status: data.status, expiresInDays: data.expiresInDays ?? null,
    }));
    location.replace('/app');
  } catch (error) {
    exchanging = false;
    status.textContent = error.message || 'Sign-in is temporarily unavailable.';
    retry.hidden = false;
  }
}

retry.addEventListener('click', () => { retry.hidden = true; mode !== 'sign-out' && window.Clerk?.session ? exchange() : location.reload(); });

try {
  const response = await fetch('/api/app-config', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Sign-in is temporarily unavailable. Please try again.');
  const configuration = (await response.json()).authentication?.clerk;
  if (!configuration?.enabled) throw new Error('Secure sign-in is not available yet. You can return to the app and use email-code access.');
  // Use this application's verified Clerk origin, never a URL supplied by a query string.
  await loadScript('https://clerk.1ststep.ai/npm/@clerk/clerk-js@6/dist/clerk.browser.js', configuration.publishableKey);
  await window.Clerk.load({
    signInUrl: 'https://accounts.1ststep.ai/sign-in', signUpUrl: 'https://accounts.1ststep.ai/sign-up',
    signInForceRedirectUrl: callback, signUpForceRedirectUrl: callback,
  });
  if (mode === 'sign-out') {
    // Clear both identity and app sessions; this route never exchanges on logout.
    const result = await fetch('/api/user-session', { method: 'DELETE', credentials: 'same-origin' });
    if (!result.ok) throw new Error('Sign-out could not finish. Please try again.');
    await window.Clerk.signOut();
    location.replace('/app');
  } else if (window.Clerk.session) {
    await exchange();
  } else {
    status.textContent = 'Opening your secure 1stStep.ai account…';
    const options = { signInForceRedirectUrl: callback, signUpForceRedirectUrl: callback };
    if (mode === 'sign-up') await window.Clerk.redirectToSignUp(options);
    else await window.Clerk.redirectToSignIn(options);
  }
} catch (error) {
  status.textContent = error.message || 'Secure sign-in is temporarily unavailable.';
  retry.hidden = false;
}

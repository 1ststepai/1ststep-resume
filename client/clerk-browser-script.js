export const PRODUCTION_CLERK_FRONTEND_ORIGIN = 'https://clerk.1ststep.ai';
export const PRODUCTION_CLERK_BROWSER_SCRIPT = 'https://clerk.1ststep.ai/npm/@clerk/clerk-js@6/dist/clerk.browser.js';
export const DEVELOPMENT_CLERK_FRONTEND_ORIGIN = 'https://first-impala-7783.clerk.accounts.dev';
export const DEVELOPMENT_CLERK_BROWSER_SCRIPT = 'https://first-impala-7783.clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js';
const DEVELOPMENT_SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function parsedHttpsOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    if (url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

export function allowedClerkFrontendOrigin(frontendApiUrl, productionKey) {
  const url = parsedHttpsOrigin(frontendApiUrl);
  if (!url) return '';
  if (productionKey) return url.origin === PRODUCTION_CLERK_FRONTEND_ORIGIN ? PRODUCTION_CLERK_FRONTEND_ORIGIN : '';
  const labels = url.hostname.toLowerCase().split('.');
  if (labels.length !== 4 || labels[1] !== 'clerk' || labels[2] !== 'accounts' || labels[3] !== 'dev') return '';
  if (!DEVELOPMENT_SUBDOMAIN.test(labels[0])) return '';
  return `https://${labels[0]}.clerk.accounts.dev`;
}

export function allowedClerkBrowserScriptSrc(frontendApiUrl, productionKey) {
  const origin = allowedClerkFrontendOrigin(frontendApiUrl, productionKey);
  if (productionKey && origin === PRODUCTION_CLERK_FRONTEND_ORIGIN) return PRODUCTION_CLERK_BROWSER_SCRIPT;
  if (!productionKey && origin === DEVELOPMENT_CLERK_FRONTEND_ORIGIN) return DEVELOPMENT_CLERK_BROWSER_SCRIPT;
  return '';
}

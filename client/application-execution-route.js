const GREENHOUSE = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io']);
export function localApplicationRoute(session) {
  if (session?.workerExecution?.status === 'outcome-unknown' || session?.submissionExecution?.status === 'outcome-unknown') return { mode: 'reconcile', href: '', message: 'The previous attempt needs reconciliation. Check its result before opening another application attempt.' };
  if (['Finished', 'Submitted', 'Closed'].includes(session?.state)) return { mode: 'complete', href: '', message: 'This application is no longer open for a new execution attempt.' };
  let url;
  try { url = new URL(session?.role?.directEmployerUrl); } catch { return { mode: 'unavailable', href: '', message: 'A verified employer URL is needed.' }; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return { mode: 'unavailable', href: '', message: 'A secure employer URL is needed.' };
  url.hash = '';
  const supported = GREENHOUSE.has(url.hostname) && (/\/jobs\/\d+(?:\/|$)/.test(url.pathname) || /^\d+$/.test(url.searchParams.get('gh_jid') || ''));
  if (supported && /^[A-Za-z0-9:_-]{8,160}$/.test(session.id || '') && Number.isSafeInteger(session.version) && session.version > 0) {
    url.hash = new URLSearchParams({ '1ststep-session': session.id, '1ststep-version': String(session.version) }).toString();
    return { mode: 'extension', href: url.href, message: 'Open the employer application. 1stStep will help fill the saved answers it can, then stop whenever it needs you.' };
  }
  return { mode: 'manual', href: url.href, message: 'Open the employer application and complete this step there. Come back here when you are finished.' };
}

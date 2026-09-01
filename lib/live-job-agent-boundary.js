const REQUIRED_CSP = Object.freeze({
  'script-src-attr': ["'none'"],
  'style-src-attr': ["'none'"],
  'connect-src': ["'self'"],
  'frame-src': ["'none'"],
  'form-action': ["'self'"],
});

function directives(value) {
  const result = new Map();
  for (const raw of String(value || '').split(';')) {
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    if (parts.length) result.set(parts[0].toLowerCase(), parts.slice(1));
  }
  return result;
}

export function strictConciergeCspIssues(value) {
  const parsed = directives(value);
  const issues = [];
  for (const [name, exactSources] of Object.entries(REQUIRED_CSP)) {
    const actual = parsed.get(name) || [];
    if (actual.join(' ') !== exactSources.join(' ')) issues.push(`CSP_${name.toUpperCase().replaceAll('-', '_')}_NOT_EXACT`);
  }
  for (const name of ['script-src', 'style-src']) {
    const actual = parsed.get(name) || [];
    if (!actual.length) issues.push(`CSP_${name.toUpperCase().replaceAll('-', '_')}_MISSING`);
    if (actual.includes("'unsafe-inline'")) issues.push(`CSP_${name.toUpperCase().replaceAll('-', '_')}_UNSAFE_INLINE`);
    if (actual.includes("'unsafe-eval'")) issues.push(`CSP_${name.toUpperCase().replaceAll('-', '_')}_UNSAFE_EVAL`);
  }
  return [...new Set(issues)];
}

function sriIssues(html) {
  const issues = [];
  if (!/mammoth\.browser\.min\.js"\s+integrity="sha384-[A-Za-z0-9+/=]+"\s+crossorigin="anonymous"/i.test(html)) issues.push('MAMMOTH_SRI_MISSING');
  if (!/pdf\.min\.js"\s+integrity="sha384-[A-Za-z0-9+/=]+"\s+crossorigin="anonymous"/i.test(html)) issues.push('PDFJS_SRI_MISSING');
  return issues;
}

function safeBaseUrl(value) {
  const url = new URL(String(value || 'https://app.1ststep.ai'));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Live boundary URL must be an HTTPS origin without credentials, path, query, or fragment.');
  return url.origin;
}

async function request(fetchImpl, origin, path) {
  return fetchImpl(`${origin}${path}`, {
    method: 'GET', redirect: 'error', headers: { Accept: path.startsWith('/api/') ? 'application/json' : 'text/html', Origin: origin },
  });
}

export async function verifyLiveJobAgentBoundary({ baseUrl = 'https://app.1ststep.ai', fetchImpl = fetch } = {}) {
  const origin = safeBaseUrl(baseUrl);
  const issues = [];
  const routes = {};
  for (const path of ['/concierge', '/concierge.html']) {
    try {
      const response = await request(fetchImpl, origin, path);
      const html = await response.text();
      const csp = response.headers.get('content-security-policy') || '';
      routes[path] = { status: response.status, cspPresent: Boolean(csp), bytes: Buffer.byteLength(html, 'utf8') };
      if (response.status !== 200) issues.push(`ROUTE_${path.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_STATUS_${response.status}`);
      issues.push(...strictConciergeCspIssues(csp).map(issue => `${path}:${issue}`));
      issues.push(...sriIssues(html).map(issue => `${path}:${issue}`));
    } catch {
      routes[path] = { status: null, cspPresent: false, bytes: 0 };
      issues.push(`ROUTE_${path.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_UNREACHABLE`);
    }
  }
  for (const path of ['/api/job-agent-readiness', '/api/job-agent-operations', '/api/concierge-state']) {
    try {
      const response = await request(fetchImpl, origin, path);
      routes[path] = { status: response.status };
      if (response.status !== 401) issues.push(`${path}:UNAUTHENTICATED_STATUS_${response.status}`);
    } catch {
      routes[path] = { status: null };
      issues.push(`${path}:UNREACHABLE`);
    }
  }
  return {
    schemaVersion: 1, checkedAt: new Date().toISOString(), origin, ok: issues.length === 0,
    contentFree: true, containsCandidateValues: false, performsWrites: false, performsExternalApplicationActions: false,
    routes, issues,
  };
}

import assert from 'node:assert/strict';
import { strictConciergeCspIssues, verifyLiveJobAgentBoundary } from '../lib/live-job-agent-boundary.js';

const strictCsp = "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; script-src-attr 'none'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'none'; connect-src 'self'; frame-src 'none'; form-action 'self';";
const html = '<script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js" integrity="sha384-abc=" crossorigin="anonymous"></script><script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" integrity="sha384-def=" crossorigin="anonymous"></script>';
assert.deepEqual(strictConciergeCspIssues(strictCsp), []);
assert.ok(strictConciergeCspIssues("script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self'").includes('CSP_SCRIPT_SRC_UNSAFE_INLINE'));
assert.ok(strictConciergeCspIssues("script-src 'self'; style-src 'self'").includes('CSP_CONNECT_SRC_NOT_EXACT'));

function response(status, body = '', csp = '') { return new Response(body, { status, headers: csp ? { 'Content-Security-Policy': csp } : {} }); }

const safeFetch = async url => url.includes('/api/') ? response(401, '{}') : response(200, html, strictCsp);
let result = await verifyLiveJobAgentBoundary({ baseUrl: 'https://app.example.test', fetchImpl: safeFetch });
assert.equal(result.ok, true);
assert.equal(result.contentFree, true);
assert.equal(result.containsCandidateValues, false);
assert.equal(result.performsWrites, false);
assert.equal(result.routes['/api/job-agent-readiness'].status, 401);

const unsafeCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://analytics.example; frame-src https://checkout.example; form-action 'self' https://checkout.example";
const unsafeFetch = async url => url.endsWith('/api/job-agent-readiness') ? response(200, '{"status":"ready"}') : url.includes('/api/') ? response(401, '{}') : response(200, '<script src="legacy.js"></script>', unsafeCsp);
result = await verifyLiveJobAgentBoundary({ baseUrl: 'https://app.example.test', fetchImpl: unsafeFetch });
assert.equal(result.ok, false);
assert.ok(result.issues.includes('/api/job-agent-readiness:UNAUTHENTICATED_STATUS_200'));
assert.ok(result.issues.some(issue => issue.includes('CSP_SCRIPT_SRC_UNSAFE_INLINE')));
assert.ok(result.issues.some(issue => issue.includes('MAMMOTH_SRI_MISSING')));
assert.equal(JSON.stringify(result).includes('{"status":"ready"}'), false, 'API bodies must not be retained');
await assert.rejects(() => verifyLiveJobAgentBoundary({ baseUrl: 'http://app.example.test', fetchImpl: safeFetch }), /HTTPS origin/);

console.log('Live Job Agent boundary tests passed.');

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  accessSessionToken, allowedOrigins, authenticateApiRequest, authenticateApiRequestOrGuest, clearAccessSessionCookie,
  containsProhibitedSecret, isOriginAllowed, sanitizeModelText, setAccessSessionCookie, verifyAccessToken,
} from '../lib/api-security.js';
import aiHandler from '../api/ai.js';
import capabilityHandler, { isAdminSubject } from '../api/session-capabilities.js';
import jobAgentRunsHandler from '../api/job-agent-runs.js';
import jobAgentConsentHandler from '../api/job-agent-consent.js';
import jobAgentScheduleHandler from '../api/job-agent-schedule.js';
import jobAgentNotificationsHandler from '../api/job-agent-notifications.js';
import applicationPackagesHandler from '../api/application-packages.js';
import applicationPackageArtifactHandler from '../api/application-package-artifact.js';
import applicationPackageRenderHandler from '../api/application-package-render.js';
import applicationSessionsHandler from '../api/application-sessions.js';
import applicationReceiptsHandler from '../api/application-receipts.js';
import applicationAuditHandler from '../api/application-audit.js';
import subscriptionHandler from '../api/subscription.js';
import userSessionHandler from '../api/user-session.js';
import { signInternalWorkerRequest } from '../lib/internal-worker-auth.js';
import { createUserSession } from '../lib/user-session-store.js';

const env = { VERCEL_ENV: 'production', NODE_ENV: 'production', TIER_SECRET: 'x'.repeat(48), VERCEL_URL: 'safe-preview.vercel.app' };
const payload = Buffer.from(`person@example.com|free|${Date.now() + 60_000}`).toString('base64');
const token = `${payload}.${createHmac('sha256', env.TIER_SECRET).update(payload).digest('hex')}`;
const paidPayload = Buffer.from(`subscriber@example.com|complete|${Date.now() + 60_000}`).toString('base64');
const paidToken = `${paidPayload}.${createHmac('sha256', env.TIER_SECRET).update(paidPayload).digest('hex')}`;
class SessionRedisFixture {
  constructor() { this.values = new Map(); this.sets = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async del(key) { this.values.delete(key); return 1; }
  async eval(script, keys, args) {
    if (!script.includes('SCARD')) throw new Error('Unexpected session fixture script.');
    const members = this.sets.get(keys[1]) || new Set();
    this.values.set(keys[0], args[0]); members.add(keys[0]); this.sets.set(keys[1], members); return 'created';
  }
}
const opaqueRedis = new SessionRedisFixture();
const opaqueRuntime = { redis: opaqueRedis, partitionSecret: 'opaque-auth-partition'.padEnd(48, 'x'), dataEncryptionKey: Buffer.alloc(32, 4).toString('base64') };
const opaqueSession = await createUserSession({ ...opaqueRuntime, subject: 'subscriber@example.com', tier: 'complete' });
assert.equal(verifyAccessToken(token, env).subject, 'person@example.com');
assert.equal(verifyAccessToken(`${token}tampered`, env), null);
assert.equal(verifyAccessToken(token, { ...env, TIER_SECRET: 'short' }), null);
assert.ok(allowedOrigins(env).has('https://safe-preview.vercel.app'));
assert.equal(isOriginAllowed({ headers: { origin: 'https://attacker.vercel.app' } }, { env }), false);
assert.equal(isOriginAllowed({ headers: { origin: 'https://safe-preview.vercel.app' } }, { env }), true);
assert.equal(isOriginAllowed({ headers: { host: 'app.1ststep.ai', 'sec-fetch-site': 'same-origin' } }, { env }), true);
assert.equal(isOriginAllowed({ headers: { host: 'app.1ststep.ai', 'x-1ststep-client': 'job-agent' } }, { env }), true);
assert.equal(isOriginAllowed({ headers: { host: 'attacker.example', 'sec-fetch-site': 'same-origin' } }, { env }), false);
assert.equal(isOriginAllowed({ headers: { host: 'app.1ststep.ai' } }, { env }), false);
assert.equal((await authenticateApiRequest({ headers: { origin: 'https://app.1ststep.ai', authorization: `Bearer ${token}` }, socket: {} }, { env })).ok, true);
assert.equal((await authenticateApiRequest({ headers: { origin: 'https://app.1ststep.ai', authorization: `Bearer ${token}` }, socket: {} }, { env, requireOpaqueSession: true })).code, 'SESSION_UPGRADE_REQUIRED');
const encodedCookieToken = encodeURIComponent(token);
const cookieRequest = { headers: { origin: 'https://app.1ststep.ai', cookie: `other=value; __Host-1ststep_session=${encodedCookieToken}` }, socket: {} };
assert.equal(accessSessionToken(cookieRequest), token);
assert.equal((await authenticateApiRequest(cookieRequest, { env })).ok, true);
assert.equal((await authenticateApiRequest(cookieRequest, { env, requireOpaqueSession: true })).code, 'SESSION_UPGRADE_REQUIRED');
const opaqueAuth = await authenticateApiRequest({ headers: { origin: 'https://app.1ststep.ai', cookie: `__Host-1ststep_session=${encodeURIComponent(opaqueSession.token)}` }, socket: {} }, { env, sessionRuntime: opaqueRuntime });
assert.equal(opaqueAuth.ok, true);
assert.equal(opaqueAuth.subject, 'subscriber@example.com');
assert.equal(opaqueAuth.authentication, 'opaque-session');
assert.equal((await authenticateApiRequest({ headers: { origin: 'https://app.1ststep.ai', cookie: `__Host-1ststep_session=${encodeURIComponent(opaqueSession.token)}` }, socket: {} }, { env, sessionRuntime: opaqueRuntime, requireOpaqueSession: true })).ok, true);
assert.equal((await authenticateApiRequestOrGuest({ headers: { origin: 'https://app.1ststep.ai', cookie: '__Host-1ststep_session=invalid' }, socket: {} }, { env })).code, 'AUTH_REQUIRED');
assert.equal((await authenticateApiRequest({ headers: { origin: 'https://app.1ststep.ai' }, socket: {} }, { env })).code, 'AUTH_REQUIRED');
const guestAuth = await authenticateApiRequestOrGuest({ headers: { origin: 'https://app.1ststep.ai' }, socket: { remoteAddress: '127.0.0.1' } }, { env });
assert.equal(guestAuth.ok, true);
assert.equal(guestAuth.guest, true);
assert.match(guestAuth.subject, /^guest:/);
assert.equal((await authenticateApiRequestOrGuest({ headers: { origin: 'https://app.1ststep.ai', authorization: 'Bearer invalid' }, socket: {} }, { env })).code, 'AUTH_REQUIRED');
assert.equal((await authenticateApiRequest({ headers: { origin: 'https://attacker.example' }, socket: {} }, { env })).code, 'ORIGIN_FORBIDDEN');
assert.equal((await authenticateApiRequest({ headers: { origin: 'http://127.0.0.1:4175' }, socket: {} }, { env: { VERCEL_ENV: 'development', NODE_ENV: 'development' } })).ok, true);
assert.equal((await authenticateApiRequest({ headers: { origin: 'http://localhost:4999' }, socket: {} }, { env: { VERCEL_ENV: 'development', NODE_ENV: 'development', TIER_SECRET: 'x'.repeat(48) } })).ok, true);
assert.equal(containsProhibitedSecret('password=hunter2'), true);
assert.equal(containsProhibitedSecret('my password is hunter2'), true);
assert.equal(containsProhibitedSecret('the CAPTCHA answer was traffic-lights'), true);
assert.equal(containsProhibitedSecret('I built password-management workflows.'), false);
assert.equal(sanitizeModelText('safe\u200B text', 100), 'safe text');
assert.equal(isAdminSubject('OWNER@EXAMPLE.COM', { OWNER_ACCESS_EMAILS: 'owner@example.com, second@example.com' }), true);
assert.equal(isAdminSubject('EVAN@1STSTEP.AI', {}), true, 'The verified product owner is an administrator even when deployment configuration drifts.');
assert.equal(isAdminSubject('person@example.com', { OWNER_ACCESS_EMAILS: 'owner@example.com' }), false);

function mockResponse() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

let cookieResponse = mockResponse();
setAccessSessionCookie(cookieResponse, token, { env, maxAgeSeconds: 1200 });
assert.match(cookieResponse.headers['Set-Cookie'], /^__Host-1ststep_session=/);
assert.match(cookieResponse.headers['Set-Cookie'], /HttpOnly/);
assert.match(cookieResponse.headers['Set-Cookie'], /SameSite=Lax/);
assert.match(cookieResponse.headers['Set-Cookie'], /Secure/);
assert.doesNotMatch(cookieResponse.headers['Set-Cookie'], /Domain=/);
cookieResponse = mockResponse();
clearAccessSessionCookie(cookieResponse, { env });
assert.match(String(cookieResponse.headers['Set-Cookie']), /Max-Age=0/);

const previousEnv = { VERCEL_ENV: process.env.VERCEL_ENV, NODE_ENV: process.env.NODE_ENV, TIER_SECRET: process.env.TIER_SECRET, OWNER_ACCESS_EMAILS: process.env.OWNER_ACCESS_EMAILS, OWNER_ACCESS_SECRET: process.env.OWNER_ACCESS_SECRET, JOB_AGENT_RECEIPT_SECRET: process.env.JOB_AGENT_RECEIPT_SECRET, JOB_AGENT_AUDIT_SECRET: process.env.JOB_AGENT_AUDIT_SECRET };
Object.assign(process.env, env);
process.env.VERCEL_ENV = 'development';
process.env.NODE_ENV = 'development';
process.env.OWNER_ACCESS_EMAILS = 'owner@example.com';
process.env.OWNER_ACCESS_SECRET = 'owner-restore-secret-for-http-session-test';
let sessionResponse = mockResponse();
await subscriptionHandler({ method: 'GET', headers: { origin: 'https://app.1ststep.ai', 'x-owner-access-secret': process.env.OWNER_ACCESS_SECRET }, query: { email: 'owner@example.com', client: 'job-agent' }, socket: { remoteAddress: '127.0.0.1' } }, sessionResponse);
assert.equal(sessionResponse.statusCode, 200);
assert.equal(sessionResponse.body.session, 'http-only-development');
assert.equal(sessionResponse.body.tier, 'complete');
assert.equal('tierToken' in sessionResponse.body, false);
assert.match(sessionResponse.headers['Set-Cookie'], /^1ststep_session=/);
assert.match(sessionResponse.headers['Set-Cookie'], /HttpOnly/);
Object.assign(process.env, env);
let apiResponse = mockResponse();
await aiHandler({ method: 'POST', headers: { origin: 'https://app.1ststep.ai', 'content-type': 'application/json' }, body: { callType: 'concierge', content: 'find jobs' }, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 503);
assert.equal(apiResponse.body.code, 'RATE_LIMIT_CONFIGURATION');
apiResponse = mockResponse();
await aiHandler({ method: 'POST', headers: { origin: 'https://attacker.vercel.app', 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: { callType: 'concierge', content: 'find jobs' }, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 403);
apiResponse = mockResponse();
await aiHandler({ method: 'POST', headers: { origin: 'https://app.1ststep.ai', 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: { callType: 'concierge', content: 'otp: 123456' }, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 422);
process.env.OWNER_ACCESS_EMAILS = 'person@example.com';
apiResponse = mockResponse();
await capabilityHandler({ method: 'GET', headers: { origin: 'https://app.1ststep.ai', authorization: `Bearer ${token}` }, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 409);
assert.equal(apiResponse.body.code, 'SESSION_UPGRADE_REQUIRED');
process.env.OWNER_ACCESS_EMAILS = 'owner@example.com';
apiResponse = mockResponse();
await capabilityHandler({ method: 'GET', headers: { origin: 'https://app.1ststep.ai', authorization: `Bearer ${token}` }, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 409);
assert.equal(apiResponse.body.code, 'SESSION_UPGRADE_REQUIRED');
apiResponse = mockResponse();
await capabilityHandler({ method: 'GET', headers: { origin: 'https://app.1ststep.ai', authorization: `Bearer ${paidToken}` }, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 409);
assert.equal(apiResponse.body.code, 'SESSION_UPGRADE_REQUIRED');
apiResponse = mockResponse();
await userSessionHandler({ method: 'POST', headers: { origin: 'https://app.1ststep.ai', 'content-type': 'application/json' }, body: {}, query: { action: 'renew' }, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 401);
apiResponse = mockResponse();
await jobAgentConsentHandler({ method: 'GET', headers: { origin: 'https://app.1ststep.ai' }, body: {}, query: {}, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 401);
assert.equal(apiResponse.body.code, 'AUTH_REQUIRED');
apiResponse = mockResponse();
await jobAgentScheduleHandler({ method: 'GET', headers: { origin: 'https://app.1ststep.ai' }, body: {}, query: {}, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 401);
assert.equal(apiResponse.body.code, 'AUTH_REQUIRED');
apiResponse = mockResponse();
await jobAgentNotificationsHandler({ method: 'GET', headers: { origin: 'https://app.1ststep.ai' }, body: {}, query: {}, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 401);
assert.equal(apiResponse.body.code, 'AUTH_REQUIRED');
apiResponse = mockResponse();
await userSessionHandler({ method: 'DELETE', headers: { origin: 'https://app.1ststep.ai' }, body: {}, query: { scope: 'current' }, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 200);
assert.match(String(apiResponse.headers['Set-Cookie']), /Max-Age=0/);
apiResponse = mockResponse();
await jobAgentRunsHandler({ method: 'POST', headers: { origin: 'https://app.1ststep.ai', authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': 'security_test_1' }, body: { mission: { role: 'buyer' } }, query: {}, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 409);
assert.equal(apiResponse.body.code, 'SESSION_UPGRADE_REQUIRED');
apiResponse = mockResponse();
await jobAgentRunsHandler({ method: 'POST', headers: { origin: 'https://attacker.example', authorization: `Bearer ${paidToken}`, 'content-type': 'application/json', 'idempotency-key': 'security_test_2' }, body: { mission: { role: 'buyer' } }, query: {}, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 403);
for (const [handler, method] of [[applicationPackagesHandler, 'GET'], [applicationPackageArtifactHandler, 'GET'], [applicationPackageRenderHandler, 'POST'], [applicationSessionsHandler, 'GET']]) {
  apiResponse = mockResponse();
  await handler({ method, headers: { origin: 'https://app.1ststep.ai', authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: {}, query: {}, socket: {} }, apiResponse);
  assert.equal(apiResponse.statusCode, 409);
  assert.equal(apiResponse.body.code, 'SESSION_UPGRADE_REQUIRED');
}
apiResponse = mockResponse();
await applicationReceiptsHandler({ method: 'POST', headers: { origin: 'https://app.1ststep.ai', 'content-type': 'application/json' }, body: {}, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 403);
delete process.env.JOB_AGENT_RECEIPT_SECRET;
apiResponse = mockResponse();
await applicationReceiptsHandler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {}, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 503);
assert.equal(apiResponse.body.code, 'WORKER_AUTH_NOT_CONFIGURED');
process.env.JOB_AGENT_RECEIPT_SECRET = 'receipt-security-test-secret'.padEnd(48, 'x');
apiResponse = mockResponse();
await applicationReceiptsHandler({ method: 'POST', headers: { 'content-type': 'application/json', 'x-1ststep-worker-timestamp': String(Date.now()), 'x-1ststep-worker-nonce': 'nonce_security_fixture_1234', 'x-1ststep-worker-signature': '0'.repeat(64) }, body: {}, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 401);
const receiptBody = { action: 'verify-authoritative-receipt', subject: 'subscriber@example.com', sessionId: 'application_fixture_1', version: 1, evidence: {} };
const receiptTimestamp = Date.now();
const receiptNonce = 'nonce_security_valid_1234';
apiResponse = mockResponse();
await applicationReceiptsHandler({ method: 'POST', headers: { 'content-type': 'application/json', 'x-1ststep-worker-timestamp': String(receiptTimestamp), 'x-1ststep-worker-nonce': receiptNonce, 'x-1ststep-worker-signature': signInternalWorkerRequest({ timestamp: receiptTimestamp, nonce: receiptNonce, body: receiptBody, secret: process.env.JOB_AGENT_RECEIPT_SECRET }) }, body: receiptBody, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 503);
assert.equal(apiResponse.body.code, 'APPLICATION_SESSION_RUNTIME_NOT_CONFIGURED');
apiResponse = mockResponse();
await applicationAuditHandler({ method: 'POST', headers: { origin: 'https://app.1ststep.ai', authorization: `Bearer ${token}` }, query: {}, body: { subject: 'subscriber@example.com', id: 'application_fixture_1', head: true }, socket: {} }, apiResponse);
assert.equal(apiResponse.statusCode, 409);
assert.equal(apiResponse.body.code, 'SESSION_UPGRADE_REQUIRED');
for (const [key, value] of Object.entries(previousEnv)) {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
}

console.log('API security boundary tests passed.');

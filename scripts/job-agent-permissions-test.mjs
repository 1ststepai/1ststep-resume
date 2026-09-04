import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import readinessHandler, { authorizeJobAgentReadinessRequest } from '../api/job-agent-readiness.js';
import accountDataHandler from '../api/account-data.js';
import applicantVaultHandler from '../api/applicant-vault.js';
import applicationAuditHandler from '../api/application-audit.js';
import applicationArtifactHandler from '../api/application-package-artifact.js';
import applicationRenderHandler from '../api/application-package-render.js';
import applicationPackagesHandler from '../api/application-packages.js';
import applicationSessionsHandler from '../api/application-sessions.js';
import conciergeStateHandler from '../api/concierge-state.js';
import employerBrowserSessionHandler from '../api/employer-browser-session.js';
import consentHandler from '../api/job-agent-consent.js';
import notificationsHandler from '../api/job-agent-notifications.js';
import operationsHandler from '../api/job-agent-operations.js';
import runsHandler from '../api/job-agent-runs.js';
import scheduleHandler from '../api/job-agent-schedule.js';
import capabilitiesHandler from '../api/session-capabilities.js';
import applicationReceiptsHandler from '../api/application-receipts.js';
import workerHandler from '../api/job-agent-worker.js';
import { createUserSession } from '../lib/user-session-store.js';

const env = {
  VERCEL_ENV: 'production', NODE_ENV: 'production', TIER_SECRET: 'permissions-tier-secret'.padEnd(48, 'x'),
  CRON_SECRET: 'permissions-cron-secret'.padEnd(48, 'x'), OWNER_ACCESS_EMAILS: 'owner@example.test',
};

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    end() { return this; },
  };
}

class SessionRedis {
  constructor() { this.values = new Map(); this.sets = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async eval(script, keys, args) {
    assert.match(script, /SCARD/);
    const members = this.sets.get(keys[1]) || new Set();
    this.values.set(keys[0], args[0]); members.add(keys[0]); this.sets.set(keys[1], members);
    return 'created';
  }
}

const original = { VERCEL_ENV: process.env.VERCEL_ENV, NODE_ENV: process.env.NODE_ENV, TIER_SECRET: process.env.TIER_SECRET, CRON_SECRET: process.env.CRON_SECRET, OWNER_ACCESS_EMAILS: process.env.OWNER_ACCESS_EMAILS };
Object.assign(process.env, env);

const subscriberRoutes = [
  ['account-data', accountDataHandler, 'GET'], ['applicant-vault', applicantVaultHandler, 'GET'],
  ['application-artifact', applicationArtifactHandler, 'GET'], ['application-render', applicationRenderHandler, 'POST'],
  ['application-packages', applicationPackagesHandler, 'GET'], ['application-sessions', applicationSessionsHandler, 'GET'],
  ['concierge-state', conciergeStateHandler, 'GET'], ['employer-browser-session', employerBrowserSessionHandler, 'GET'],
  ['job-agent-consent', consentHandler, 'GET'], ['job-agent-notifications', notificationsHandler, 'GET'],
  ['job-agent-runs', runsHandler, 'GET'], ['job-agent-schedule', scheduleHandler, 'GET'], ['session-capabilities', capabilitiesHandler, 'GET'],
];

for (const [name, handler, method] of subscriberRoutes) {
  const res = response();
  await handler({ method, headers: { origin: 'https://app.1ststep.ai', 'content-type': 'application/json' }, body: {}, query: {}, socket: {} }, res);
  assert.equal(res.statusCode, 401, `${name} must reject an unauthenticated same-origin caller`);
  assert.equal(res.body?.code, 'AUTH_REQUIRED', `${name} must return the common authentication code`);
}

for (const [name, handler, method] of [['application-audit', applicationAuditHandler, 'GET'], ['job-agent-operations', operationsHandler, 'GET'], ['job-agent-readiness', readinessHandler, 'GET']]) {
  const res = response();
  await handler({ method, headers: { origin: 'https://app.1ststep.ai' }, body: {}, query: {}, socket: {} }, res);
  assert.equal(res.statusCode, 401, `${name} must reject an unauthenticated same-origin caller`);
}

const paidPayload = Buffer.from(`subscriber@example.test|complete|${Date.now() + 60_000}`).toString('base64');
const paidToken = `${paidPayload}.${createHmac('sha256', env.TIER_SECRET).update(paidPayload).digest('hex')}`;
const nonAdminReadiness = await authorizeJobAgentReadinessRequest({ headers: { origin: 'https://app.1ststep.ai', authorization: `Bearer ${paidToken}` }, socket: {} }, { env });
assert.equal(nonAdminReadiness.code, 'SESSION_UPGRADE_REQUIRED', 'Readiness must reject legacy bearer authentication before role evaluation.');
const cronReadiness = await authorizeJobAgentReadinessRequest({ headers: { authorization: `Bearer ${env.CRON_SECRET}` }, socket: {} }, { env });
assert.deepEqual(cronReadiness, { ok: true, actor: 'cron', rateLimitSubject: 'job-agent-readiness-cron' });
const wrongCron = await authorizeJobAgentReadinessRequest({ headers: { authorization: `Bearer ${env.CRON_SECRET}x` }, socket: {} }, { env });
assert.equal(wrongCron.ok, false);

const sessionRuntime = { redis: new SessionRedis(), partitionSecret: 'permissions-session-partition'.padEnd(48, 'x'), dataEncryptionKey: Buffer.alloc(32, 7).toString('base64') };
const ownerSession = await createUserSession({ ...sessionRuntime, subject: 'owner@example.test', tier: 'complete' });
const memberSession = await createUserSession({ ...sessionRuntime, subject: 'member@example.test', tier: 'complete' });
const ownerReadiness = await authorizeJobAgentReadinessRequest({ headers: { origin: 'https://app.1ststep.ai', cookie: `__Host-1ststep_session=${encodeURIComponent(ownerSession.token)}` }, socket: {} }, { env, sessionRuntime });
assert.equal(ownerReadiness.ok, true);
assert.equal(ownerReadiness.actor, 'administrator');
const memberReadiness = await authorizeJobAgentReadinessRequest({ headers: { origin: 'https://app.1ststep.ai', cookie: `__Host-1ststep_session=${encodeURIComponent(memberSession.token)}` }, socket: {} }, { env, sessionRuntime });
assert.equal(memberReadiness.status, 403);
assert.equal(memberReadiness.code, 'ADMIN_ACCESS_REQUIRED');

let serviceResponse = response();
await applicationReceiptsHandler({ method: 'POST', headers: { origin: 'https://app.1ststep.ai', 'content-type': 'application/json' }, body: {}, query: {}, socket: {} }, serviceResponse);
assert.equal(serviceResponse.statusCode, 403, 'The receipt mutation must be browser-inaccessible.');
serviceResponse = response();
await workerHandler({ method: 'POST', headers: {}, body: {}, query: {}, socket: {} }, serviceResponse);
assert.equal(serviceResponse.statusCode, 401, 'The background worker must reject calls without the cron secret.');

for (const [key, value] of Object.entries(original)) {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
}

console.log('Executable Job Agent subscriber, administrator, cron, internal-worker, browser-denial, legacy-session, and exact-secret permissions tests passed.');

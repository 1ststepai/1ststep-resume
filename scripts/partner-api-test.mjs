import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const moduleUrl = new URL('../api/partner.js', import.meta.url);
assert.equal(existsSync(moduleUrl), true, 'The authenticated partner API must exist.');
const { createPartnerHandler } = await import(moduleUrl);

class MemoryRedis {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.get(key) ?? null; }
  async set(key, value, options = {}) { if (options.nx && this.data.has(key)) return null; this.data.set(key, value); return 'OK'; }
  async del(key) { return this.data.delete(key) ? 1 : 0; }
}

const configuration = { redis: new MemoryRedis(), secret: 's'.repeat(32), dataEncryptionKey: Buffer.alloc(32, 9) };
const handler = createPartnerHandler({
  configuration: () => configuration,
  authenticate: async req => req.auth || { ok: false, status: 401, code: 'AUTH_REQUIRED' },
  rateLimit: async () => ({ ok: true }),
  administrator: subject => subject === 'admin@example.test',
});

function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
}
async function invoke({ method = 'GET', body = {}, query = {}, subject = '', origin = 'https://app.1ststep.ai' } = {}) {
  const req = { method, body, query, headers: { origin, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) }, auth: subject ? { ok: true, subject, authentication: 'opaque-session' } : null };
  const res = response();
  await handler(req, res);
  return res;
}

assert.equal((await invoke()).statusCode, 401);
const applied = await invoke({ method: 'POST', subject: 'affiliate@example.test', body: {
  displayName: 'Affiliate Applicant', code: 'affiliate-applicant', path: 'affiliate-only', acceptedTerms: true,
} });
assert.equal(applied.statusCode, 202);
assert.equal(applied.body.partner.status, 'pending');
assert.equal(applied.body.partner.jobAgentEntitlementGranted, false);
assert.equal((await invoke({ subject: 'affiliate@example.test' })).body.partner.path, 'affiliate-only');

assert.equal((await invoke({ method: 'POST', subject: 'affiliate@example.test', query: { action: 'review' }, body: {
  code: 'affiliate-applicant', status: 'approved', idempotencyKey: 'review_12345678',
} })).statusCode, 403);
const approved = await invoke({ method: 'POST', subject: 'admin@example.test', query: { action: 'review' }, body: {
  code: 'affiliate-applicant', status: 'approved', idempotencyKey: 'review_12345678',
} });
assert.equal(approved.statusCode, 200);
assert.equal(approved.body.partner.status, 'approved');
assert.equal((await invoke({ method: 'POST', subject: 'affiliate@example.test', query: { action: 'attribute' }, body: {
  code: 'affiliate-applicant',
} })).statusCode, 409, 'An approved partner must not attribute their own account.');

console.log('Partner API tests passed: opaque-session access, affiliate-only isolation, and administrator-only approval.');

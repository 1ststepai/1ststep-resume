import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { createAffiliateHandler } from '../api/affiliates.js';
import { affiliateProgramConfiguration, affiliateIdentityHash, recordAffiliateSignup } from '../lib/affiliate-program.js';

if (process.env.VERCEL_ENV !== 'preview') throw new Error('This runtime test is restricted to VERCEL_ENV=preview.');
process.env.AFFILIATE_PROGRAM_ENABLED = 'true';
if (String(process.env.AFFILIATE_IDENTITY_SECRET || '').length < 32) process.env.AFFILIATE_IDENTITY_SECRET = `preview-runtime-test-${randomUUID()}`;
const configuration = affiliateProgramConfiguration();
if (!configuration.ready) throw new Error('The isolated Preview affiliate runtime is required.');

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const code = `preview-${suffix}`;
const ownerAccountId = `user_PreviewAffiliate${suffix}`;
const otherAccountId = `user_PreviewReferred${suffix}`;
const adminAccountId = `user_PreviewAdmin${suffix}`;
const sql = neon(process.env.AFFILIATE_DATABASE_URL);
const affiliateHandler = createAffiliateHandler({
  authenticate: async req => ({ ok: true, subject: req.headers['x-test-subject'], accountId: req.headers['x-test-account-id'], tier: 'free', authentication: 'opaque-session' }),
  rateLimit: async () => ({ ok: true }),
});

function response() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

async function request({ method = 'GET', query = {}, body = {}, accountId = '', subject = '', origin = 'https://app.1ststep.ai' } = {}) {
  const req = {
    method, query, body,
    headers: {
      origin,
      host: process.env.VERCEL_URL,
      'content-type': 'application/json',
      'x-real-ip': '127.0.0.44',
      'x-test-account-id': accountId,
      'x-test-subject': subject,
    },
    socket: { remoteAddress: '127.0.0.44' },
  };
  const res = response();
  await affiliateHandler(req, res);
  return res;
}

let partnerId = '';
try {
  const owner = { accountId: ownerAccountId, subject: `affiliate-${suffix}@example.test` };
  const other = { accountId: otherAccountId, subject: `referred-${suffix}@example.test` };
  const admin = { accountId: adminAccountId, subject: 'evan@1ststep.ai' };

  let res = await request(owner);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.partner, null);

  res = await request({ method: 'POST', ...owner, body: { action: 'apply', name: 'Preview Partner', code, acceptedTerms: true, idempotencyKey: randomUUID() } });
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.partner.status, 'pending');

  res = await request(other);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.partner, null, 'a different signed-in account must not see the partner ledger');

  res = await request({ method: 'POST', query: { view: 'admin' }, ...other, body: { action: 'approve', code, idempotencyKey: randomUUID() } });
  assert.equal(res.statusCode, 403, 'a non-admin account must not approve an affiliate');

  res = await request({ method: 'POST', query: { view: 'admin' }, ...admin, body: { action: 'approve', code, idempotencyKey: randomUUID() } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.partner.status, 'active');

  res = await request({ method: 'POST', origin: 'https://partners.1ststep.ai', body: { action: 'click', code, clickId: randomUUID() } });
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.recorded, true);

  const attribution = await recordAffiliateSignup({ code, appUserId: otherAccountId, capturedAt: new Date().toISOString() }, { configuration });
  assert.equal(attribution.recorded, true);

  res = await request(owner);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.partner.code, code);
  assert.equal(res.body.partner.status, 'active');
  assert.equal(res.body.partner.clicks, 1);
  assert.equal(res.body.partner.referrals, 1);

  const duplicateOwner = await request({ method: 'POST', ...owner, body: { action: 'apply', name: 'Preview Partner Renamed', code: `${code}-other`, acceptedTerms: true, idempotencyKey: randomUUID() } });
  assert.equal(duplicateOwner.statusCode, 200);
  const ownerRows = await sql`select partner_id, code from affiliate_partners where app_user_id=${ownerAccountId}`;
  assert.equal(ownerRows.length, 1, 'the database must enforce one affiliate profile per app account');
  partnerId = ownerRows[0].partner_id;

  res = await request({ query: { view: 'admin' }, ...admin });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.partners.some(partner => partner.id === partnerId));

  const referredHash = affiliateIdentityHash(otherAccountId, configuration.identitySecret);
  const attributionRows = await sql`select count(*)::int as count from affiliate_attributions where referred_app_user_hash=${referredHash}`;
  assert.equal(Number(attributionRows[0].count), 1);
  console.log('PASS: authenticated application, admin approval, anonymous click, account-ID attribution, private reporting, one-profile constraint, and cross-user rejection.');
} finally {
  if (partnerId) {
    await sql.transaction([
      sql`delete from affiliate_payout_items where payout_id in (select payout_id from affiliate_payouts where partner_id=${partnerId})`,
      sql`delete from affiliate_payouts where partner_id=${partnerId}`,
      sql`delete from affiliate_commission_entries where partner_id=${partnerId}`,
      sql`delete from affiliate_customers where attribution_id in (select attribution_id from affiliate_attributions where partner_id=${partnerId})`,
      sql`delete from affiliate_attributions where partner_id=${partnerId}`,
      sql`delete from affiliate_clicks where partner_id=${partnerId}`,
      sql`delete from affiliate_audit_events where partner_id=${partnerId} or actor_app_user_id in (${ownerAccountId},${adminAccountId})`,
      sql`delete from affiliate_partners where partner_id=${partnerId}`,
    ]).catch(() => undefined);
  }
}

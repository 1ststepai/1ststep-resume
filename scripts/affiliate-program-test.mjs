import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  affiliateIdentityHash, affiliateProgramConfiguration, commissionCents,
  eligibleInvoiceCents, newlyRefundedCents, normalizeAffiliateCode, normalizeAffiliateApplication,
  readAffiliateSummary, recordAffiliateSignup,
} from '../lib/affiliate-program.js';

assert.equal(normalizeAffiliateCode(' Career_Coach--Sarah '), 'career-coach-sarah');
assert.throws(() => normalizeAffiliateCode('---'), /AFFILIATE_CODE_INVALID/);
assert.deepEqual(normalizeAffiliateApplication({ name: ' Career Coach Sarah ', code: 'Sarah_1', acceptedTerms: true }), {
  name: 'Career Coach Sarah', code: 'sarah-1', acceptedTerms: true,
});
assert.equal(affiliateIdentityHash('user_Sarah123', 'test-affiliate-identity-secret'.padEnd(48, 'x')).length, 64);
assert.throws(() => affiliateIdentityHash('sarah@example.com', 'x'.repeat(48)), /ACCOUNT_ID_REQUIRED/);
assert.equal(eligibleInvoiceCents({ amount_paid: 3900, total_excluding_tax: 3900 }), 3900);
assert.equal(eligibleInvoiceCents({ amount_paid: 4200, total_excluding_tax: 3900 }), 3900, 'Tax is not commissionable.');
assert.equal(newlyRefundedCents({ data: { object: { amount_refunded: 1800 }, previous_attributes: { amount_refunded: 600 } } }), 1200, 'Incremental refunds must not reverse the cumulative total twice.');
assert.equal(newlyRefundedCents({ data: { object: { amount_refunded: 600, refunds: { data: [{ amount: 600, status: 'succeeded' }] } } } }), 600);
assert.equal(commissionCents(3900, 3000), 1170);
assert.equal(affiliateProgramConfiguration({}).enabled, false);
assert.equal(affiliateProgramConfiguration({ AFFILIATE_PROGRAM_ENABLED: 'true' }).reason, 'AFFILIATE_DATABASE_URL_MISSING');
assert.equal(affiliateProgramConfiguration({
  AFFILIATE_PROGRAM_ENABLED: 'true', AFFILIATE_DATABASE_URL: 'postgres://example', AFFILIATE_IDENTITY_SECRET: 'x'.repeat(48),
  AFFILIATE_COMMISSIONS_ENABLED: 'true', AFFILIATE_COMMISSION_RATE_BPS: '3000', AFFILIATE_COMMISSION_HOLD_DAYS: '30',
  AFFILIATE_MINIMUM_PAYOUT_CENTS: '5000', AFFILIATE_COMMISSION_POLICY_VERSION: 'paid-launch-v1',
}, () => null).commissionReady, true);

const fixtureRows = [{
  partner_id: '00000000-0000-0000-0000-000000000001', code: 'sarah', display_name: 'Sarah', payout_configured: false, clicks: 10,
  status: 'active', created_at: '2026-09-09T12:00:00.000Z', referrals: 4, paid_referrals: 1, pending_cents: 1170, payable_cents: 0, paid_cents: 0,
}, {
  partner_id: '00000000-0000-0000-0000-000000000002', code: 'pending', display_name: 'Pending', payout_configured: false, clicks: 3,
  status: 'pending', created_at: '2026-09-09T12:00:00.000Z', referrals: 9, paid_referrals: 0, pending_cents: 0, payable_cents: 0, paid_cents: 0,
}];
const configuration = { enabled: true, ready: true, commissionReady: false, minimumPayoutCents: null, getSql: () => async () => fixtureRows };
const publicSummary = await readAffiliateSummary({ configuration, now: new Date('2026-09-09T13:00:00.000Z') });
assert.deepEqual({ activePartners: publicSummary.activePartners, referrals: publicSummary.referrals, paidReferrals: publicSummary.paidReferrals }, { activePartners: 1, referrals: 4, paidReferrals: 1 });
assert.equal(publicSummary.clicks, 10);
assert.equal(JSON.stringify(publicSummary).includes('user_'), false, 'Public summary must not expose account identifiers.');
const adminSummary = await readAffiliateSummary({ configuration, admin: true, now: new Date('2026-09-09T13:00:00.000Z') });
assert.equal(adminSummary.partners[0].conversions, 1);
assert.equal(adminSummary.totals.pendingCents, 1170);
let sqlCalled = false;
const expired = await recordAffiliateSignup({ code: 'sarah', appUserId: 'user_Referred123', capturedAt: '2026-06-01T00:00:00.000Z' }, {
  configuration: { enabled: true, ready: true, identitySecret: 'x'.repeat(48), getSql: () => async () => { sqlCalled = true; return []; } },
  now: new Date('2026-09-09T13:00:00.000Z'),
});
assert.equal(expired.reason, 'ATTRIBUTION_WINDOW_EXPIRED');
assert.equal(sqlCalled, false);

const files = await Promise.all([
  readFile(new URL('../api/user-session.js', import.meta.url), 'utf8'),
  readFile(new URL('../api/stripe-webhook.js', import.meta.url), 'utf8'),
  readFile(new URL('../api/affiliates.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin.html', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/004_affiliate_program.sql', import.meta.url), 'utf8'),
]);
assert.match(files[0], /recordAffiliateSignup/);
assert.match(files[0], /identity\.providerSubject/);
for (const eventType of ['invoice.paid', 'charge.refunded', 'charge.dispute.created']) assert.match(files[1], new RegExp(eventType.replace('.', '\\.')));
assert.match(files[2], /authenticateApiRequest/);
assert.doesNotMatch(files[2], /x-admin-secret/);
assert.match(files[2], /auth\.accountId/);
assert.match(files[3], /Amount currently owed/);
for (const table of ['affiliate_partners', 'affiliate_attributions', 'affiliate_clicks', 'affiliate_commission_entries', 'affiliate_payouts', 'affiliate_audit_events']) assert.match(files[4], new RegExp(table));
assert.match(files[4], /unique index if not exists affiliate_partners_app_user_id_idx/);

console.log('Account-owned affiliate application, attribution, commission math, public redaction, admin authorization, and ledger schema tests passed.');

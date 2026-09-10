import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  affiliateIdentityHash, affiliateProgramConfiguration, commissionCents,
  eligibleInvoiceCents, newlyRefundedCents, normalizeAffiliateCode, normalizeAffiliateRegistration,
  readAffiliateSummary, recordAffiliateSignup,
} from '../lib/affiliate-program.js';

assert.equal(normalizeAffiliateCode(' Career_Coach--Sarah '), 'career-coach-sarah');
assert.throws(() => normalizeAffiliateCode('---'), /AFFILIATE_CODE_INVALID/);
assert.deepEqual(normalizeAffiliateRegistration({ name: ' Career Coach Sarah ', email: 'Sarah@Example.com', code: 'Sarah_1', acceptedTerms: true }), {
  name: 'Career Coach Sarah', email: 'sarah@example.com', code: 'sarah-1', acceptedTerms: true,
});
assert.equal(affiliateIdentityHash('sarah@example.com', 'test-affiliate-identity-secret'.padEnd(48, 'x')).length, 64);
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
  partner_id: '00000000-0000-0000-0000-000000000001', code: 'sarah', display_name: 'Sarah', contact_email: 'sarah@example.com',
  status: 'active', created_at: '2026-09-09T12:00:00.000Z', referrals: 4, paid_referrals: 1, pending_cents: 1170, payable_cents: 0, paid_cents: 0,
}, {
  partner_id: '00000000-0000-0000-0000-000000000002', code: 'pending', display_name: 'Pending', contact_email: 'pending@example.com',
  status: 'pending', created_at: '2026-09-09T12:00:00.000Z', referrals: 9, paid_referrals: 0, pending_cents: 0, payable_cents: 0, paid_cents: 0,
}];
const configuration = { enabled: true, ready: true, commissionReady: false, minimumPayoutCents: null, getSql: () => async () => fixtureRows };
const publicSummary = await readAffiliateSummary({ configuration, now: new Date('2026-09-09T13:00:00.000Z') });
assert.deepEqual({ activePartners: publicSummary.activePartners, referrals: publicSummary.referrals, paidReferrals: publicSummary.paidReferrals }, { activePartners: 1, referrals: 4, paidReferrals: 1 });
assert.equal(JSON.stringify(publicSummary).includes('sarah@example.com'), false, 'Public summary must not expose contact details.');
const adminSummary = await readAffiliateSummary({ configuration, admin: true, now: new Date('2026-09-09T13:00:00.000Z') });
assert.equal(adminSummary.partners[0].email, 'sarah@example.com');
assert.equal(adminSummary.totals.pendingCents, 1170);
let sqlCalled = false;
const expired = await recordAffiliateSignup({ code: 'sarah', email: 'sarah@example.com', capturedAt: '2026-06-01T00:00:00.000Z' }, {
  configuration: { enabled: true, ready: true, identitySecret: 'x'.repeat(48), getSql: () => async () => { sqlCalled = true; return []; } },
  now: new Date('2026-09-09T13:00:00.000Z'),
});
assert.equal(expired.reason, 'ATTRIBUTION_WINDOW_EXPIRED');
assert.equal(sqlCalled, false);

const files = await Promise.all([
  readFile(new URL('../api/notify-signup.js', import.meta.url), 'utf8'),
  readFile(new URL('../api/stripe-webhook.js', import.meta.url), 'utf8'),
  readFile(new URL('../api/affiliates.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin.html', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/004_affiliate_program.sql', import.meta.url), 'utf8'),
]);
assert.match(files[0], /recordAffiliateSignup/);
for (const eventType of ['invoice.paid', 'charge.refunded', 'charge.dispute.created']) assert.match(files[1], new RegExp(eventType.replace('.', '\\.')));
assert.match(files[2], /x-admin-secret/);
assert.match(files[3], /Amount currently owed/);
for (const table of ['affiliate_partners', 'affiliate_attributions', 'affiliate_commission_entries', 'affiliate_payouts']) assert.match(files[4], new RegExp(table));

console.log('Affiliate registration, attribution, commission math, public redaction, admin wiring, and ledger schema tests passed.');

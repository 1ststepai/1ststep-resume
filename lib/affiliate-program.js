import { createHmac, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const CODE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const EMAIL = /^[^\s@]{1,128}@[^\s@]{1,190}$/;
const STRIPE_ID = /^[a-z]+_[A-Za-z0-9_]{6,200}$/;

const enabled = value => String(value || '').toLowerCase() === 'true';
const integer = (value, min, max) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
};
const text = (value, max) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);

export function normalizeAffiliateCode(value) {
  const code = text(value, 80).toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  if (!CODE.test(code)) throw new Error('AFFILIATE_CODE_INVALID');
  return code;
}

export function normalizeAffiliateRegistration(input = {}) {
  const name = text(input.name, 120);
  const email = text(input.email, 320).toLowerCase();
  if (name.length < 2) throw new Error('AFFILIATE_NAME_INVALID');
  if (!EMAIL.test(email)) throw new Error('AFFILIATE_EMAIL_INVALID');
  return { name, email, code: normalizeAffiliateCode(input.code), acceptedTerms: input.acceptedTerms === true };
}

export function affiliateIdentityHash(email, secret) {
  if (Buffer.byteLength(String(secret || ''), 'utf8') < 32) throw new Error('AFFILIATE_IDENTITY_SECRET_REQUIRED');
  const normalized = text(email, 320).toLowerCase();
  if (!EMAIL.test(normalized)) throw new Error('AFFILIATE_EMAIL_INVALID');
  return createHmac('sha256', secret).update(`affiliate-identity.v1|${normalized}`).digest('hex');
}

export function eligibleInvoiceCents(invoice = {}) {
  const paid = integer(invoice.amount_paid, 0, Number.MAX_SAFE_INTEGER) || 0;
  const excludingTax = integer(invoice.total_excluding_tax, 0, Number.MAX_SAFE_INTEGER);
  return excludingTax == null ? paid : Math.min(paid, excludingTax);
}

export function newlyRefundedCents(event = {}) {
  const charge = event.data?.object || {};
  const current = integer(charge.amount_refunded, 0, Number.MAX_SAFE_INTEGER);
  const previous = integer(event.data?.previous_attributes?.amount_refunded, 0, Number.MAX_SAFE_INTEGER);
  if (current != null && previous != null && current >= previous) return current - previous;
  const latestRefund = Array.isArray(charge.refunds?.data)
    ? charge.refunds.data.find(refund => refund?.status !== 'failed' && integer(refund?.amount, 1, Number.MAX_SAFE_INTEGER) != null)
    : null;
  return latestRefund ? integer(latestRefund.amount, 1, Number.MAX_SAFE_INTEGER) : 0;
}

export function commissionCents(grossCents, rateBps) {
  const gross = integer(grossCents, 0, Number.MAX_SAFE_INTEGER);
  const rate = integer(rateBps, 1, 10_000);
  if (gross == null || rate == null) throw new Error('AFFILIATE_COMMISSION_INPUT_INVALID');
  return Math.floor((gross * rate) / 10_000);
}

export function affiliateProgramConfiguration(env = process.env, createSql = neon) {
  if (!enabled(env.AFFILIATE_PROGRAM_ENABLED)) return { enabled: false, ready: false, reason: 'AFFILIATE_PROGRAM_DISABLED' };
  const databaseUrl = String(env.AFFILIATE_DATABASE_URL || '');
  const identitySecret = String(env.AFFILIATE_IDENTITY_SECRET || '');
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) return { enabled: true, ready: false, reason: 'AFFILIATE_DATABASE_URL_MISSING' };
  if (Buffer.byteLength(identitySecret, 'utf8') < 32) return { enabled: true, ready: false, reason: 'AFFILIATE_IDENTITY_SECRET_MISSING' };

  const commissionsEnabled = enabled(env.AFFILIATE_COMMISSIONS_ENABLED);
  const rateBps = integer(env.AFFILIATE_COMMISSION_RATE_BPS, 1, 10_000);
  const holdDays = integer(env.AFFILIATE_COMMISSION_HOLD_DAYS, 0, 180);
  const minimumPayoutCents = integer(env.AFFILIATE_MINIMUM_PAYOUT_CENTS, 1, 1_000_000);
  const policyVersion = text(env.AFFILIATE_COMMISSION_POLICY_VERSION, 80);
  const commissionReady = commissionsEnabled && rateBps != null && holdDays != null && minimumPayoutCents != null && policyVersion.length > 0;

  return {
    enabled: true,
    ready: true,
    commissionsEnabled,
    commissionReady,
    rateBps,
    holdDays,
    minimumPayoutCents,
    policyVersion,
    identitySecret,
    getSql: () => createSql(databaseUrl),
  };
}

function requireStore(configuration) {
  if (!configuration?.enabled || !configuration?.ready) throw new Error(configuration?.reason || 'AFFILIATE_PROGRAM_NOT_CONFIGURED');
  return configuration.getSql();
}

export async function registerAffiliatePartner(input, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  const registration = normalizeAffiliateRegistration(input);
  if (!registration.acceptedTerms) throw new Error('AFFILIATE_TERMS_REQUIRED');
  const sql = requireStore(configuration);
  const partnerId = randomUUID();
  const contactHash = affiliateIdentityHash(registration.email, configuration.identitySecret);
  const rows = await sql`
    insert into affiliate_partners (partner_id, code, display_name, contact_email, contact_hash, status, terms_version, created_at, updated_at)
    values (${partnerId}, ${registration.code}, ${registration.name}, ${registration.email}, ${contactHash}, 'pending', 'beta-2026-09', ${now.toISOString()}, ${now.toISOString()})
    on conflict (code) do update set
      display_name = case when affiliate_partners.contact_hash = excluded.contact_hash then excluded.display_name else affiliate_partners.display_name end,
      contact_email = case when affiliate_partners.contact_hash = excluded.contact_hash then excluded.contact_email else affiliate_partners.contact_email end,
      updated_at = case when affiliate_partners.contact_hash = excluded.contact_hash then excluded.updated_at else affiliate_partners.updated_at end
    returning code, status, contact_hash = ${contactHash} as owned`;
  if (!rows?.[0]?.owned) throw new Error('AFFILIATE_CODE_TAKEN');
  return { code: rows[0].code, status: rows[0].status };
}

export async function recordAffiliateSignup({ code, email, capturedAt }, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  if (!configuration?.enabled) return { recorded: false, reason: configuration?.reason };
  const sql = requireStore(configuration);
  const normalizedCode = normalizeAffiliateCode(code);
  const subjectHash = affiliateIdentityHash(email, configuration.identitySecret);
  const captured = new Date(capturedAt || now);
  const withinWindow = Number.isFinite(captured.getTime()) && captured <= now && captured >= new Date(now.getTime() - 60 * 86_400_000);
  if (!withinWindow) return { recorded: false, reason: 'ATTRIBUTION_WINDOW_EXPIRED' };
  const rows = await sql`
    insert into affiliate_attributions (attribution_id, partner_id, subject_hash, captured_at, signed_up_at, attribution_valid)
    select ${randomUUID()}, partner_id, ${subjectHash}, ${captured.toISOString()}, ${now.toISOString()}, true
    from affiliate_partners where code = ${normalizedCode} and status in ('pending', 'active')
    on conflict (subject_hash) do nothing
    returning attribution_id`;
  return { recorded: rows.length === 1, reason: rows.length === 1 ? null : 'UNKNOWN_PARTNER_OR_EXISTING_ATTRIBUTION' };
}

export async function bindAffiliateStripeCustomer({ email, customerId }, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  if (!configuration?.enabled) return { recorded: false, reason: configuration?.reason };
  if (!STRIPE_ID.test(String(customerId || ''))) throw new Error('AFFILIATE_STRIPE_CUSTOMER_INVALID');
  const sql = requireStore(configuration);
  const subjectHash = affiliateIdentityHash(email, configuration.identitySecret);
  const rows = await sql`
    insert into affiliate_customers (stripe_customer_id, attribution_id, linked_at)
    select ${customerId}, attribution_id, ${now.toISOString()} from affiliate_attributions
    where subject_hash = ${subjectHash} and attribution_valid = true
    on conflict (stripe_customer_id) do nothing
    returning stripe_customer_id`;
  return { recorded: rows.length === 1 };
}

export async function recordAffiliateInvoicePaid({ eventId, invoiceId, customerId, grossCents, currency = 'usd', paidAt }, { configuration = affiliateProgramConfiguration() } = {}) {
  if (!configuration?.enabled) return { recorded: false, reason: configuration?.reason };
  if (!configuration.commissionReady) return { recorded: false, reason: 'AFFILIATE_COMMISSIONS_DISABLED' };
  if (![eventId, invoiceId, customerId].every(value => STRIPE_ID.test(String(value || '')))) throw new Error('AFFILIATE_STRIPE_REFERENCE_INVALID');
  const gross = integer(grossCents, 1, Number.MAX_SAFE_INTEGER);
  if (gross == null || String(currency).toLowerCase() !== 'usd') return { recorded: false, reason: 'AFFILIATE_PAYMENT_INELIGIBLE' };
  const occurredAt = new Date(paidAt || Date.now());
  if (!Number.isFinite(occurredAt.getTime())) throw new Error('AFFILIATE_TIMESTAMP_INVALID');
  const amount = commissionCents(gross, configuration.rateBps);
  const eligibleAt = new Date(occurredAt.getTime() + configuration.holdDays * 86_400_000);
  const sql = requireStore(configuration);
  const rows = await sql`
    insert into affiliate_commission_entries
      (entry_id, partner_id, stripe_event_id, stripe_invoice_id, stripe_customer_id, entry_kind, gross_cents, amount_cents, currency, rate_bps, policy_version, occurred_at, eligible_at)
    select ${randomUUID()}, a.partner_id, ${eventId}, ${invoiceId}, ${customerId}, 'earning', ${gross}, ${amount}, 'usd', ${configuration.rateBps}, ${configuration.policyVersion}, ${occurredAt.toISOString()}, ${eligibleAt.toISOString()}
    from affiliate_customers c join affiliate_attributions a on a.attribution_id = c.attribution_id
    join affiliate_partners p on p.partner_id = a.partner_id
    where c.stripe_customer_id = ${customerId} and p.status = 'active'
    on conflict (stripe_event_id) do nothing
    returning entry_id`;
  return { recorded: rows.length === 1, amountCents: rows.length === 1 ? amount : 0 };
}

export async function recordAffiliateReversal({ eventId, invoiceId, refundedGrossCents, occurredAt }, { configuration = affiliateProgramConfiguration() } = {}) {
  if (!configuration?.enabled) return { recorded: false, reason: configuration?.reason };
  if (![eventId, invoiceId].every(value => STRIPE_ID.test(String(value || '')))) throw new Error('AFFILIATE_STRIPE_REFERENCE_INVALID');
  const refund = integer(refundedGrossCents, 1, Number.MAX_SAFE_INTEGER);
  if (refund == null) return { recorded: false, reason: 'AFFILIATE_REFUND_INVALID' };
  const at = new Date(occurredAt || Date.now());
  const sql = requireStore(configuration);
  const rows = await sql`
    with original as (
      select e.*, coalesce((select sum(abs(r.amount_cents)) from affiliate_commission_entries r where r.reverses_entry_id = e.entry_id), 0) as already_reversed
      from affiliate_commission_entries e where e.stripe_invoice_id = ${invoiceId} and e.entry_kind = 'earning' limit 1
    )
    insert into affiliate_commission_entries
      (entry_id, partner_id, stripe_event_id, stripe_invoice_id, stripe_customer_id, entry_kind, gross_cents, amount_cents, currency, rate_bps, policy_version, occurred_at, eligible_at, reverses_entry_id)
    select ${randomUUID()}, partner_id, ${eventId}, stripe_invoice_id, stripe_customer_id, 'reversal', ${refund},
      -least(amount_cents - already_reversed, ((amount_cents * least(${refund}, gross_cents)) + gross_cents - 1) / gross_cents),
      currency, rate_bps, policy_version, ${at.toISOString()}, ${at.toISOString()}, entry_id
    from original where amount_cents > already_reversed
    on conflict (stripe_event_id) do nothing
    returning entry_id, amount_cents`;
  return { recorded: rows.length === 1, amountCents: rows?.[0]?.amount_cents || 0 };
}

export async function readAffiliateSummary({ configuration = affiliateProgramConfiguration(), admin = false, now = new Date() } = {}) {
  if (!configuration?.enabled || !configuration?.ready) return { available: false, reason: configuration?.reason || 'AFFILIATE_PROGRAM_NOT_CONFIGURED' };
  const sql = requireStore(configuration);
  const rows = await sql`
    select p.partner_id, p.code, p.display_name, p.contact_email, p.status, p.created_at,
      coalesce(a.referrals, 0)::int as referrals,
      coalesce(e.paid_referrals, 0)::int as paid_referrals,
      coalesce(e.pending_cents, 0)::int as pending_cents,
      coalesce(e.payable_cents, 0)::int as payable_cents,
      coalesce(e.paid_cents, 0)::int as paid_cents
    from affiliate_partners p
    left join lateral (
      select count(*)::int as referrals from affiliate_attributions where partner_id = p.partner_id
    ) a on true
    left join lateral (
      select count(distinct case when ce.entry_kind = 'earning' then ce.stripe_customer_id end)::int as paid_referrals,
        sum(case when pi.entry_id is null and ce.eligible_at > ${now.toISOString()} then ce.amount_cents else 0 end)::int as pending_cents,
        sum(case when pi.entry_id is null and ce.eligible_at <= ${now.toISOString()} then ce.amount_cents else 0 end)::int as payable_cents,
        sum(case when pi.entry_id is not null then ce.amount_cents else 0 end)::int as paid_cents
      from affiliate_commission_entries ce left join affiliate_payout_items pi on pi.entry_id = ce.entry_id
      where ce.partner_id = p.partner_id
    ) e on true
    order by p.created_at desc`;
  const totals = rows.reduce((value, row) => ({
    activePartners: value.activePartners + (row.status === 'active' ? 1 : 0),
    referrals: value.referrals + Number(row.referrals || 0),
    paidReferrals: value.paidReferrals + Number(row.paid_referrals || 0),
    pendingCents: value.pendingCents + Number(row.pending_cents || 0),
    payableCents: value.payableCents + Number(row.payable_cents || 0),
    paidCents: value.paidCents + Number(row.paid_cents || 0),
  }), { activePartners: 0, referrals: 0, paidReferrals: 0, pendingCents: 0, payableCents: 0, paidCents: 0 });
  if (!admin) {
    const publicTotals = rows.filter(row => row.status === 'active').reduce((value, row) => ({
      referrals: value.referrals + Number(row.referrals || 0),
      paidReferrals: value.paidReferrals + Number(row.paid_referrals || 0),
    }), { referrals: 0, paidReferrals: 0 });
    return { available: true, activePartners: totals.activePartners, ...publicTotals, updatedAt: now.toISOString() };
  }
  return { available: true, commissionsEnabled: configuration.commissionReady, minimumPayoutCents: configuration.minimumPayoutCents, totals, partners: rows.map(row => ({
    id: row.partner_id, code: row.code, name: row.display_name, email: row.contact_email, status: row.status, createdAt: row.created_at,
    referrals: Number(row.referrals || 0), paidReferrals: Number(row.paid_referrals || 0), pendingCents: Number(row.pending_cents || 0), payableCents: Number(row.payable_cents || 0), paidCents: Number(row.paid_cents || 0),
  })), updatedAt: now.toISOString() };
}

export async function setAffiliatePartnerStatus({ code, status }, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  if (!['active', 'suspended'].includes(status)) throw new Error('AFFILIATE_STATUS_INVALID');
  const sql = requireStore(configuration);
  const rows = await sql`update affiliate_partners set status = ${status}, updated_at = ${now.toISOString()} where code = ${normalizeAffiliateCode(code)} returning code, status`;
  if (rows.length !== 1) throw new Error('AFFILIATE_PARTNER_NOT_FOUND');
  return rows[0];
}

export async function recordAffiliatePayout({ code, reference }, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  const payoutReference = text(reference, 160);
  if (!payoutReference) throw new Error('AFFILIATE_PAYOUT_REFERENCE_REQUIRED');
  const sql = requireStore(configuration);
  const payoutId = randomUUID();
  const rows = await sql`
    with partner as (select partner_id from affiliate_partners where code = ${normalizeAffiliateCode(code)} and status = 'active'),
    payable as (
      select e.entry_id, e.amount_cents from affiliate_commission_entries e join partner p on p.partner_id = e.partner_id
      left join affiliate_payout_items pi on pi.entry_id = e.entry_id
      where pi.entry_id is null and e.eligible_at <= ${now.toISOString()} for update of e
    ), balance as (select coalesce(sum(amount_cents), 0)::int as amount_cents, count(*)::int as entry_count from payable),
    payout as (
      insert into affiliate_payouts (payout_id, partner_id, amount_cents, currency, method, reference, paid_at)
      select ${payoutId}, partner_id, balance.amount_cents, 'usd', 'paypal', ${payoutReference}, ${now.toISOString()} from partner cross join balance
      where balance.amount_cents >= ${configuration.minimumPayoutCents}
      returning payout_id, amount_cents
    ), items as (
      insert into affiliate_payout_items (payout_id, entry_id)
      select payout.payout_id, payable.entry_id from payout cross join payable returning entry_id
    )
    select payout.amount_cents, (select count(*)::int from items) as entry_count from payout`;
  if (rows.length !== 1) throw new Error('AFFILIATE_PAYOUT_NOT_READY');
  return { payoutId, amountCents: Number(rows[0].amount_cents), entryCount: Number(rows[0].entry_count) };
}

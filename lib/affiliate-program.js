import { createHmac, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { dataEncryptionKeyringFromEnvironment, encryptJsonEnvelope } from './data-encryption-keyring.js';

const CODE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const EMAIL = /^[^\s@]{1,128}@[^\s@]{1,190}$/;
const ACCOUNT_ID = /^user_[A-Za-z0-9]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_ID = /^[a-z]+_[A-Za-z0-9_]{6,200}$/;
const enabled = value => String(value || '').toLowerCase() === 'true';
const text = (value, max) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
const integer = (value, min, max) => Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;

function accountId(value) {
  const id = String(value || '');
  if (!ACCOUNT_ID.test(id)) throw new Error('AFFILIATE_ACCOUNT_ID_REQUIRED');
  return id;
}
function idempotencyKey(value) {
  const key = String(value || '');
  if (!UUID.test(key)) throw new Error('AFFILIATE_IDEMPOTENCY_KEY_REQUIRED');
  return key;
}
export function normalizeAffiliateCode(value) {
  const code = text(value, 80).toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  if (!CODE.test(code)) throw new Error('AFFILIATE_CODE_INVALID');
  return code;
}
export function normalizeAffiliateApplication(input = {}) {
  const name = text(input.name, 120);
  if (name.length < 2) throw new Error('AFFILIATE_NAME_INVALID');
  return { name, code: normalizeAffiliateCode(input.code), acceptedTerms: input.acceptedTerms === true };
}
export const normalizeAffiliateRegistration = normalizeAffiliateApplication;
export function affiliateIdentityHash(appUserId, secret) {
  if (Buffer.byteLength(String(secret || ''), 'utf8') < 32) throw new Error('AFFILIATE_IDENTITY_SECRET_REQUIRED');
  return createHmac('sha256', secret).update(`affiliate-account.v2|${accountId(appUserId)}`).digest('hex');
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
  const latest = Array.isArray(charge.refunds?.data) ? charge.refunds.data.find(item => item?.status !== 'failed' && integer(item?.amount, 1, Number.MAX_SAFE_INTEGER) != null) : null;
  return latest ? integer(latest.amount, 1, Number.MAX_SAFE_INTEGER) : 0;
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
  let dataEncryptionKey = null;
  try { dataEncryptionKey = dataEncryptionKeyringFromEnvironment(env); } catch { /* payout setup remains unavailable */ }
  const commissionsEnabled = enabled(env.AFFILIATE_COMMISSIONS_ENABLED);
  const rateBps = integer(env.AFFILIATE_COMMISSION_RATE_BPS, 1, 10_000);
  const holdDays = integer(env.AFFILIATE_COMMISSION_HOLD_DAYS, 0, 180);
  const minimumPayoutCents = integer(env.AFFILIATE_MINIMUM_PAYOUT_CENTS, 1, 1_000_000);
  const policyVersion = text(env.AFFILIATE_COMMISSION_POLICY_VERSION, 80);
  const commissionReady = commissionsEnabled && rateBps != null && holdDays != null && minimumPayoutCents != null && policyVersion.length > 0;
  return { enabled: true, ready: true, commissionsEnabled, commissionReady, rateBps, holdDays, minimumPayoutCents, policyVersion, identitySecret, dataEncryptionKey, getSql: () => createSql(databaseUrl) };
}
function store(configuration) {
  if (!configuration?.enabled || !configuration?.ready) throw new Error(configuration?.reason || 'AFFILIATE_PROGRAM_NOT_CONFIGURED');
  return configuration.getSql();
}

export async function registerAffiliatePartner(input, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  const userId = accountId(input.appUserId);
  const key = idempotencyKey(input.idempotencyKey);
  const application = normalizeAffiliateApplication(input);
  if (!application.acceptedTerms) throw new Error('AFFILIATE_TERMS_REQUIRED');
  const sql = store(configuration);
  try {
    const rows = await sql`
      with receipt as (
        insert into affiliate_audit_events (event_id, idempotency_key, action, actor_app_user_id, occurred_at)
        values (${randomUUID()}, ${key}, 'application_submitted', ${userId}, ${now.toISOString()})
        on conflict (idempotency_key) do nothing returning event_id
      ), partner as (
        insert into affiliate_partners (partner_id, app_user_id, code, display_name, status, terms_version, terms_accepted_at, created_at, updated_at)
        select ${randomUUID()}, ${userId}, ${application.code}, ${application.name}, 'pending', 'beta-2026-09', ${now.toISOString()}, ${now.toISOString()}, ${now.toISOString()} from receipt
        on conflict (app_user_id) do update set
          code = case when affiliate_partners.status in ('pending','rejected') then excluded.code else affiliate_partners.code end,
          display_name = case when affiliate_partners.status in ('pending','rejected') then excluded.display_name else affiliate_partners.display_name end,
          status = case when affiliate_partners.status = 'rejected' then 'pending' else affiliate_partners.status end,
          terms_version = excluded.terms_version, terms_accepted_at = excluded.terms_accepted_at, updated_at = excluded.updated_at
        returning partner_id, code, status
      ), linked as (update affiliate_audit_events set partner_id = partner.partner_id from partner where affiliate_audit_events.idempotency_key = ${key})
      select code, status from partner`;
    if (rows.length) return { code: rows[0].code, status: rows[0].status };
    const replay = await sql`select code, status from affiliate_partners where app_user_id = ${userId}`;
    if (replay.length !== 1) throw new Error('AFFILIATE_IDEMPOTENCY_CONFLICT');
    return { code: replay[0].code, status: replay[0].status, replayed: true };
  } catch (error) {
    if (String(error?.code) === '23505') throw new Error('AFFILIATE_CODE_TAKEN');
    throw error;
  }
}

export async function recordAffiliateClick({ code, clickId }, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  if (!configuration?.enabled) return { recorded: false, reason: configuration?.reason };
  const sql = store(configuration);
  const rows = await sql`insert into affiliate_clicks (click_id, partner_id, recorded_at)
    select ${idempotencyKey(clickId)}, partner_id, ${now.toISOString()} from affiliate_partners where code = ${normalizeAffiliateCode(code)} and status = 'active'
    on conflict (click_id) do nothing returning click_id`;
  return { recorded: rows.length === 1, reason: rows.length === 1 ? null : 'UNKNOWN_PARTNER_OR_REPLAY' };
}

export async function recordAffiliateSignup({ code, appUserId, capturedAt }, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  if (!configuration?.enabled) return { recorded: false, reason: configuration?.reason };
  const sql = store(configuration);
  const userId = accountId(appUserId);
  const subjectHash = affiliateIdentityHash(userId, configuration.identitySecret);
  const captured = new Date(capturedAt || now);
  if (!Number.isFinite(captured.getTime()) || captured > now || captured < new Date(now.getTime() - 60 * 86_400_000)) return { recorded: false, reason: 'ATTRIBUTION_WINDOW_EXPIRED' };
  const rows = await sql`insert into affiliate_attributions (attribution_id, partner_id, referred_app_user_hash, captured_at, signed_up_at, attribution_valid)
    select ${randomUUID()}, partner_id, ${subjectHash}, ${captured.toISOString()}, ${now.toISOString()}, true from affiliate_partners
    where code = ${normalizeAffiliateCode(code)} and status = 'active' and app_user_id <> ${userId}
    on conflict (referred_app_user_hash) do nothing returning attribution_id`;
  return { recorded: rows.length === 1, reason: rows.length === 1 ? null : 'UNKNOWN_PARTNER_SELF_REFERRAL_OR_EXISTING_ATTRIBUTION' };
}

export async function bindAffiliateStripeCustomer({ appUserId, customerId }, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  if (!configuration?.enabled) return { recorded: false, reason: configuration?.reason };
  if (!STRIPE_ID.test(String(customerId || ''))) throw new Error('AFFILIATE_STRIPE_CUSTOMER_INVALID');
  const sql = store(configuration);
  const hash = affiliateIdentityHash(appUserId, configuration.identitySecret);
  const rows = await sql`insert into affiliate_customers (stripe_customer_id, attribution_id, linked_at)
    select ${customerId}, attribution_id, ${now.toISOString()} from affiliate_attributions where referred_app_user_hash = ${hash} and attribution_valid = true
    on conflict (stripe_customer_id) do nothing returning stripe_customer_id`;
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
  const sql = store(configuration);
  const rows = await sql`insert into affiliate_commission_entries
      (entry_id, partner_id, stripe_event_id, stripe_invoice_id, stripe_customer_id, entry_kind, gross_cents, amount_cents, currency, rate_bps, policy_version, occurred_at, eligible_at)
    select ${randomUUID()}, a.partner_id, ${eventId}, ${invoiceId}, ${customerId}, 'earning', ${gross}, ${amount}, 'usd', ${configuration.rateBps}, ${configuration.policyVersion}, ${occurredAt.toISOString()}, ${eligibleAt.toISOString()}
    from affiliate_customers c join affiliate_attributions a on a.attribution_id = c.attribution_id join affiliate_partners p on p.partner_id = a.partner_id
    where c.stripe_customer_id = ${customerId} and p.status = 'active' on conflict (stripe_event_id) do nothing returning entry_id`;
  return { recorded: rows.length === 1, amountCents: rows.length === 1 ? amount : 0 };
}

export async function recordAffiliateReversal({ eventId, invoiceId, refundedGrossCents, occurredAt }, { configuration = affiliateProgramConfiguration() } = {}) {
  if (!configuration?.enabled) return { recorded: false, reason: configuration?.reason };
  if (![eventId, invoiceId].every(value => STRIPE_ID.test(String(value || '')))) throw new Error('AFFILIATE_STRIPE_REFERENCE_INVALID');
  const refund = integer(refundedGrossCents, 1, Number.MAX_SAFE_INTEGER);
  if (refund == null) return { recorded: false, reason: 'AFFILIATE_REFUND_INVALID' };
  const at = new Date(occurredAt || Date.now());
  const sql = store(configuration);
  const rows = await sql`with original as (
      select e.*, coalesce((select sum(abs(r.amount_cents)) from affiliate_commission_entries r where r.reverses_entry_id = e.entry_id), 0) as already_reversed
      from affiliate_commission_entries e where e.stripe_invoice_id = ${invoiceId} and e.entry_kind = 'earning' limit 1)
    insert into affiliate_commission_entries (entry_id, partner_id, stripe_event_id, stripe_invoice_id, stripe_customer_id, entry_kind, gross_cents, amount_cents, currency, rate_bps, policy_version, occurred_at, eligible_at, reverses_entry_id)
    select ${randomUUID()}, partner_id, ${eventId}, stripe_invoice_id, stripe_customer_id, 'reversal', ${refund},
      -least(amount_cents - already_reversed, ((amount_cents * least(${refund}, gross_cents)) + gross_cents - 1) / gross_cents), currency, rate_bps, policy_version, ${at.toISOString()}, ${at.toISOString()}, entry_id
    from original where amount_cents > already_reversed on conflict (stripe_event_id) do nothing returning entry_id, amount_cents`;
  return { recorded: rows.length === 1, amountCents: rows?.[0]?.amount_cents || 0 };
}

async function rowsFor(sql, now, userId = '') {
  return sql`select p.partner_id, p.code, p.display_name, p.status, p.created_at, p.payout_details_envelope is not null as payout_configured,
      coalesce(c.clicks,0)::int as clicks, coalesce(a.referrals,0)::int as referrals, coalesce(e.paid_referrals,0)::int as paid_referrals,
      coalesce(e.pending_cents,0)::int as pending_cents, coalesce(e.payable_cents,0)::int as payable_cents, coalesce(e.paid_cents,0)::int as paid_cents
    from affiliate_partners p
    left join lateral (select count(*)::int as clicks from affiliate_clicks where partner_id=p.partner_id) c on true
    left join lateral (select count(*)::int as referrals from affiliate_attributions where partner_id=p.partner_id) a on true
    left join lateral (select count(distinct case when ce.entry_kind='earning' then ce.stripe_customer_id end)::int as paid_referrals,
      coalesce(sum(case when pi.entry_id is null and ce.eligible_at>${now.toISOString()} then ce.amount_cents else 0 end),0)::int as pending_cents,
      coalesce(sum(case when pi.entry_id is null and ce.eligible_at<=${now.toISOString()} then ce.amount_cents else 0 end),0)::int as payable_cents,
      coalesce(sum(case when pi.entry_id is not null then ce.amount_cents else 0 end),0)::int as paid_cents
      from affiliate_commission_entries ce left join affiliate_payout_items pi on pi.entry_id=ce.entry_id where ce.partner_id=p.partner_id) e on true
    where (${userId}='' or p.app_user_id=${userId}) order by p.created_at desc`;
}
const partnerView = row => ({ id: row.partner_id, code: row.code, name: row.display_name, status: row.status, createdAt: row.created_at,
  clicks: Number(row.clicks||0), referrals: Number(row.referrals||0), conversions: Number(row.paid_referrals||0), pendingCents: Number(row.pending_cents||0), payableCents: Number(row.payable_cents||0), paidCents: Number(row.paid_cents||0), payoutConfigured: row.payout_configured === true });

export async function readAffiliateSummary({ configuration = affiliateProgramConfiguration(), admin = false, appUserId = '', now = new Date() } = {}) {
  if (!configuration?.enabled || !configuration?.ready) return { available: false, reason: configuration?.reason || 'AFFILIATE_PROGRAM_NOT_CONFIGURED' };
  const sql = store(configuration);
  const userId = appUserId ? accountId(appUserId) : '';
  const rows = await rowsFor(sql, now, userId);
  if (userId) {
    const partner = rows[0] ? partnerView(rows[0]) : null;
    const payouts = partner ? await sql`select payout_id as id, amount_cents, currency, method, paid_at from affiliate_payouts where partner_id=${partner.id} order by paid_at desc limit 100` : [];
    return { available: true, commissionsEnabled: configuration.commissionReady, minimumPayoutCents: configuration.minimumPayoutCents, partner,
      payouts: payouts.map(row => ({ id: row.id, amountCents: Number(row.amount_cents), currency: row.currency, method: row.method, paidAt: row.paid_at })), updatedAt: now.toISOString() };
  }
  const active = rows.filter(row => row.status === 'active');
  const totals = rows.reduce((v,row) => ({ activePartners:v.activePartners+(row.status==='active'?1:0), clicks:v.clicks+Number(row.clicks||0), referrals:v.referrals+Number(row.referrals||0), paidReferrals:v.paidReferrals+Number(row.paid_referrals||0), pendingCents:v.pendingCents+Number(row.pending_cents||0), payableCents:v.payableCents+Number(row.payable_cents||0), paidCents:v.paidCents+Number(row.paid_cents||0) }), {activePartners:0,clicks:0,referrals:0,paidReferrals:0,pendingCents:0,payableCents:0,paidCents:0});
  if (!admin) return { available:true, activePartners:totals.activePartners, clicks:active.reduce((n,row)=>n+Number(row.clicks||0),0), referrals:active.reduce((n,row)=>n+Number(row.referrals||0),0), paidReferrals:active.reduce((n,row)=>n+Number(row.paid_referrals||0),0), updatedAt:now.toISOString() };
  return { available:true, commissionsEnabled:configuration.commissionReady, minimumPayoutCents:configuration.minimumPayoutCents, totals, partners:rows.map(partnerView), updatedAt:now.toISOString() };
}

export async function setAffiliatePartnerStatus({ code, status, actorAppUserId, idempotencyKey: keyValue }, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  if (!['active','rejected','suspended'].includes(status)) throw new Error('AFFILIATE_STATUS_INVALID');
  const sql = store(configuration); const key=idempotencyKey(keyValue);
  const rows = await sql`with receipt as (insert into affiliate_audit_events (event_id,idempotency_key,action,actor_app_user_id,occurred_at)
      values (${randomUUID()},${key},${`status_${status}`},${accountId(actorAppUserId)},${now.toISOString()}) on conflict(idempotency_key) do nothing returning event_id),
    partner as (update affiliate_partners set status=${status},updated_at=${now.toISOString()} where code=${normalizeAffiliateCode(code)} and exists(select 1 from receipt) returning partner_id,code,status),
    linked as (update affiliate_audit_events set partner_id=partner.partner_id from partner where affiliate_audit_events.idempotency_key=${key}) select code,status from partner`;
  if (rows.length!==1) throw new Error('AFFILIATE_PARTNER_NOT_FOUND_OR_REPLAYED');
  return rows[0];
}

export async function saveAffiliatePayoutDetails({ appUserId, method, destination, idempotencyKey: keyValue }, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  const userId=accountId(appUserId); const key=idempotencyKey(keyValue);
  if (method!=='paypal'||!EMAIL.test(String(destination||'').trim())) throw new Error('AFFILIATE_PAYOUT_DETAILS_INVALID');
  if (!configuration.dataEncryptionKey) throw new Error('AFFILIATE_PAYOUT_ENCRYPTION_UNAVAILABLE');
  const sql=store(configuration); const partners=await sql`select partner_id from affiliate_partners where app_user_id=${userId} and status='active'`;
  if (partners.length!==1) throw new Error('AFFILIATE_APPROVAL_REQUIRED');
  const partnerId=partners[0].partner_id;
  const envelope=encryptJsonEnvelope({version:1,method,destination:String(destination).trim().toLowerCase()},{dataEncryptionKey:configuration.dataEncryptionKey,aad:`affiliate-payout|${partnerId}`});
  const rows=await sql`with receipt as (insert into affiliate_audit_events(event_id,partner_id,idempotency_key,action,actor_app_user_id,occurred_at)
      values(${randomUUID()},${partnerId},${key},'payout_details_updated',${userId},${now.toISOString()}) on conflict(idempotency_key) do nothing returning event_id)
    update affiliate_partners set payout_method='paypal',payout_details_envelope=${JSON.stringify(envelope)}::jsonb,updated_at=${now.toISOString()} where partner_id=${partnerId} and exists(select 1 from receipt) returning partner_id`;
  return {saved:rows.length===1,replayed:rows.length===0};
}

export async function recordAffiliatePayout({ code, reference, actorAppUserId, idempotencyKey: keyValue }, { configuration = affiliateProgramConfiguration(), now = new Date() } = {}) {
  const payoutReference=text(reference,160); if(!payoutReference) throw new Error('AFFILIATE_PAYOUT_REFERENCE_REQUIRED');
  const sql=store(configuration); const payoutId=randomUUID(); const key=idempotencyKey(keyValue);
  const rows=await sql`with receipt as (insert into affiliate_audit_events(event_id,idempotency_key,action,actor_app_user_id,occurred_at)
      values(${randomUUID()},${key},'payout_recorded',${accountId(actorAppUserId)},${now.toISOString()}) on conflict(idempotency_key) do nothing returning event_id),
    partner as(select partner_id from affiliate_partners where code=${normalizeAffiliateCode(code)} and status='active' and exists(select 1 from receipt)),
    payable as(select e.entry_id,e.amount_cents from affiliate_commission_entries e join partner p on p.partner_id=e.partner_id left join affiliate_payout_items pi on pi.entry_id=e.entry_id where pi.entry_id is null and e.eligible_at<=${now.toISOString()} for update of e),
    balance as(select coalesce(sum(amount_cents),0)::int as amount_cents from payable),
    payout as(insert into affiliate_payouts(payout_id,partner_id,amount_cents,currency,method,reference,paid_at) select ${payoutId},partner_id,balance.amount_cents,'usd','paypal',${payoutReference},${now.toISOString()} from partner cross join balance where balance.amount_cents>=${configuration.minimumPayoutCents} returning payout_id,partner_id,amount_cents),
    items as(insert into affiliate_payout_items(payout_id,entry_id) select payout.payout_id,payable.entry_id from payout cross join payable returning entry_id),
    linked as(update affiliate_audit_events set partner_id=payout.partner_id from payout where affiliate_audit_events.idempotency_key=${key})
    select payout.amount_cents,(select count(*)::int from items) as entry_count from payout`;
  if(rows.length!==1) throw new Error('AFFILIATE_PAYOUT_NOT_READY_OR_REPLAYED');
  return {payoutId,amountCents:Number(rows[0].amount_cents),entryCount:Number(rows[0].entry_count)};
}

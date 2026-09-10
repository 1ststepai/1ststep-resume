create table if not exists affiliate_partners (
  partner_id uuid primary key,
  app_user_id text not null unique check (app_user_id ~ '^user_[A-Za-z0-9]+$'),
  code text not null unique check (code ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  display_name text not null,
  contact_email text,
  contact_hash char(64),
  status text not null check (status in ('pending','active','rejected','suspended')),
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  payout_method text check (payout_method is null or payout_method = 'paypal'),
  payout_details_envelope jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists affiliate_attributions (
  attribution_id uuid primary key,
  partner_id uuid not null references affiliate_partners(partner_id),
  subject_hash char(64),
  referred_app_user_hash char(64) not null unique,
  captured_at timestamptz not null,
  signed_up_at timestamptz not null,
  attribution_valid boolean not null
);

alter table affiliate_partners add column if not exists app_user_id text;
alter table affiliate_partners add column if not exists terms_accepted_at timestamptz;
alter table affiliate_partners add column if not exists payout_method text;
alter table affiliate_partners add column if not exists payout_details_envelope jsonb;
alter table affiliate_partners alter column contact_email drop not null;
alter table affiliate_partners alter column contact_hash drop not null;
alter table affiliate_partners drop constraint if exists affiliate_partners_status_check;
alter table affiliate_partners add constraint affiliate_partners_status_check check (status in ('pending','active','rejected','suspended'));
alter table affiliate_partners drop constraint if exists affiliate_partners_app_user_id_check;
alter table affiliate_partners add constraint affiliate_partners_app_user_id_check check (app_user_id ~ '^user_[A-Za-z0-9]+$');
alter table affiliate_partners alter column app_user_id set not null;
alter table affiliate_partners alter column terms_accepted_at set not null;
create unique index if not exists affiliate_partners_app_user_id_idx on affiliate_partners(app_user_id);

alter table affiliate_attributions add column if not exists referred_app_user_hash char(64);
alter table affiliate_attributions alter column subject_hash drop not null;
alter table affiliate_attributions alter column referred_app_user_hash set not null;
create unique index if not exists affiliate_attributions_app_user_idx on affiliate_attributions(referred_app_user_hash);

create table if not exists affiliate_clicks (
  click_id uuid primary key,
  partner_id uuid not null references affiliate_partners(partner_id),
  recorded_at timestamptz not null
);
create index if not exists affiliate_clicks_partner_idx on affiliate_clicks(partner_id, recorded_at);

create table if not exists affiliate_audit_events (
  event_id uuid primary key,
  partner_id uuid references affiliate_partners(partner_id),
  idempotency_key uuid not null unique,
  action text not null,
  actor_app_user_id text not null check (actor_app_user_id ~ '^user_[A-Za-z0-9]+$'),
  occurred_at timestamptz not null
);
create index if not exists affiliate_audit_partner_idx on affiliate_audit_events(partner_id, occurred_at);

create table if not exists affiliate_customers (
  stripe_customer_id text primary key,
  attribution_id uuid not null unique references affiliate_attributions(attribution_id),
  linked_at timestamptz not null
);

create table if not exists affiliate_commission_entries (
  entry_id uuid primary key,
  partner_id uuid not null references affiliate_partners(partner_id),
  stripe_event_id text not null unique,
  stripe_invoice_id text not null,
  stripe_customer_id text not null,
  entry_kind text not null check (entry_kind in ('earning','reversal')),
  gross_cents integer not null check (gross_cents > 0),
  amount_cents integer not null check ((entry_kind = 'earning' and amount_cents >= 0) or (entry_kind = 'reversal' and amount_cents < 0)),
  currency char(3) not null check (currency = 'usd'),
  rate_bps integer not null check (rate_bps between 1 and 10000),
  policy_version text not null,
  occurred_at timestamptz not null,
  eligible_at timestamptz not null,
  reverses_entry_id uuid references affiliate_commission_entries(entry_id)
);

create unique index if not exists affiliate_commission_invoice_earning_idx on affiliate_commission_entries(stripe_invoice_id) where entry_kind = 'earning';
create index if not exists affiliate_commission_partner_eligible_idx on affiliate_commission_entries(partner_id, eligible_at);

create table if not exists affiliate_payouts (
  payout_id uuid primary key,
  partner_id uuid not null references affiliate_partners(partner_id),
  amount_cents integer not null check (amount_cents > 0),
  currency char(3) not null check (currency = 'usd'),
  method text not null check (method = 'paypal'),
  reference text not null unique,
  paid_at timestamptz not null
);

create table if not exists affiliate_payout_items (
  payout_id uuid not null references affiliate_payouts(payout_id),
  entry_id uuid not null unique references affiliate_commission_entries(entry_id),
  primary key (payout_id, entry_id)
);

revoke all on affiliate_partners, affiliate_attributions, affiliate_clicks, affiliate_customers, affiliate_commission_entries, affiliate_payouts, affiliate_payout_items, affiliate_audit_events from public;

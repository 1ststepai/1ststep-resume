create table if not exists affiliate_partners (
  partner_id uuid primary key,
  code text not null unique check (code ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  display_name text not null,
  contact_email text not null,
  contact_hash char(64) not null,
  status text not null check (status in ('pending','active','suspended')),
  terms_version text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists affiliate_attributions (
  attribution_id uuid primary key,
  partner_id uuid not null references affiliate_partners(partner_id),
  subject_hash char(64) not null unique,
  captured_at timestamptz not null,
  signed_up_at timestamptz not null,
  attribution_valid boolean not null
);

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

revoke all on affiliate_partners, affiliate_attributions, affiliate_customers, affiliate_commission_entries, affiliate_payouts, affiliate_payout_items from public;

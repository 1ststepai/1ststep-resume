import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const databaseUrl = String(process.env.AFFILIATE_DATABASE_URL || '');
if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  throw new Error('AFFILIATE_DATABASE_URL is required.');
}

const migration = await readFile(new URL('../migrations/004_affiliate_program.sql', import.meta.url), 'utf8');
const statements = migration
  .split(/;\s*(?:\r?\n|$)/)
  .map(statement => statement.trim())
  .filter(Boolean);

const sql = neon(databaseUrl);
await sql.transaction(statements.map(statement => sql.query(statement)));

const rows = await sql`
  select count(*)::int as table_count
  from information_schema.tables
  where table_schema = 'public' and table_name = any(${[
    'affiliate_partners', 'affiliate_attributions', 'affiliate_customers',
    'affiliate_clicks', 'affiliate_commission_entries', 'affiliate_payouts', 'affiliate_payout_items', 'affiliate_audit_events',
  ]})`;

if (Number(rows?.[0]?.table_count) !== 8) throw new Error('Affiliate schema verification failed.');

const [identityColumn, uniqueIdentityIndex, attributionColumn] = await Promise.all([
  sql`select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'affiliate_partners' and column_name = 'app_user_id'`,
  sql`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'affiliate_partners' and indexdef ilike '%unique%app_user_id%'`,
  sql`select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'affiliate_attributions' and column_name = 'referred_app_user_hash'`,
]);

if (identityColumn?.[0]?.is_nullable !== 'NO'
  || !/unique/i.test(String(uniqueIdentityIndex?.[0]?.indexdef || ''))
  || attributionColumn?.[0]?.is_nullable !== 'NO') {
  throw new Error('Affiliate account ownership constraints were not applied.');
}

console.log('Affiliate schema applied and verified (8 tables, immutable account ownership constraints active).');

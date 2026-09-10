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
    'affiliate_commission_entries', 'affiliate_payouts', 'affiliate_payout_items',
  ]})`;

if (Number(rows?.[0]?.table_count) !== 6) throw new Error('Affiliate schema verification failed.');
console.log('Affiliate schema applied and verified (6 tables).');

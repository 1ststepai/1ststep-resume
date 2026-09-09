// Destructive synthetic concurrency check. Run only against an isolated branch.
import assert from 'node:assert/strict';
import { Pool } from '@neondatabase/serverless';

if (process.env.JA003_ISOLATED_TEST_DATABASE !== 'true' || process.env.VERCEL_ENV === 'production') {
  throw new Error('JA003_ISOLATED_TEST_DATABASE=true is required. Never run this against Production.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tenantId = '9'.repeat(40);
const lineageId = '90000000-0000-0000-0000-000000000001';
const envelope = JSON.stringify({ algorithm: 'A256GCM', keyId: 'key-1', iv: 'QUJDRA==', tag: 'QUJDRA==', ciphertext: 'QUJDRA==' });
const insertSql = `insert into applicant_facts (
  id, tenant_id, fact_key, fact_version, encrypted_value, provenance,
  confidence, confirmed_at, fact_lineage_id, verification_state, source_type
) values ($1, $2, 'race.key', 1, $3::jsonb, '{}'::jsonb, 0.9, now(), $4, 'user-confirmed', 'user')`;

let first;
let second;
try {
  await pool.query('insert into app_tenants (tenant_id) values ($1)', [tenantId]);
  await pool.query('insert into applicant_fact_lineages (id, tenant_id, fact_key) values ($1, $2, $3)', [lineageId, tenantId, 'race.key']);
  first = await pool.connect();
  second = await pool.connect();
  for (const client of [first, second]) {
    await client.query('begin');
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query('set local role job_agent_backend');
  }

  await first.query(insertSql, ['91000000-0000-0000-0000-000000000001', tenantId, envelope, lineageId]);
  const competing = second.query(insertSql, ['91000000-0000-0000-0000-000000000002', tenantId, envelope, lineageId])
    .then(() => ({ code: null }), error => ({ code: error.code }));
  await new Promise(resolve => setTimeout(resolve, 200));
  await first.query('commit');
  const outcome = await competing;
  assert.equal(outcome.code, '23514');
  await second.query('rollback');

  const stored = await pool.query('select count(*)::integer as count from applicant_facts where tenant_id = $1 and fact_lineage_id = $2', [tenantId, lineageId]);
  assert.equal(stored.rows[0].count, 1);
  console.log('JA-003 concurrent lineage insert serialized: one committed, competing version rejected.');
} finally {
  if (first) first.release();
  if (second) second.release();
  await pool.query('delete from app_tenants where tenant_id = $1', [tenantId]).catch(() => {});
  await pool.end();
}

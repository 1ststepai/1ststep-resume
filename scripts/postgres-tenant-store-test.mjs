import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { identityEmailHash, postgresTenantStoreConfiguration, upsertClerkTenantIdentity } from '../lib/postgres-tenant-store.js';

const tenantId = 'a'.repeat(40);
const queries = [];
function sql(strings, ...values) { const query = { strings: [...strings], values }; queries.push(query); return query; }
sql.transaction = async (items, options) => {
  assert.equal(items.length, 4);
  assert.equal(options.isolationLevel, 'Serializable');
  return [[], [], [{ tenant_id: tenantId }], [{ tenant_id: tenantId }]];
};

assert.equal(postgresTenantStoreConfiguration({}).reason, 'POSTGRES_DISABLED');
assert.equal(postgresTenantStoreConfiguration({ JOB_AGENT_POSTGRES_ENABLED: 'true' }).reason, 'DATABASE_URL_MISSING');
assert.match(identityEmailHash('Person@Example.test', 'x'.repeat(40)), /^[a-f0-9]{64}$/);

const stored = await upsertClerkTenantIdentity({
  tenantId,
  providerSubject: 'user_fixture123',
  emailHash: 'b'.repeat(64),
  configuration: { enabled: true, ready: true, getSql: () => sql },
  now: new Date('2026-09-01T12:00:00.000Z'),
});
assert.deepEqual(stored, { stored: true, tenantId });
assert.match(queries[0].strings.join(''), /set_config\('app\.tenant_id'/);
assert.match(queries[1].strings.join(''), /set local role job_agent_backend/);
assert.equal(queries.some(query => query.values.includes('Person@Example.test')), false, 'Raw email must never be written to Postgres.');

const migration = await readFile(new URL('../migrations/001_job_agent_authoritative_store.sql', import.meta.url), 'utf8');
for (const table of ['app_tenants', 'app_identities', 'applicant_profiles', 'applicant_facts', 'discovered_jobs', 'applications', 'document_versions', 'human_actions', 'audit_events']) {
  assert.match(migration, new RegExp(`create table if not exists ${table}`));
}
assert.match(migration, /force row level security/);
assert.match(migration, /current_setting\(''app\.tenant_id''/);
assert.match(migration, /create role job_agent_backend nologin noinherit nobypassrls/);
assert.match(migration, /for select to job_agent_backend/);
assert.match(migration, /for update to job_agent_backend[\s\S]*with check/);
assert.match(migration, /revoke all on all tables in schema public from anon/);
assert.match(migration, /revoke all on all tables in schema public from authenticated/);
assert.match(migration, /revoke all on all tables in schema public from public/);
assert.doesNotMatch(migration, /password|captcha_answer|otp_value/i);

console.log('Neon schema and identity bootstrap enforce tenant scoping and avoid raw identity storage.');

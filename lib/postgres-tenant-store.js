import { createHmac } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const TENANT_ID = /^[a-f0-9]{40}$/;
const PROVIDER_SUBJECT = /^user_[A-Za-z0-9]+$/;

function enabled(value) { return String(value || '').toLowerCase() === 'true'; }

export function postgresTenantStoreConfiguration(env = process.env, createSql = neon) {
  if (!enabled(env.JOB_AGENT_POSTGRES_ENABLED)) return { enabled: false, ready: false, reason: 'POSTGRES_DISABLED' };
  const databaseUrl = String(env.DATABASE_URL || '');
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) return { enabled: true, ready: false, reason: 'DATABASE_URL_MISSING' };
  return { enabled: true, ready: true, getSql: () => createSql(databaseUrl) };
}

export function identityEmailHash(email, partitionSecret) {
  const secret = String(partitionSecret || '');
  if (secret.length < 32) throw new Error('POSTGRES_PARTITION_SECRET_REQUIRED');
  return createHmac('sha256', secret).update(`identity-email|${String(email || '').trim().toLowerCase()}`).digest('hex');
}

export async function upsertClerkTenantIdentity({ tenantId, providerSubject, emailHash, configuration = postgresTenantStoreConfiguration(), now = new Date() }) {
  if (!configuration.enabled) return { stored: false, reason: configuration.reason };
  if (!configuration.ready) throw new Error(configuration.reason || 'POSTGRES_NOT_CONFIGURED');
  if (!TENANT_ID.test(String(tenantId || ''))) throw new Error('POSTGRES_TENANT_ID_INVALID');
  if (!PROVIDER_SUBJECT.test(String(providerSubject || ''))) throw new Error('POSTGRES_PROVIDER_SUBJECT_INVALID');
  if (!/^[a-f0-9]{64}$/.test(String(emailHash || ''))) throw new Error('POSTGRES_EMAIL_HASH_INVALID');
  if (!Number.isFinite(now.getTime())) throw new Error('POSTGRES_TIMESTAMP_INVALID');
  const sql = configuration.getSql();
  const results = await sql.transaction([
    sql`select set_config('app.tenant_id', ${tenantId}, true)`,
    sql`set local role job_agent_backend`,
    sql`insert into app_tenants (tenant_id, created_at, updated_at)
        values (${tenantId}, ${now.toISOString()}, ${now.toISOString()})
        on conflict (tenant_id) do update set updated_at = excluded.updated_at
        returning tenant_id`,
    sql`insert into app_identities (tenant_id, provider, provider_subject, email_hash, created_at, last_seen_at)
        values (${tenantId}, 'clerk', ${providerSubject}, ${emailHash}, ${now.toISOString()}, ${now.toISOString()})
        on conflict (provider, provider_subject) do update
          set email_hash = excluded.email_hash, last_seen_at = excluded.last_seen_at
          where app_identities.tenant_id = excluded.tenant_id
        returning tenant_id`,
  ], { isolationLevel: 'Serializable' });
  if (!Array.isArray(results?.[3]) || results[3].length !== 1 || results[3][0].tenant_id !== tenantId) {
    throw new Error('POSTGRES_IDENTITY_TENANT_CONFLICT');
  }
  return { stored: true, tenantId };
}

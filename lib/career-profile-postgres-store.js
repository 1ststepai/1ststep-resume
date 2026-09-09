import { createHash, randomUUID } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { validateCareerProfileFact } from './career-profile-fact-policy.js';

const TENANT_ID = /^[a-f0-9]{40}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,128}$/;
const MAX_FACTS_PER_WRITE = 24;

function enabled(value) { return String(value || '').toLowerCase() === 'true'; }

export class CareerProfileStoreError extends Error {
  constructor(code, details = {}) { super(code); this.code = code; this.details = details; }
}

export function careerProfilePostgresConfiguration(env = process.env, createPool = options => new Pool(options)) {
  if (String(env.VERCEL_ENV || '').toLowerCase() !== 'preview') return { enabled: false, ready: false, reason: 'CAREER_PROFILE_PREVIEW_ONLY' };
  if (!enabled(env.CAREER_PROFILE_PREVIEW_ENABLED)) return { enabled: false, ready: false, reason: 'CAREER_PROFILE_PREVIEW_DISABLED' };
  if (!enabled(env.JOB_AGENT_POSTGRES_ENABLED)) return { enabled: true, ready: false, reason: 'POSTGRES_DISABLED' };
  const databaseUrl = String(env.DATABASE_URL || '');
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) return { enabled: true, ready: false, reason: 'DATABASE_URL_MISSING' };
  return {
    enabled: true,
    ready: true,
    createPool: () => createPool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 1_000 }),
  };
}

function assertConfiguration(configuration) {
  if (!configuration?.enabled || !configuration?.ready) throw new CareerProfileStoreError(configuration?.reason || 'CAREER_PROFILE_STORE_NOT_CONFIGURED');
}

function assertTenantId(tenantId) {
  if (!TENANT_ID.test(String(tenantId || ''))) throw new CareerProfileStoreError('CAREER_PROFILE_TENANT_INVALID');
}

function factAad(tenantId, fieldKey) { return `career-profile-fact|${tenantId}|${fieldKey}`; }
function snapshotAad(tenantId, version) { return `career-profile-snapshot|${tenantId}|${version}`; }

function confirmationTimestamp(input, now) {
  if (input.sourceType !== 'legacy-import') return now;
  const parsed = new Date(input.confirmedAt || '');
  const nowDate = new Date(now);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() < Date.UTC(2000, 0, 1) || parsed.getTime() > nowDate.getTime() + 5 * 60_000) {
    throw new CareerProfileStoreError('CAREER_PROFILE_CONFIRMATION_TIMESTAMP_INVALID');
  }
  return parsed.toISOString();
}

function prepareFact(input, { tenantId, dataEncryptionKey, requestIdempotencyKey, now }) {
  const validated = validateCareerProfileFact(input);
  const value = validated.normalizedValue || input.value.trim();
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new CareerProfileStoreError('CAREER_PROFILE_CONFIDENCE_INVALID');
  const provenanceLabel = String(input.provenance || '').trim();
  if (!provenanceLabel || provenanceLabel.length > 160) throw new CareerProfileStoreError('CAREER_PROFILE_PROVENANCE_INVALID');
  if (Object.hasOwn(input, 'autoReuse') || Object.hasOwn(input, 'scope') || Object.hasOwn(input, 'reuse')) throw new CareerProfileStoreError('CAREER_PROFILE_REUSE_GRANT_SEPARATE');
  const idempotencyKey = String(input.idempotencySeed || requestIdempotencyKey || '');
  const idempotencyKeyHash = createHash('sha256').update(idempotencyKey).digest('hex');
  const confirmedAt = confirmationTimestamp(input, now);
  const sourceType = input.sourceType === 'legacy-import' ? 'legacy-import' : input.verificationState === 'document-verified' ? 'document' : 'user';
  return {
    fieldKey: validated.fieldKey,
    encryptedValue: encryptJsonEnvelope({ value }, { dataEncryptionKey, aad: factAad(tenantId, validated.fieldKey) }),
    provenance: { source: sourceType === 'legacy-import' ? 'redis-applicant-vault-v1' : sourceType, provenanceSha256: createHash('sha256').update(provenanceLabel).digest('hex'), idempotencyKeyHash },
    confidence,
    verificationState: input.verificationState,
    sensitivity: validated.sensitivity,
    sourceType,
    confirmedAt,
    expectedVersion: Number.isSafeInteger(input.expectedVersion) && input.expectedVersion >= 0 ? input.expectedVersion : null,
    legacyOnly: input.sourceType === 'legacy-import',
    evidenceHash: createHash('sha256').update(`${tenantId}|${validated.fieldKey}|${value}|${confirmedAt}|${provenanceLabel}`).digest('hex'),
  };
}

async function configureTenantTransaction(client, tenantId, begin = 'BEGIN ISOLATION LEVEL SERIALIZABLE') {
  await client.query(begin);
  await client.query("SET LOCAL statement_timeout = '5000ms'");
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  await client.query('SET LOCAL ROLE job_agent_backend');
}

async function materializeCurrentFacts(client, tenantId, dataEncryptionKey) {
  const result = await client.query(`SELECT fact_key, fact_version, encrypted_value, provenance, confidence, confirmed_at,
    verification_state, sensitivity, source_type FROM applicant_facts
    WHERE tenant_id = $1 AND revoked_at IS NULL AND superseded_at IS NULL ORDER BY fact_key ASC`, [tenantId]);
  return result.rows.map(row => ({
    fieldKey: row.fact_key,
    version: Number(row.fact_version),
    value: decryptJsonEnvelope(row.encrypted_value, { dataEncryptionKey, aad: factAad(tenantId, row.fact_key) }).value,
    provenance: row.provenance?.source || 'unknown',
    confidence: Number(row.confidence),
    confirmedAt: new Date(row.confirmed_at).toISOString(),
    verificationState: row.verification_state,
    sensitivity: row.sensitivity,
    sourceType: row.source_type,
  }));
}

async function persistSnapshot(client, { tenantId, facts, dataEncryptionKey, changeReason, now }) {
  const locked = await client.query('SELECT version FROM applicant_profiles WHERE tenant_id = $1 FOR UPDATE', [tenantId]);
  const profileVersion = locked.rows.length ? Number(locked.rows[0].version) + 1 : 1;
  const envelope = encryptJsonEnvelope({ schemaVersion: 1, facts }, { dataEncryptionKey, aad: snapshotAad(tenantId, profileVersion) });
  await client.query(`INSERT INTO applicant_profiles (tenant_id, version, encrypted_profile, updated_at, schema_version)
    VALUES ($1, $2, $3, $4, 1) ON CONFLICT (tenant_id) DO UPDATE SET version = EXCLUDED.version,
    encrypted_profile = EXCLUDED.encrypted_profile, updated_at = EXCLUDED.updated_at, schema_version = EXCLUDED.schema_version`, [tenantId, profileVersion, envelope, now]);
  await client.query(`INSERT INTO applicant_profile_versions
    (id, tenant_id, profile_version, schema_version, encrypted_profile, change_reason, created_at)
    VALUES ($1, $2, $3, 1, $4, $5, $6)`, [randomUUID(), tenantId, profileVersion, envelope, changeReason, now]);
  return profileVersion;
}

export async function writeCareerProfileFacts({ tenantId, facts, dataEncryptionKey, idempotencyKey, configuration = careerProfilePostgresConfiguration(), now = new Date() }) {
  assertConfiguration(configuration);
  assertTenantId(tenantId);
  if (!SAFE_IDEMPOTENCY_KEY.test(String(idempotencyKey || ''))) throw new CareerProfileStoreError('CAREER_PROFILE_IDEMPOTENCY_KEY_INVALID');
  if (!Array.isArray(facts) || facts.length < 1 || facts.length > MAX_FACTS_PER_WRITE) throw new CareerProfileStoreError('CAREER_PROFILE_FACT_BATCH_INVALID');
  if (!Number.isFinite(now.getTime())) throw new CareerProfileStoreError('CAREER_PROFILE_TIMESTAMP_INVALID');
  const nowIso = now.toISOString();
  const prepared = facts.map(fact => prepareFact(fact, { tenantId, dataEncryptionKey, requestIdempotencyKey: idempotencyKey, now: nowIso }));
  if (new Set(prepared.map(fact => fact.fieldKey)).size !== prepared.length) throw new CareerProfileStoreError('CAREER_PROFILE_FACT_BATCH_DUPLICATE');

  const pool = configuration.createPool();
  let client;
  let committed = false;
  try {
    client = await pool.connect();
    await configureTenantTransaction(client, tenantId);
    await client.query(`INSERT INTO app_tenants (tenant_id, created_at, updated_at) VALUES ($1, $2, $2)
      ON CONFLICT (tenant_id) DO UPDATE SET updated_at = EXCLUDED.updated_at`, [tenantId, nowIso]);
    let replayed = 0;
    for (const fact of prepared) {
      await client.query(`INSERT INTO applicant_fact_lineages (id, tenant_id, fact_key, created_at)
        VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id, fact_key) DO NOTHING`, [randomUUID(), tenantId, fact.fieldKey, nowIso]);
      const lineageResult = await client.query('SELECT id FROM applicant_fact_lineages WHERE tenant_id = $1 AND fact_key = $2 FOR UPDATE', [tenantId, fact.fieldKey]);
      const lineageId = lineageResult.rows[0]?.id;
      if (!lineageId) throw new CareerProfileStoreError('CAREER_PROFILE_LINEAGE_UNAVAILABLE');
      const replay = await client.query(`SELECT fact_version FROM applicant_facts WHERE tenant_id = $1 AND fact_lineage_id = $2
        AND provenance->>'idempotencyKeyHash' = $3 LIMIT 1`, [tenantId, lineageId, fact.provenance.idempotencyKeyHash]);
      if (replay.rows.length) { replayed += 1; continue; }
      const current = await client.query(`SELECT fact_version FROM applicant_facts WHERE tenant_id = $1 AND fact_lineage_id = $2
        ORDER BY fact_version DESC LIMIT 1`, [tenantId, lineageId]);
      const currentVersion = current.rows.length ? Number(current.rows[0].fact_version) : 0;
      if (fact.legacyOnly && currentVersion > 0) throw new CareerProfileStoreError('CAREER_PROFILE_LEGACY_CONFLICT', { fieldKey: fact.fieldKey, currentVersion });
      if (fact.expectedVersion === null || fact.expectedVersion !== currentVersion) throw new CareerProfileStoreError('CAREER_PROFILE_VERSION_CONFLICT', { fieldKey: fact.fieldKey, currentVersion });
      const factId = randomUUID();
      const factVersion = currentVersion + 1;
      await client.query(`INSERT INTO applicant_facts (id, tenant_id, fact_key, fact_version, encrypted_value, provenance,
        confidence, confirmed_at, created_at, fact_lineage_id, verification_state, sensitivity, source_type)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [factId, tenantId, fact.fieldKey, factVersion,
        fact.encryptedValue, fact.provenance, fact.confidence, fact.confirmedAt, nowIso, lineageId, fact.verificationState, fact.sensitivity, fact.sourceType]);
      await client.query(`INSERT INTO applicant_fact_evidence (id, tenant_id, fact_id, fact_version, evidence_type,
        evidence_sha256, verified_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), tenantId, factId,
        factVersion, fact.sourceType === 'legacy-import' ? 'import-record' : fact.sourceType === 'document' ? 'document' : 'user-confirmation',
        fact.evidenceHash, fact.confirmedAt, nowIso]);
    }
    const currentFacts = await materializeCurrentFacts(client, tenantId, dataEncryptionKey);
    if (replayed === prepared.length) {
      const existingProfile = await client.query('SELECT version FROM applicant_profiles WHERE tenant_id = $1', [tenantId]);
      await client.query('COMMIT');
      committed = true;
      return { ok: true, profileVersion: existingProfile.rows.length ? Number(existingProfile.rows[0].version) : 0, facts: currentFacts, replayed, reuseGrantsCreated: 0 };
    }
    const changeReason = prepared.every(fact => fact.sourceType === 'legacy-import') ? 'initial-import' : 'user-confirmed-update';
    const profileVersion = await persistSnapshot(client, { tenantId, facts: currentFacts, dataEncryptionKey, changeReason, now: nowIso });
    await client.query('COMMIT');
    committed = true;
    return { ok: true, profileVersion, facts: currentFacts, replayed, reuseGrantsCreated: 0 };
  } catch (error) {
    if (!committed && client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

export async function readCareerProfile({ tenantId, dataEncryptionKey, configuration = careerProfilePostgresConfiguration() }) {
  assertConfiguration(configuration);
  assertTenantId(tenantId);
  const pool = configuration.createPool();
  let client;
  try {
    client = await pool.connect();
    await configureTenantTransaction(client, tenantId, 'BEGIN READ ONLY');
    const profile = await client.query('SELECT version, updated_at FROM applicant_profiles WHERE tenant_id = $1', [tenantId]);
    const facts = await materializeCurrentFacts(client, tenantId, dataEncryptionKey);
    const grants = await client.query('SELECT count(*)::integer AS count FROM applicant_fact_reuse_scopes WHERE tenant_id = $1 AND revoked_at IS NULL', [tenantId]);
    await client.query('COMMIT');
    return { profileVersion: profile.rows.length ? Number(profile.rows[0].version) : 0,
      updatedAt: profile.rows[0]?.updated_at ? new Date(profile.rows[0].updated_at).toISOString() : null,
      facts, activeReuseGrantCount: Number(grants.rows[0]?.count) || 0 };
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

export async function probeCareerProfileRuntime({ dataEncryptionKey, configuration = careerProfilePostgresConfiguration() } = {}) {
  if (!configuration?.enabled) return { status: 'disabled' };
  if (!configuration?.ready) return { status: 'unavailable' };
  const tenantId = createHash('sha256').update(`career-profile-runtime|${randomUUID()}`).digest('hex').slice(0, 40);
  const otherTenantId = createHash('sha256').update(`career-profile-runtime-other|${randomUUID()}`).digest('hex').slice(0, 40);
  const idempotencyKey = `runtime:${randomUUID()}`;
  let result;
  try {
    const input = { fieldKey: 'skills', value: 'Synthetic runtime fixture', provenance: 'isolated-preview-runtime', confidence: 1, verificationState: 'user-confirmed', expectedVersion: 0 };
    const created = await writeCareerProfileFacts({ tenantId, facts: [input], dataEncryptionKey, idempotencyKey, configuration });
    const replay = await writeCareerProfileFacts({ tenantId, facts: [input], dataEncryptionKey, idempotencyKey, configuration });
    let staleWriteRejected = false;
    try {
      await writeCareerProfileFacts({ tenantId, facts: [{ ...input, value: 'Synthetic stale fixture' }], dataEncryptionKey, idempotencyKey: `runtime:${randomUUID()}`, configuration });
    } catch (error) {
      staleWriteRejected = error instanceof CareerProfileStoreError && error.code === 'CAREER_PROFILE_VERSION_CONFLICT';
    }
    const own = await readCareerProfile({ tenantId, dataEncryptionKey, configuration });
    const other = await readCareerProfile({ tenantId: otherTenantId, dataEncryptionKey, configuration });
    const healthy = created.profileVersion === 1 && replay.profileVersion === 1 && replay.replayed === 1 && staleWriteRejected
      && own.facts.length === 1 && own.facts[0].value === input.value && own.activeReuseGrantCount === 0
      && other.facts.length === 0 && other.profileVersion === 0;
    result = { status: healthy ? 'healthy' : 'unavailable', encryptedRoundTrip: healthy, idempotentReplay: healthy, staleWriteRejected, tenantIsolation: healthy, reuseGrantsCreated: 0 };
  } catch {
    result = { status: 'unavailable' };
  }
  const pool = configuration.createPool();
  let syntheticFixtureDeleted = false;
  try { await pool.query('DELETE FROM app_tenants WHERE tenant_id = $1', [tenantId]); syntheticFixtureDeleted = true; }
  catch { syntheticFixtureDeleted = false; }
  finally { await pool.end().catch(() => {}); }
  return { ...result, syntheticFixtureDeleted };
}
